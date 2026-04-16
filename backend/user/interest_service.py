from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Interest, UserInterest, UserProfile


class InterestService:
    """
    Owns onboarding interest catalog and user preference persistence.
    Views keep request/response concerns; recommendation inputs stay in UserProfile.preferences_vector.
    """

    def list_available_interests(self) -> list[dict]:
        groups = (
            Interest.objects
            .filter(is_active=True, kind=Interest.Kind.GROUP)
            .prefetch_related("children")
            .order_by("sort_order", "title")
        )

        return [self._serialize_interest(group, include_children=True) for group in groups]

    def get_health(self) -> dict:
        return {
            "source": "database",
            "active_group_count": Interest.objects.filter(is_active=True, kind=Interest.Kind.GROUP).count(),
            "active_type_count": Interest.objects.filter(is_active=True, kind=Interest.Kind.TYPE).count(),
        }

    @transaction.atomic
    def save_user_interests(self, profile: UserProfile, raw_interest_ids: list) -> list[dict]:
        if not isinstance(raw_interest_ids, list) or not raw_interest_ids:
            raise ValidationError({"detail": "At least one interest must be selected"})

        interests = self._resolve_interests(raw_interest_ids)
        if not interests:
            raise ValidationError({"detail": "No valid interests selected"})

        selected_keys = []
        vector_keys = []
        selected_rows = []

        for interest in interests:
            selected_keys.append(interest.key)
            selected_rows.append(
                UserInterest(profile=profile, interest=interest, weight=1.0)
            )

            vector_keys.append(interest.key)
            child_keys = [
                child.key for child in interest.children.all()
                if child.is_active
            ]
            vector_keys.extend(child_keys)

        UserInterest.objects.filter(profile=profile).delete()
        UserInterest.objects.bulk_create(selected_rows, ignore_conflicts=True)

        normalized_vector_keys = list(dict.fromkeys(vector_keys))
        profile.preferences_vector = {key: 1.0 for key in normalized_vector_keys}
        profile.save(update_fields=["preferences_vector"])

        selected_lookup = {interest.id for interest in interests}
        return [
            self._serialize_interest(interest, include_children=False)
            for interest in interests
            if interest.id in selected_lookup
        ]

    def _resolve_interests(self, raw_interest_ids: list) -> list[Interest]:
        numeric_ids = []
        keys = []

        for item in raw_interest_ids:
            if isinstance(item, int):
                numeric_ids.append(item)
                continue
            if isinstance(item, str):
                value = item.strip()
                if value.isdigit():
                    numeric_ids.append(int(value))
                elif value:
                    keys.append(value.lower())

        queryset = (
            Interest.objects
            .filter(is_active=True)
            .prefetch_related("children")
            .order_by("sort_order", "title")
        )
        if numeric_ids and keys:
            interests = queryset.filter(id__in=numeric_ids) | queryset.filter(key__in=keys)
        elif numeric_ids:
            interests = queryset.filter(id__in=numeric_ids)
        elif keys:
            interests = queryset.filter(key__in=keys)
        else:
            return []

        return list(interests.distinct())

    def _serialize_interest(self, interest: Interest, include_children: bool) -> dict:
        payload = {
            "id": interest.id,
            "key": interest.key,
            "name": interest.key,
            "title": interest.title,
            "kind": interest.kind,
            "icon": interest.icon,
        }

        if include_children:
            children = [
                self._serialize_interest(child, include_children=False)
                for child in interest.children.all()
                if child.is_active
            ]
            payload["children"] = children

        return payload
