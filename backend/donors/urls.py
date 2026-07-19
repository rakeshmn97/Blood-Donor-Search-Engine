from django.urls import path, include
from rest_framework.routers import DefaultRouter
from donors.views import DonorViewSet, get_stats, search_donors, simulate_broadcast, get_plot, predict_custom_donor

router = DefaultRouter()
router.register(r'donors', DonorViewSet, basename='donor')

urlpatterns = [
    path('stats/', get_stats, name='stats'),
    path('search/', search_donors, name='search'),
    path('broadcast/', simulate_broadcast, name='broadcast'),
    path('plots/<str:filename>/', get_plot, name='plots'),
    path('predict/', predict_custom_donor, name='predict'),
    path('', include(router.urls)),
]
