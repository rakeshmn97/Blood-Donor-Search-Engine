import math
import random
import os
import re
import numpy as np
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from donors.models import Donor
from donors.serializers import DonorSerializer
from donors.predictor import DonorPredictor

# Predefined hospital zones
HOSPITAL_ZONES = {
    "Zone_A_General_Hospital": (8.5241, 76.9366),
    "Zone_B_Medical_College": (8.5470, 76.9012),
    "Zone_C_City_Hospital": (8.4855, 76.9540),
    "Zone_D_Cottage_Hospital": (8.5601, 76.8800),
    "Zone_E_Community_Clinic": (8.5000, 76.9700),
}

def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    # Convert decimal degrees to radians 
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    # Haversine formula 
    dlat = lat2 - lat1 
    dlon = lon2 - lon1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 
    r = 6371 # Radius of earth in kilometers
    return r * c

class DonorViewSet(viewsets.ModelViewSet):
    queryset = Donor.objects.all()
    serializer_class = DonorSerializer
    filterset_fields = ['blood_group', 'availability_status', 'eligible_to_donate']

@api_view(['GET'])
def get_stats(request):
    """
    Aggregate statistics and metadata for the dashboard,
    including loading model metrics from model_report.txt.
    """
    total_donors = Donor.objects.count()
    if total_donors == 0:
        return Response({
            "total_donors": 0,
            "blood_group_counts": {},
            "availability_counts": {},
            "cluster_counts": {},
            "hospital_zones": HOSPITAL_ZONES,
            "model_metrics": {}
        })

    # Aggregations
    blood_groups = Donor.objects.values('blood_group').annotate(count=models_count('donor_id'))
    availability = Donor.objects.values('availability_status').annotate(count=models_count('donor_id'))
    clusters = Donor.objects.values('geo_cluster').annotate(count=models_count('donor_id'))
    eligible_count = Donor.objects.filter(eligible_to_donate=True).count()

    blood_group_counts = {item['blood_group']: item['count'] for item in blood_groups}
    availability_counts = {item['availability_status']: item['count'] for item in availability}
    cluster_counts = {str(item['geo_cluster']): item['count'] for item in clusters if item['geo_cluster'] is not None}

    # Parse model_report.txt for ML metrics
    report_text = ""
    model_metrics = {
        "baseline_lr": {},
        "random_forest": {}
    }
    
    report_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "model_report.txt")),
        r"c:/Users/USER/Desktop/vs AIML/Antigravity/Blood donar search engine/model_report.txt",
        "model_report.txt"
    ]
    
    for path in report_paths:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    report_text = f.read()
                
                # Extract metrics using regex
                # Logistic Regression
                lr_block = re.search(r"--- Logistic Regression \(baseline\) ---\n(.*?)\n\n", report_text, re.DOTALL)
                if lr_block:
                    for line in lr_block.group(1).split("\n"):
                        match = re.match(r"(\w+-\w+|\w+):\s+([\d\.]+)", line)
                        if match:
                            model_metrics["baseline_lr"][match.group(1).lower()] = float(match.group(2))

                # Random Forest
                rf_block = re.search(r"--- Random Forest \(tuned\) ---\n(.*?)\n\n", report_text, re.DOTALL)
                if rf_block:
                    for line in rf_block.group(1).split("\n"):
                        match = re.match(r"(\w+-\w+|\w+):\s+([\d\.]+)", line)
                        if match:
                            model_metrics["random_forest"][match.group(1).lower()] = float(match.group(2))
                break
            except Exception as e:
                print(f"Error reading model report: {e}")

    return Response({
        "total_donors": total_donors,
        "eligible_donors": eligible_count,
        "blood_group_counts": blood_group_counts,
        "availability_counts": availability_counts,
        "cluster_counts": cluster_counts,
        "hospital_zones": HOSPITAL_ZONES,
        "model_metrics": model_metrics,
        "raw_report": report_text
    })

# We import django Count inside the function to avoid name conflicts
from django.db.models import Count as models_count

@api_view(['GET'])
def search_donors(request):
    """
    Search and rank donors near target coordinate matching target blood group.
    Applies geospatial distance and ML response prediction to rank.
    """
    lat_str = request.query_params.get('latitude')
    lon_str = request.query_params.get('longitude')
    blood_group = request.query_params.get('blood_group')
    
    if not lat_str or not lon_str or not blood_group:
        return Response(
            {"error": "Please provide latitude, longitude, and blood_group query parameters."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        query_lat = float(lat_str)
        query_lon = float(lon_str)
    except ValueError:
        return Response(
            {"error": "Latitude and longitude must be valid float numbers."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Weights for scoring (default 50/50 split)
    weight_dist = float(request.query_params.get('weight_distance', 0.5))
    weight_resp = float(request.query_params.get('weight_response', 0.5))

    # Normalize weights so they sum to 1
    total_w = weight_dist + weight_resp
    if total_w > 0:
        weight_dist /= total_w
        weight_resp /= total_w

    # Optional maximum distance filter in km (no limit if not provided)
    max_dist_str = request.query_params.get('max_distance_km')
    max_distance_km = float(max_dist_str) if max_dist_str else None

    # Get donors matching blood group
    donors = Donor.objects.filter(blood_group=blood_group)
    
    # Initialize predictor
    try:
        predictor = DonorPredictor.get_instance()
    except Exception as e:
        return Response(
            {"error": f"ML Predictor failed to load: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    results = []
    for donor in donors:
        # 1. Calculate Geodistance
        distance_km = haversine(query_lat, query_lon, donor.latitude, donor.longitude)

        # Skip donors beyond the requested maximum distance
        if max_distance_km is not None and distance_km > max_distance_km:
            continue
        
        # 2. Get ML response probability
        response_proba = predictor.predict_probability(donor)

        # 3. Calculate distance factor (decay model: 1 / (1 + distance_km))
        # Closer is better, range is (0, 1]
        dist_factor = 1.0 / (1.0 + distance_km)

        # 4. Calculate raw score
        raw_score = (weight_dist * dist_factor) + (weight_resp * response_proba)

        # 5. Apply eligibility/availability penalties
        penalty = 1.0
        status_msg = "Eligible & Available"
        
        if not donor.eligible_to_donate:
            penalty *= 0.05
            status_msg = "Ineligible (Last donation too recent or age limits)"
        
        if donor.availability_status == "Not Available":
            penalty *= 0.05
            status_msg = "Unavailable"
        elif donor.availability_status == "Temporarily Unavailable":
            penalty *= 0.5
            status_msg = "Temporarily Unavailable"

        composite_score = raw_score * penalty

        # Serialized donor data
        donor_data = DonorSerializer(donor).data
        results.append({
            "donor": donor_data,
            "distance_km": round(distance_km, 3),
            "response_probability": round(response_proba, 4),
            "composite_score": round(composite_score, 4),
            "status_message": status_msg,
            "dist_factor": round(dist_factor, 4)
        })

    # Sort by composite score descending, then distance ascending
    results.sort(key=lambda x: (-x['composite_score'], x['distance_km']))

    # Predict what cluster the target search coordinate itself belongs to
    search_geo_cluster = predictor.predict_location_cluster(query_lat, query_lon)

    return Response({
        "query": {
            "latitude": query_lat,
            "longitude": query_lon,
            "blood_group": blood_group,
            "search_geo_cluster": search_geo_cluster
        },
        "weights": {
            "distance": weight_dist,
            "response": weight_resp
        },
        "results_count": len(results),
        "donors": results
    })

@api_view(['POST'])
def simulate_broadcast(request):
    """
    Simulates sending emergency alerts to a list of donor IDs.
    Returns status outcome (Accepted/No Response) for each donor based on
    their ML response probability, along with randomized response times.
    """
    donor_ids = request.data.get('donor_ids', [])
    if not donor_ids:
        return Response(
            {"error": "Please provide a list of donor_ids to contact."},
            status=status.HTTP_400_BAD_REQUEST
        )

    donors = Donor.objects.filter(donor_id__in=donor_ids)
    
    try:
        predictor = DonorPredictor.get_instance()
    except Exception as e:
        return Response(
            {"error": f"ML Predictor failed to load: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    outcomes = []
    for donor in donors:
        # Predict probability
        prob = predictor.predict_probability(donor)
        
        # Determine outreach outcome (binary trial based on predicted prob)
        # If donor is not eligible or unavailable, they should have very low or zero chance
        adjusted_prob = prob
        if not donor.eligible_to_donate or donor.availability_status == "Not Available":
            adjusted_prob = 0.01
        elif donor.availability_status == "Temporarily Unavailable":
            adjusted_prob = prob * 0.1
            
        responded = random.random() < adjusted_prob
        
        if responded:
            outcome_status = "Accepted"
            # Response time is inversely proportional to probability, representing highly motivated donors
            # Base response time is 10s - 300s
            response_time_sec = int(np.clip(random.expovariate(1.0 / (150 * (1 - prob + 0.1))), 10, 300))
            message = f"Donor {donor.name} accepted the request."
        else:
            outcome_status = "No Response"
            response_time_sec = 180  # Timeout duration
            message = f"Outreach timeout. No response received from {donor.name} after 3 minutes."

        outcomes.append({
            "donor_id": donor.donor_id,
            "name": donor.name,
            "phone_number": donor.phone_number,
            "blood_group": donor.blood_group,
            "availability_status": donor.availability_status,
            "predicted_probability": round(prob, 4),
            "outcome": outcome_status,
            "response_time_sec": response_time_sec,
            "message": message
        })

    # Sort simulated outcomes: Accepted first, then by response time
    outcomes.sort(key=lambda x: (x['outcome'] != 'Accepted', x['response_time_sec']))

    return Response({
        "simulation_timestamp": os.environ.get("CURRENT_TIME", "2026-07-16T04:34:44-07:00"),
        "contacted_count": len(outcomes),
        "accepted_count": sum(1 for o in outcomes if o['outcome'] == 'Accepted'),
        "outcomes": outcomes
    })

from django.http import HttpResponse, Http404

@api_view(['GET'])
def get_plot(request, filename):
    """
    Returns the binary content of plot PNGs from the project workspace.
    """
    valid_plots = ['confusion_matrix.png', 'elbow_plot.png', 'feature_importance.png', 'geo_clusters_plot.png']
    if filename not in valid_plots:
        raise Http404("Plot file name not valid.")
        
    possible_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", filename)),
        os.path.join(r"c:/Users/USER/Desktop/vs AIML/Antigravity/Blood donar search engine", filename),
        filename
    ]
    
    file_path = None
    for path in possible_paths:
        if os.path.exists(path):
            file_path = path
            break
            
    if not file_path:
        raise Http404("Plot image file not found.")
        
    with open(file_path, "rb") as f:
        return HttpResponse(f.read(), content_type="image/png")

@api_view(['POST'])
def predict_custom_donor(request):
    """
    Predicts the response probability of a custom donor record.
    Used for the model playground in the frontend.
    """
    data = request.data
    
    class MockDonor:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)
            
    try:
        # Resolve nulls from frontend requests
        days_since = data.get('days_since_last_donation')
        freq = data.get('donation_frequency_days')
        
        donor = MockDonor(
            age=int(data.get('age', 32)),
            gender=data.get('gender', 'Male'),
            blood_group=data.get('blood_group', 'O+'),
            zone=data.get('zone', 'Zone_A_General_Hospital'),
            availability_status=data.get('availability_status', 'Available'),
            total_donations=int(data.get('total_donations', 4)),
            days_since_last_donation=int(days_since) if days_since is not None and str(days_since).strip() != '' else None,
            donation_frequency_days=int(freq) if freq is not None and str(freq).strip() != '' else None,
            eligible_to_donate=bool(data.get('eligible_to_donate', True)),
            geo_cluster=int(data.get('geo_cluster', 0))
        )
        
        predictor = DonorPredictor.get_instance()
        prob = predictor.predict_probability(donor)
        return Response({"probability": round(prob, 4)})
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


