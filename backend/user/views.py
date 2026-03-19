from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile
from .serializers import UserProfileSerializer, UserRegistrationSerializer


# Create your views here.

def build_user_payload(profile: UserProfile) -> dict:
    user = profile.user
    return {
        "id": str(profile.id),
        "email": user.email,
        "full_name": f"{user.first_name} {user.last_name}".strip(),
        "avatar_url": profile.avatar_url,
        "bio": profile.bio,
        "is_verified": profile.is_verified,
        "followers_count": profile.followers_count,
        "following_count": profile.following_count,
    }


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password")

        if not email or not password:
            return Response(
                {"detail": "Email and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, username=email, password=password)
        if user is None:
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": build_user_payload(profile),
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


class RegisterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.save()
            
            # Create user profile automatically
            profile, _ = UserProfile.objects.get_or_create(user=user)
            
            # Generate access and refresh tokens
            refresh = RefreshToken.for_user(user)
            
            return Response(
                {
                    "user": build_user_payload(profile),
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                },
                status=status.HTTP_201_CREATED,
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except Exception:
                # Blacklist app may be disabled; client-side token removal is still enough for logout.
                pass
        return Response({"detail": "Logged out successfully"}, status=status.HTTP_200_OK)


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


class InterestAvailableView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from locations.models import POI

        interests = [
            {
                "id": index,
                "name": category_value,
                "title": category_label,
            }
            for index, (category_value, category_label) in enumerate(POI.Category.choices, start=1)
        ]
        return Response({"interests": interests}, status=status.HTTP_200_OK)


class InterestSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from locations.models import POI

        interest_ids = request.data.get("interest_ids", [])
        if not isinstance(interest_ids, list) or not interest_ids:
            return Response(
                {"detail": "At least one interest must be selected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        category_by_id = {
            index: category_value
            for index, (category_value, _label) in enumerate(POI.Category.choices, start=1)
        }
        valid_categories = set(category_by_id.values())

        selected_categories = []
        for item in interest_ids:
            if isinstance(item, int) and item in category_by_id:
                selected_categories.append(category_by_id[item])
            elif isinstance(item, str):
                normalized = item.strip().upper()
                if normalized in valid_categories:
                    selected_categories.append(normalized)

        selected_categories = list(dict.fromkeys(selected_categories))
        if not selected_categories:
            return Response(
                {"detail": "No valid interests selected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.preferences_vector = {category: 1.0 for category in selected_categories}
        profile.save(update_fields=["preferences_vector"])

        interests = []
        for category in selected_categories:
            matched_id = next((id_ for id_, value in category_by_id.items() if value == category), None)
            interests.append(
                {
                    "id": matched_id,
                    "name": category,
                }
            )

        return Response(
            {
                "interests": interests,
                "message": "Interests updated successfully",
            },
            status=status.HTTP_200_OK,
        )
