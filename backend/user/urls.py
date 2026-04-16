from django.urls import path

from .views import (
    FollowersListView,
    FollowView,
    FollowingListView,
    InterestAvailableView,
    InterestSourceHealthView,
    InterestSubmitView,
    LoginView,
    LogoutView,
    MeView,
    ProfileView,
    RefreshTokenView,
    RegisterView,
    UnfollowView,
    VerifyEmailView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-email/", VerifyEmailView.as_view(), name="verify_email"),
    path("token/refresh/", RefreshTokenView.as_view(), name="token_refresh"),
    path("interests/available/", InterestAvailableView.as_view(), name="interests_available"),
    path("interests/health/", InterestSourceHealthView.as_view(), name="interests_health"),
    path("interests/", InterestSubmitView.as_view(), name="interests"),
    path("me/", MeView.as_view(), name="me"),
    path("<uuid:id>/", ProfileView.as_view(), name="profile"),
    path("<uuid:id>/followers/", FollowersListView.as_view(), name="followers_list"),
    path("<uuid:id>/following/", FollowingListView.as_view(), name="following_list"),
    path("<uuid:id>/follow/", FollowView.as_view(), name="follow"),
    path("<uuid:id>/unfollow/", UnfollowView.as_view(), name="unfollow"),
]
