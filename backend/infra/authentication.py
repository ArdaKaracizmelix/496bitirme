from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from .cache import RedisCacheManager


class RedisAwareJWTAuthentication(JWTAuthentication):
    """
    JWT auth backend that rejects tokens revoked through Redis blacklist.
    """

    def get_validated_token(self, raw_token):
        validated_token = super().get_validated_token(raw_token)
        jti = validated_token.get("jti")
        if jti and RedisCacheManager().is_token_blacklisted(jti):
            raise InvalidToken("Token has been revoked")
        return validated_token
