import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import FollowRelation, UserProfile

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    full_name = serializers.SerializerMethodField()
    followers_count = serializers.SerializerMethodField()
    following_count = serializers.SerializerMethodField()
    has_interests = serializers.SerializerMethodField()
    interests = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    is_own_profile = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "id",
            "username",
            "email",
            "full_name",
            "avatar_url",
            "bio",
            "followers_count",
            "following_count",
            "is_verified",
            "has_interests",
            "interests",
            "is_following",
            "is_own_profile",
        ]

    def get_full_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_followers_count(self, obj):
        return FollowRelation.objects.filter(following=obj).count()

    def get_following_count(self, obj):
        return FollowRelation.objects.filter(follower=obj).count()

    def get_has_interests(self, obj):
        return bool(obj.preferences_vector)

    def get_interests(self, obj):
        if not isinstance(obj.preferences_vector, dict):
            return []
        return list(obj.preferences_vector.keys())

    def get_is_following(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return False
        viewer_profile = getattr(request.user, "profile", None)
        if viewer_profile is None or viewer_profile == obj:
            return False
        return viewer_profile.is_following(obj)

    def get_is_own_profile(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return False
        viewer_profile = getattr(request.user, "profile", None)
        return viewer_profile == obj

class FollowActionSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()
    is_following = serializers.BooleanField()
    followers_count = serializers.IntegerField()
    following_count = serializers.IntegerField()


class FollowListProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    full_name = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "id",
            "username",
            "full_name",
            "avatar_url",
            "bio",
            "is_following",
        ]

    def get_full_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_is_following(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            return False
        viewer_profile = getattr(request.user, "profile", None)
        if viewer_profile is None or viewer_profile == obj:
            return False
        return viewer_profile.is_following(obj)


class LoginRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class TokenRefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=True)


class LogoutRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=True)


class UserPayloadSerializer(serializers.Serializer):
    id = serializers.CharField()
    username = serializers.CharField()
    email = serializers.EmailField()
    full_name = serializers.CharField(allow_blank=True)
    avatar_url = serializers.CharField(allow_null=True, allow_blank=True)
    bio = serializers.CharField(allow_blank=True)
    is_verified = serializers.BooleanField()
    has_interests = serializers.BooleanField()
    interests = serializers.ListField(child=serializers.CharField())
    followers_count = serializers.IntegerField()
    following_count = serializers.IntegerField()


class AuthTokenResponseSerializer(serializers.Serializer):
    user = UserPayloadSerializer()
    access = serializers.CharField()
    refresh = serializers.CharField()


class AccessTokenResponseSerializer(serializers.Serializer):
    access = serializers.CharField()


class UserRegistrationSerializer(serializers.Serializer):
    full_name = serializers.CharField(required=True, min_length=2)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True,
        min_length=8,
        write_only=True
    )
    confirm_password = serializers.CharField(
        required=True,
        write_only=True
    )
    
    def validate_full_name(self, value):
        full_name = value.strip()
        if not full_name:
            raise serializers.ValidationError({
                "code": "full_name_required",
                "message": "Full name can not be empty",
            })
        if len(full_name) < 2:
            raise serializers.ValidationError({
                "code": "full_name_too_short",
                "message": "Full name must be at least 2 characters",
            })
        return full_name

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({
                "code": "email_already_exists",
                "message": "Email already exists",
            })
        return email
    
    def validate_password(self, value):
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError({
                "code": "password_missing_uppercase",
                "message": "Password must contain at least one uppercase letter",
            })
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError({
                "code": "password_missing_number",
                "message": "Password must contain at least one number",
            })
        return value

    def validate(self, attrs):
        if attrs.get("password") != attrs.get("confirm_password"):
            raise serializers.ValidationError({
                "confirm_password": [{
                    "code": "passwords_do_not_match",
                    "message": "Passwords do not match",
                }]
            })
        return attrs
    
    def create(self, validated_data):
        full_name = validated_data['full_name']
        email = validated_data['email']
        password = validated_data['password']
        
        name_parts = full_name.split(maxsplit=1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        user = User.objects.create_user(
            username=email,  # Using email as username
            email=email,
            first_name=first_name,
            last_name=last_name,
            password=password,
            is_active=False,
        )
        return user
