"""
URL routing for community app endpoints.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SocialPostViewSet, UserPostsView

router = DefaultRouter()
router.register(r'posts', SocialPostViewSet, basename='socialpost')

urlpatterns = [
    path('', include(router.urls)),
    path('user/<str:user_id>/posts/', UserPostsView.as_view(), name='user-posts'),
]
