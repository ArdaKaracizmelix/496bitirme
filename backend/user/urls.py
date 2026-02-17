from django.urls import path
from .views import MeView, ProfileView, FollowView, UnfollowView

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("<uuid:id>/", ProfileView.as_view(), name="profile"),
    path("<uuid:id>/follow/", FollowView.as_view(), name="follow"),
    path("<uuid:id>/unfollow/", UnfollowView.as_view(), name="unfollow"),
]
