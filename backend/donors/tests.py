from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from donors.models import Donor
from donors.predictor import DonorPredictor

class DonorAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Create some test donors
        Donor.objects.create(
            donor_id="DNR99901",
            name="Test Donor One",
            age=30,
            gender="Male",
            blood_group="O+",
            zone="Zone_A_General_Hospital",
            latitude=8.5241,
            longitude=76.9366,
            phone_number="9123456789",
            total_donations=3,
            last_donation_date="2026-01-01",
            days_since_last_donation=197,
            donation_frequency_days=120,
            availability_status="Available",
            eligible_to_donate=True,
            responded_last_emergency=True,
            geo_cluster=0
        )
        
        Donor.objects.create(
            donor_id="DNR99902",
            name="Test Donor Two",
            age=22,
            gender="Female",
            blood_group="O+",
            zone="Zone_B_Medical_College",
            latitude=8.5470,
            longitude=76.9012,
            phone_number="9876543210",
            total_donations=1,
            last_donation_date="2026-06-01",
            days_since_last_donation=45,  # Too recent -> Ineligible
            donation_frequency_days=None,
            availability_status="Temporarily Unavailable",
            eligible_to_donate=False,
            responded_last_emergency=False,
            geo_cluster=1
        )

    def test_stats_endpoint(self):
        """Test aggregate stats calculation & model report parsing"""
        url = reverse('stats')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_donors'], 2)
        self.assertEqual(response.data['eligible_donors'], 1)
        self.assertIn('O+', response.data['blood_group_counts'])
        self.assertIn('Zone_A_General_Hospital', response.data['hospital_zones'])

    def test_search_endpoint(self):
        """Test geolocation searching and ML sorting"""
        url = reverse('search')
        # Search near general hospital (Zone A) for O+ blood group
        response = self.client.get(url, {
            'latitude': '8.5241',
            'longitude': '76.9366',
            'blood_group': 'O+'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['donors']), 2)
        
        # Verify first is closer (distance ~0km) and eligible (score higher)
        first_donor = response.data['donors'][0]
        self.assertEqual(first_donor['donor']['donor_id'], "DNR99901")
        self.assertEqual(first_donor['distance_km'], 0.0)
        self.assertGreater(first_donor['composite_score'], response.data['donors'][1]['composite_score'])

    def test_broadcast_endpoint(self):
        """Test outreach simulation trigger"""
        url = reverse('broadcast')
        response = self.client.post(url, {
            'donor_ids': ["DNR99901"]
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['contacted_count'], 1)
        self.assertEqual(len(response.data['outcomes']), 1)
        self.assertEqual(response.data['outcomes'][0]['donor_id'], "DNR99901")

    def test_predict_custom_donor_endpoint(self):
        """Test model playground custom prediction"""
        url = reverse('predict')
        response = self.client.post(url, {
            'age': 35,
            'gender': 'Male',
            'blood_group': 'O+',
            'availability_status': 'Available',
            'total_donations': 5,
            'days_since_last_donation': 150,
            'donation_frequency_days': 100,
            'eligible_to_donate': True,
            'geo_cluster': 2
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('probability', response.data)
        self.assertGreater(response.data['probability'], 0.0)
