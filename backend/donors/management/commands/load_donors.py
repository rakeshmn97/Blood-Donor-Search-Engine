import csv
from datetime import datetime
from django.core.management.base import BaseCommand
from donors.models import Donor
import pandas as pd
import math

class Command(BaseCommand):
    help = 'Loads blood donors from the CSV dataset'

    def handle(self, *args, **options):
        csv_path = "../donor_dataset_with_clusters.csv"
        
        self.stdout.write("Clearing existing donor records...")
        Donor.objects.all().delete()
        
        self.stdout.write(f"Reading donors from {csv_path}...")
        df = pd.read_csv(csv_path)
        
        donors_to_create = []
        
        for idx, row in df.iterrows():
            # Handle possible nan values
            last_don_date = None
            if isinstance(row['last_donation_date'], str) and row['last_donation_date'].strip():
                try:
                    last_don_date = datetime.strptime(row['last_donation_date'].strip(), "%Y-%m-%d").date()
                except ValueError:
                    pass
            
            days_since = None
            if not math.isnan(row['days_since_last_donation']):
                days_since = int(row['days_since_last_donation'])
                
            freq = None
            if not math.isnan(row['donation_frequency_days']):
                freq = int(row['donation_frequency_days'])
                
            cluster = None
            if 'geo_cluster' in row and not math.isnan(row['geo_cluster']):
                cluster = int(row['geo_cluster'])
                
            donor = Donor(
                donor_id=row['donor_id'],
                name=row['name'],
                age=int(row['age']),
                gender=row['gender'],
                blood_group=row['blood_group'],
                zone=row['zone'],
                latitude=float(row['latitude']),
                longitude=float(row['longitude']),
                phone_number=str(row['phone_number']),
                total_donations=int(row['total_donations']),
                last_donation_date=last_don_date,
                days_since_last_donation=days_since,
                donation_frequency_days=freq,
                availability_status=row['availability_status'],
                eligible_to_donate=bool(row['eligible_to_donate']),
                responded_last_emergency=bool(row['responded_last_emergency']),
                geo_cluster=cluster
            )
            donors_to_create.append(donor)
            
        self.stdout.write(f"Bulk creating {len(donors_to_create)} donor records...")
        Donor.objects.bulk_create(donors_to_create)
        
        self.stdout.write(self.style.SUCCESS(f"Successfully loaded {Donor.objects.count()} donors."))
