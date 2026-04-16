from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core import signing
from django.db import transaction
from django.urls import reverse
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from infra.cache import RedisCacheManager
from task_queue.services import EmailService
from .models import UserProfile


EMAIL_VERIFICATION_SALT = "user.email.verification"
User = get_user_model()


def build_user_payload(profile: UserProfile) -> dict:
    user = profile.user
    interest_keys = []
    if isinstance(profile.preferences_vector, dict):
        interest_keys = list(profile.preferences_vector.keys())
    return {
        "id": str(profile.id),
        "username": user.username,
        "email": user.email,
        "full_name": f"{user.first_name} {user.last_name}".strip(),
        "avatar_url": profile.avatar_url,
        "bio": profile.bio,
        "is_verified": profile.is_verified,
        "has_interests": bool(profile.preferences_vector),
        "interests": interest_keys,
        "followers_count": profile.followers_count,
        "following_count": profile.following_count,
    }


class AuthService:
    """
    Service-layer owner for authentication lifecycle.
    Views should orchestrate request/response only and delegate auth work here.
    """

    def __init__(self, cache_manager: RedisCacheManager | None = None):
        self.cache = cache_manager or RedisCacheManager()

    def register_user(self, serializer, request=None) -> tuple[User, UserProfile, str | None]:
        with transaction.atomic():
            user = serializer.save()
            profile, _ = UserProfile.objects.get_or_create(user=user)
            token = generate_email_verification_token(user)
            verification_url = build_email_verification_url(request, token) if request else None
            if verification_url:
                send_verification_email(profile, verification_url, token)
            return user, profile, verification_url

    def authenticate_user(self, email: str, password: str) -> User:
        normalized_email = (email or "").strip().lower()
        if not normalized_email or not password:
            raise ValidationError({"detail": "Email and password are required"})

        account = User.objects.filter(email__iexact=normalized_email).first()
        if account is not None and not account.is_active and account.check_password(password):
            raise PermissionDenied("Please verify your email before logging in")

        username_for_auth = account.username if account else normalized_email
        user = authenticate(username=username_for_auth, password=password)
        if user is None:
            raise AuthenticationFailed("Invalid credentials")
        if not user.is_active:
            raise PermissionDenied("Please verify your email before logging in")
        return user

    def generate_tokens(self, user: User) -> dict:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token
        payload = {
            "user": build_user_payload(profile),
            "access": str(access),
            "refresh": str(refresh),
        }
        self.cache.cache_user_session(
            str(user.id),
            {"profile_id": str(profile.id), "refresh_jti": refresh.get("jti")},
        )
        return payload

    def refresh_access_token(self, refresh_token: str) -> dict:
        try:
            refresh = RefreshToken(refresh_token)
        except TokenError:
            raise AuthenticationFailed("Invalid refresh token")

        jti = refresh.get("jti")
        if jti and self.cache.is_token_blacklisted(jti):
            raise AuthenticationFailed("Refresh token has been revoked")

        return {"access": str(refresh.access_token)}

    def revoke_token(self, token: str) -> None:
        if not token:
            return

        parsed_token = None
        for token_cls in (RefreshToken, AccessToken):
            try:
                parsed_token = token_cls(token)
                break
            except TokenError:
                continue

        if parsed_token is None:
            raise AuthenticationFailed("Invalid token")

        jti = parsed_token.get("jti")
        exp = parsed_token.get("exp")
        if jti:
            self.cache.blacklist_token(jti, exp)


def generate_email_verification_token(user) -> str:
    return signing.dumps(
        {"uid": user.id, "email": user.email},
        salt=EMAIL_VERIFICATION_SALT,
    )


def validate_email_verification_token(token: str) -> dict:
    max_age_seconds = getattr(settings, "EMAIL_VERIFICATION_MAX_AGE_SECONDS", 24 * 60 * 60)
    return signing.loads(
        token,
        salt=EMAIL_VERIFICATION_SALT,
        max_age=max_age_seconds,
    )


def build_email_verification_url(request, token: str) -> str:
    path = reverse("verify_email")
    query = urlencode({"token": token})
    return request.build_absolute_uri(f"{path}?{query}")


def send_verification_email(user_profile, verification_url: str, verification_token: str) -> None:
    user = user_profile.user

    if settings.DEBUG and not getattr(settings, "EMAIL_HOST_USER", ""):
        print(
            "[DEV] Email verification skipped because EMAIL_HOST_USER is not configured. "
            f"Verify URL for {user.email}: {verification_url}"
        )
        return

    email_service = EmailService()
    html_body = email_service.render_template(
        "emails/verification",
        {
            "user_name": user.get_full_name() or user.username,
            "user_email": user.email,
            "user_profile": user_profile,
            "verification_url": verification_url,
            "verification_token": verification_token,
        },
    )

    sent = email_service.send(
        recipient=user.email,
        subject="Verify Your Email",
        html_body=html_body,
    )
    if not sent:
        raise RuntimeError("Failed to send verification email")
