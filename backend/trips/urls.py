"""
URL routing for trips app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ItineraryViewSet, ItineraryItemViewSet

router = DefaultRouter()
router.register(r'itineraries', ItineraryViewSet, basename='itinerary')
router.register(r'itinerary-items', ItineraryItemViewSet, basename='itinerary-item')

app_name = 'trips'

urlpatterns = [
    path('', include(router.urls)),
    # Explicit path for accessing shared itinerary by token
    path('shared/<str:token>/', ItineraryViewSet.as_view({'get': 'access_shared'}), name='shared-access'),
]

