"""
URL routing for locations app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import POIViewSet

router = DefaultRouter()
router.register(r'pois', POIViewSet, basename='poi')

app_name = 'locations'

urlpatterns = [
    path('', include(router.urls)),
]
