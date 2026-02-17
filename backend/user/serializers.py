from rest_framework import serializers
from .models import UserProfile
class UserProfileSerializer(serializers.ModelSerializer):
    username= serializers.CharField(source="user.username",read_only=True)
    email = serializers.CharField(source="user.email",read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "id",
            "username",
            "email",
            "avatar_url",
            "bio",
            "followers_count",
            "following_count",
            "is_verified",
        ]

class FollowActionSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()