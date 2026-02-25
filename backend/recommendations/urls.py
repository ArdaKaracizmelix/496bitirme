"""
URL configuration for the recommendations module.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from recommendations.views import (
    InteractionViewSet, ReviewViewSet,
    GenerateRecommendationsView, UnderratedPlacesView,
    TrendingPlacesView, BlacklistPOIView,
    AnalyzeSeasonalTrendsView
)

router = DefaultRouter()
router.register(r'interactions', InteractionViewSet, basename='interaction')
router.register(r'reviews', ReviewViewSet, basename='review')

app_name = 'recommendations'

urlpatterns = [
    path('', include(router.urls)),
    path('generate/', GenerateRecommendationsView.as_view(), name='generate_recommendations'),
    path('underrated/', UnderratedPlacesView.as_view(), name='underrated_places'),
    path('trending/', TrendingPlacesView.as_view(), name='trending_places'),
    path('blacklist/', BlacklistPOIView.as_view(), name='blacklist_poi'),
    path('analyze-seasonal-trends/', AnalyzeSeasonalTrendsView.as_view(), name='analyze_seasonal_trends'),
]
