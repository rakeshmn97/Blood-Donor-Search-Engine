"""
Synthetic Blood Donor Dataset Generator
----------------------------------------
Generates a realistic synthetic dataset simulating a hospital blood donor
registry, suitable for:
  - Supervised learning (predicting donor response / eligibility)
  - Unsupervised learning (geospatial clustering, donor segmentation)

No real personal data is used. Names, phone numbers, and coordinates
are all synthetically generated.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random

# ----------------------------
# Reproducibility
# ----------------------------
SEED = 42
np.random.seed(SEED)
random.seed(SEED)

N_DONORS = 2000

# ----------------------------
# Name pools (synthetic, no Faker dependency needed)
# ----------------------------
first_names = [
    "Aarav","Vivaan","Aditya","Vihaan","Arjun","Sai","Reyansh","Krishna","Ishaan","Rohan",
    "Ananya","Diya","Aadhya","Kavya","Isha","Meera","Riya","Saanvi","Anika","Sneha",
    "Rahul","Amit","Vikram","Suresh","Ramesh","Anil","Sunil","Deepak","Manoj","Ravi",
    "Priya","Pooja","Neha","Divya","Shreya","Nisha","Swati","Kiran","Lakshmi","Radha",
    "Muhammad","Ali","Hassan","Zara","Fatima","Ayesha","Imran","Farhan","Sara","Nida",
    "Thomas","Jacob","Maria","Alice","Steven","George","Jessy","Anna","Jose","Elizabeth"
]
last_names = [
    "Nair","Menon","Pillai","Kumar","Sharma","Reddy","Iyer","Das","Gupta","Verma",
    "Khan","Sheikh","Ahmed","Fernandes","Thomas","Joseph","Mathew","Varghese","Panicker","Chandran",
    "Rao","Naidu","Krishnan","Pandey","Mishra","Bose","Sen","Chatterjee","Yadav","Jain"
]

blood_groups = ["A+","A-","B+","B-","O+","O-","AB+","AB-"]
# realistic-ish population distribution for blood groups (India-representative, approx)
blood_group_weights = [0.20,0.03,0.25,0.03,0.30,0.05,0.10,0.04]

genders = ["Male","Female","Other"]
gender_weights = [0.55,0.44,0.01]

availability_status = ["Available","Temporarily Unavailable","Not Available"]

# ----------------------------
# Simulated hospital / zone anchor points
# (Example: Thiruvananthapuram-area style layout with 5 hospital zones)
# ----------------------------
hospital_zones = {
    "Zone_A_General_Hospital": (8.5241, 76.9366),
    "Zone_B_Medical_College": (8.5470, 76.9012),
    "Zone_C_City_Hospital": (8.4855, 76.9540),
    "Zone_D_Cottage_Hospital": (8.5601, 76.8800),
    "Zone_E_Community_Clinic": (8.5000, 76.9700),
}
zone_names = list(hospital_zones.keys())

def random_point_near(lat, lon, max_km=6):
    """Generate a random lat/lon within ~max_km of a center point."""
    # ~1 degree latitude = 111 km
    delta_lat = np.random.normal(0, max_km / 111)
    delta_lon = np.random.normal(0, max_km / (111 * np.cos(np.radians(lat))))
    return round(lat + delta_lat, 6), round(lon + delta_lon, 6)

def random_phone():
    return f"9{random.randint(100000000, 999999999)}"

def random_past_date(max_days_ago=1000):
    days_ago = random.randint(0, max_days_ago)
    return datetime.today() - timedelta(days=days_ago)

# ----------------------------
# Generate records
# ----------------------------
records = []
for i in range(1, N_DONORS + 1):
    donor_id = f"DNR{i:05d}"
    name = f"{random.choice(first_names)} {random.choice(last_names)}"
    age = int(np.clip(np.random.normal(32, 10), 18, 65))
    gender = np.random.choice(genders, p=gender_weights)
    blood_group = np.random.choice(blood_groups, p=blood_group_weights)

    zone = random.choice(zone_names)
    base_lat, base_lon = hospital_zones[zone]
    lat, lon = random_point_near(base_lat, base_lon, max_km=7)

    total_donations = int(np.random.poisson(4))
    last_donation_date = random_past_date(max_days_ago=900) if total_donations > 0 else None
    days_since_last_donation = (datetime.today() - last_donation_date).days if last_donation_date else None

    # average gap between donations (frequency), only meaningful if donated before
    if total_donations > 1:
        donation_frequency_days = int(np.clip(np.random.normal(120, 40), 60, 365))
    elif total_donations == 1:
        donation_frequency_days = None
    else:
        donation_frequency_days = None

    # eligibility rule: age 18-65, and if donated before, must be >90 days since last donation
    if days_since_last_donation is None:
        eligible = 1 if 18 <= age <= 65 else 0
    else:
        eligible = 1 if (18 <= age <= 65 and days_since_last_donation >= 90) else 0

    avail = np.random.choice(availability_status, p=[0.7, 0.2, 0.1])

    # Supervised learning TARGET:
    # simulate whether donor responded positively to the last emergency call
    # (probability influenced by frequency, eligibility, and availability)
    base_prob = 0.15
    if eligible:
        base_prob += 0.35
    if avail == "Available":
        base_prob += 0.25
    if total_donations >= 5:
        base_prob += 0.15
    base_prob = min(base_prob, 0.95)
    responded_last_emergency = np.random.binomial(1, base_prob)

    records.append({
        "donor_id": donor_id,
        "name": name,
        "age": age,
        "gender": gender,
        "blood_group": blood_group,
        "zone": zone,
        "latitude": lat,
        "longitude": lon,
        "phone_number": random_phone(),
        "total_donations": total_donations,
        "last_donation_date": last_donation_date.strftime("%Y-%m-%d") if last_donation_date else None,
        "days_since_last_donation": days_since_last_donation,
        "donation_frequency_days": donation_frequency_days,
        "availability_status": avail,
        "eligible_to_donate": eligible,
        "responded_last_emergency": responded_last_emergency,
    })

df = pd.DataFrame(records)

# ----------------------------
# Save dataset
# ----------------------------
output_path = "/mnt/user-data/outputs/blood_donor_dataset.csv"
df.to_csv(output_path, index=False)

print(f"Generated {len(df)} donor records.")
print(df.head(10).to_string())
print("\nColumn dtypes:\n", df.dtypes)
print("\nBlood group distribution:\n", df["blood_group"].value_counts())
print("\nZone distribution:\n", df["zone"].value_counts())
print("\nSaved to:", output_path)
