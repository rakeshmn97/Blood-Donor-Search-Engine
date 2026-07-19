from django.db import models

class Donor(models.Model):
    donor_id = models.CharField(max_length=20, primary_key=True)
    name = models.CharField(max_length=100)
    age = models.IntegerField()
    gender = models.CharField(max_length=20)
    blood_group = models.CharField(max_length=10)
    zone = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    phone_number = models.CharField(max_length=20)
    total_donations = models.IntegerField()
    last_donation_date = models.DateField(null=True, blank=True)
    days_since_last_donation = models.IntegerField(null=True, blank=True)
    donation_frequency_days = models.IntegerField(null=True, blank=True)
    availability_status = models.CharField(max_length=30)
    eligible_to_donate = models.BooleanField(default=True)
    responded_last_emergency = models.BooleanField(default=False)
    geo_cluster = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.donor_id} - {self.name} ({self.blood_group})"
