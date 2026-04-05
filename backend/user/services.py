from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.urls import reverse

from task_queue.services import EmailService


EMAIL_VERIFICATION_SALT = "user.email.verification"


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
