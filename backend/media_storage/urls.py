"""
URL routing for media endpoints.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import MediaUploadViewSet

router = DefaultRouter()
router.register(r'', MediaUploadViewSet, basename='media')

urlpatterns = router.urls
