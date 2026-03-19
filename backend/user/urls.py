from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    FollowView,
    InterestAvailableView,
    InterestSubmitView,
    LoginView,
    LogoutView,
    MeView,
    ProfileView,
    RegisterView,
    UnfollowView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("interests/available/", InterestAvailableView.as_view(), name="interests_available"),
    path("interests/", InterestSubmitView.as_view(), name="interests"),
    path("me/", MeView.as_view(), name="me"),
    path("<uuid:id>/", ProfileView.as_view(), name="profile"),
    path("<uuid:id>/follow/", FollowView.as_view(), name="follow"),
    path("<uuid:id>/unfollow/", UnfollowView.as_view(), name="unfollow"),
]
