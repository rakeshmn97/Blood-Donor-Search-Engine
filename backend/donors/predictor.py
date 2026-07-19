import joblib
import os
import pandas as pd
import numpy as np
import warnings

# Suppress sklearn unpickling warnings
from sklearn.exceptions import InconsistentVersionWarning
warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
warnings.filterwarnings("ignore", category=UserWarning)

class DonorPredictor:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        # Try different possible paths to find the pickle file
        possible_paths = [
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "donor_response_model.pkl")),
            r"c:/Users/USER/Desktop/vs AIML/Antigravity/Blood donar search engine/donor_response_model.pkl",
            "donor_response_model.pkl"
        ]
        
        loaded = False
        for path in possible_paths:
            if os.path.exists(path):
                try:
                    data = joblib.load(path)
                    self.model = data["model"]
                    self.feature_cols = data["feature_cols"]
                    self.label_encoders = data["label_encoders"]
                    self.geo_kmeans = data["geo_kmeans"]
                    loaded = True
                    print(f"Successfully loaded predictor model from: {path}")
                    break
                except Exception as e:
                    print(f"Failed to load from {path}: {e}")
        
        if not loaded:
            raise FileNotFoundError("Could not locate or load donor_response_model.pkl in any of the expected paths.")

    def predict_probability(self, donor):
        """
        Extracts features from a Donor model instance, handles encoding and null values,
        and predicts the response likelihood.
        """
        # Read values from DB model
        gender_val = donor.gender
        blood_val = donor.blood_group
        zone_val = donor.zone
        avail_val = donor.availability_status
        
        # Encoders fallback helper
        def encode(le, val):
            if val in le.classes_:
                return le.transform([val])[0]
            else:
                # Return the index of the first class as fallback
                return 0

        gender_enc = encode(self.label_encoders["gender"], gender_val)
        blood_group_enc = encode(self.label_encoders["blood_group"], blood_val)
        zone_enc = encode(self.label_encoders["zone"], zone_val)
        availability_enc = encode(self.label_encoders["availability"], avail_val)
        
        # Format missing numerical intervals as 9999 (matching training preprocessing)
        days_since = donor.days_since_last_donation if donor.days_since_last_donation is not None else 9999
        freq = donor.donation_frequency_days if donor.donation_frequency_days is not None else 9999
        
        # Construct feature dict matching the feature columns order
        feature_dict = {
            "age": donor.age,
            "gender_enc": gender_enc,
            "blood_group_enc": blood_group_enc,
            "zone_enc": zone_enc,
            "geo_cluster": donor.geo_cluster if donor.geo_cluster is not None else 0,
            "total_donations": donor.total_donations,
            "days_since_last_donation": days_since,
            "donation_frequency_days": freq,
            "availability_enc": availability_enc,
            "eligible_to_donate": 1 if donor.eligible_to_donate else 0
        }
        
        # Ensure correct column ordering
        feature_vector = [feature_dict[col] for col in self.feature_cols]
        
        # Get probability of class 1 (responded)
        # model.predict_proba returns array of shape (n_samples, n_classes)
        proba = self.model.predict_proba([feature_vector])[0][1]
        return float(proba)

    def predict_location_cluster(self, lat, lon):
        """
        Predicts which geographic cluster a given coordinate (lat, lon) belongs to.
        """
        cluster = self.geo_kmeans.predict([[lat, lon]])[0]
        return int(cluster)
