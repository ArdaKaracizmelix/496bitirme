from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .serializers import UserProfileSerializer


# Create your views here.

class MeView(APIView):
    #permission_classes = [IsAuthenticated] //todo: jwt token işi yapınca comment kaldırılcak

    def get(self,request):
        profile = request.user.profile
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

class ProfileView(APIView):
    #permission_classes = [IsAuthenticated]

    def get(self,request,id):
        profile = get_object_or_404(UserProfile,id=id)
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

class FollowView(APIView):
    #permission_classes = [IsAuthenticated]

    def post(self,request,id):
        follower = request.user.profile
        followed_profile = get_object_or_404(UserProfile,id=id)

        if follower == followed_profile:
            return Response(
                {"success":False,"message":"An account can not follow itself"},
                status =status.HTTP_400_BAD_REQUEST,

            )
        if follower.is_following(followed_profile):
            return Response(
                {"success":False,"message":"Followed account is already followed"},
                status = status.HTTP_400_BAD_REQUEST,
            )

        follower.follow(followed_profile)
        return Response(
            {"success":True,"message":"Sucessfully followed"},
            status = status.HTTP_200_OK

        )

class UnfollowView(APIView):
    #permission_classes = [IsAuthenticated]

    def post(self,request,id):
        follower = request.user.profile
        followed = get_object_or_404(UserProfile,id=id)

        if follower == followed:
            return Response(
                {"success": False, "message": "An account can not unfollow itself"},
                status=status.HTTP_400_BAD_REQUEST,

            )
        if not follower.is_following(followed):
            return Response(
                {"success": False, "message": "Unfollowed account can not unfollowed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        follower.unfollow(followed)
        return Response(
            {"success": True, "message": "Sucessfully followed"},
            status=status.HTTP_200_OK

        )