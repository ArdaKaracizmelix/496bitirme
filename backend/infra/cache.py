import time
from typing import Any

from django.conf import settings
from django.core.cache import cache


class RedisCacheManager:
    """
    Infrastructure adapter for Redis-backed cache operations.

    The auth module uses this manager for token revocation checks. A tiny
    in-process fallback keeps local tests usable if Redis is unavailable, while
    production/dev Docker still uses the configured Redis cache backend.
    """

    _fallback_store: dict[str, tuple[Any, float | None]] = {}

    def __init__(self, prefix: str | None = None):
        self.prefix = prefix or getattr(settings, "REDIS_KEY_PREFIX", "excursa")

    def _key(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    def set(self, key: str, value: Any, timeout: int | None = None) -> None:
        namespaced_key = self._key(key)
        try:
            cache.set(namespaced_key, value, timeout=timeout)
            return
        except Exception:
            expires_at = time.time() + timeout if timeout else None
            self._fallback_store[namespaced_key] = (value, expires_at)

    def get(self, key: str, default: Any = None) -> Any:
        namespaced_key = self._key(key)
        try:
            value = cache.get(namespaced_key, default)
            if value is not default:
                return value
        except Exception:
            pass

        fallback = self._fallback_store.get(namespaced_key)
        if fallback is None:
            return default

        value, expires_at = fallback
        if expires_at is not None and expires_at <= time.time():
            self._fallback_store.pop(namespaced_key, None)
            return default
        return value

    def delete(self, key: str) -> None:
        namespaced_key = self._key(key)
        try:
            cache.delete(namespaced_key)
        except Exception:
            pass
        self._fallback_store.pop(namespaced_key, None)

    def blacklist_token(self, jti: str, expires_at: int | None) -> None:
        timeout = None
        if expires_at:
            timeout = max(int(expires_at - time.time()), 1)
        self.set(f"token_blacklist:{jti}", True, timeout=timeout)

    def is_token_blacklisted(self, jti: str) -> bool:
        return bool(self.get(f"token_blacklist:{jti}", False))

    def cache_user_session(self, user_id: str, payload: dict, timeout: int | None = None) -> None:
        self.set(f"user_session:{user_id}", payload, timeout=timeout)

    def get_user_session(self, user_id: str) -> dict | None:
        return self.get(f"user_session:{user_id}", None)
