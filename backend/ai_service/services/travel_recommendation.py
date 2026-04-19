from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from django.db.models import Q

from ai_service.services.turkey_city_knowledge import CITY_GUIDES
from locations.models import POI
from trips.models import Itinerary
from user.models import UserProfile


@dataclass
class TravelCandidate:
    name: str
    category: str = "place"
    city: str = ""
    note: str = ""
    cultural_note: str = ""
    tags: List[str] = field(default_factory=list)
    rating: Optional[float] = None
    source: str = "city_knowledge"
    score: float = 0.0


@dataclass
class TravelContext:
    city: str = ""
    days: int = 0
    themes: List[str] = field(default_factory=list)
    intent: str = "place_recommendation"
    user_interests: List[str] = field(default_factory=list)
    candidates: List[TravelCandidate] = field(default_factory=list)
    foods: List[str] = field(default_factory=list)
    routes: List[Dict[str, Any]] = field(default_factory=list)

    def has_travel_data(self) -> bool:
        return bool(self.candidates or self.foods or self.routes)


class TravelRecommendationService:
    THEME_HINTS = {
        "history": ["HISTORICAL", "history", "historical", "museum", "culture", "antik", "kale", "medrese"],
        "nature": ["NATURE", "park", "nature", "view", "lake", "vadi", "sahil", "doga", "yayla"],
        "food": ["FOOD", "food", "restaurant", "cafe", "gastronomy", "kebap", "lezzet"],
        "entertainment": ["ENTERTAINMENT", "night", "bar", "festival", "activity"],
        "shopping": ["shopping", "market", "bazaar", "carsi", "mall"],
    }

    INTENT_THEME_MAP = {
        "food_recommendation": ["food"],
        "historical_places": ["history"],
        "nature_recommendation": ["nature"],
    }

    def build_context(self, *, user_id: Optional[str], message: str, intent_result) -> TravelContext:
        entities = intent_result.entities or {}
        city = entities.get("city", "")
        days = int(entities.get("days") or 0)
        themes = list(dict.fromkeys((entities.get("themes") or []) + self.INTENT_THEME_MAP.get(intent_result.intent, [])))
        user_interests = self._load_user_interests(user_id)
        effective_themes = list(dict.fromkeys(themes + user_interests))

        city_guide = CITY_GUIDES.get(city, {})
        candidates = self._load_internal_pois(city, effective_themes, message)
        candidates.extend(self._load_city_knowledge_places(city, city_guide, effective_themes))

        return TravelContext(
            city=city,
            days=days,
            themes=themes,
            intent=intent_result.intent,
            user_interests=user_interests,
            candidates=self._dedupe_and_rank(candidates, effective_themes),
            foods=list(city_guide.get("foods") or []),
            routes=self._load_routes(city, user_id),
        )

    def _load_user_interests(self, user_id: Optional[str]) -> List[str]:
        if not user_id:
            return []
        try:
            profile = UserProfile.objects.prefetch_related("selected_interests__interest").filter(user_id=user_id).first()
            if not profile:
                return []
            selected = [
                selection.interest.key
                for selection in profile.selected_interests.all()
                if selection.interest and selection.interest.key
            ]
            vector = []
            if isinstance(profile.preferences_vector, dict):
                vector = [
                    key for key, _value in sorted(
                        profile.preferences_vector.items(),
                        key=lambda item: item[1] if isinstance(item[1], (int, float)) else 0,
                        reverse=True,
                    )
                ]
            return self._normalize_interest_keys(selected + vector)[:6]
        except Exception:
            return []

    def _normalize_interest_keys(self, interests: List[str]) -> List[str]:
        mapped = []
        for raw in interests or []:
            value = str(raw).lower()
            if any(token in value for token in ["history", "histor", "museum", "culture", "tarih", "kultur"]):
                mapped.append("history")
            elif any(token in value for token in ["nature", "park", "outdoor", "doga", "sahil", "yayla"]):
                mapped.append("nature")
            elif any(token in value for token in ["food", "gastronomy", "cafe", "yemek", "lezzet"]):
                mapped.append("food")
            elif any(token in value for token in ["entertainment", "night", "eglence"]):
                mapped.append("entertainment")
            elif any(token in value for token in ["shopping", "market", "alisveris"]):
                mapped.append("shopping")
        return list(dict.fromkeys(mapped))

    def _load_city_knowledge_places(self, city: str, city_guide: dict, themes: List[str]) -> List[TravelCandidate]:
        results = []
        for place in city_guide.get("places") or []:
            category = str(place.get("category") or "place")
            if themes and not self._matches_theme(category, place.get("note", ""), themes):
                continue
            results.append(
                TravelCandidate(
                    name=place.get("name", ""),
                    category=category,
                    city=city,
                    note=place.get("note", ""),
                    cultural_note=self._cultural_note(category, place.get("note", "")),
                    tags=[category],
                    source="city_knowledge",
                    score=0.72 + self._score_text(category + " " + place.get("note", ""), themes),
                )
            )
        return results

    def _load_internal_pois(self, city: str, themes: List[str], message: str) -> List[TravelCandidate]:
        try:
            queryset = POI.objects.all()
            if city:
                queryset = queryset.filter(Q(address__icontains=city) | Q(name__icontains=city))

            filters = Q()
            for theme in themes[:5]:
                for hint in self.THEME_HINTS.get(theme, []):
                    filters |= Q(category__icontains=hint) | Q(name__icontains=hint)
            for token in self._important_terms(message):
                filters |= Q(name__icontains=token) | Q(address__icontains=token) | Q(category__icontains=token)
            if filters:
                queryset = queryset.filter(filters)

            results = []
            for poi in queryset.distinct()[:60]:
                tags = [str(tag).lower() for tag in (poi.tags or [])]
                results.append(
                    TravelCandidate(
                        name=poi.name,
                        category=str(poi.category or "place").lower(),
                        city=city,
                        note=self._poi_note(poi),
                        cultural_note=self._poi_cultural_note(poi),
                        tags=tags,
                        rating=poi.average_rating,
                        source="internal_poi",
                        score=0.82 + self._score_text(
                            " ".join([poi.name, poi.address, poi.category, " ".join(tags)]),
                            themes,
                        ) + min(float(poi.average_rating or 0) / 5.0, 1.0) * 0.2,
                    )
                )
            return results
        except Exception:
            return []

    def _load_routes(self, city: str, user_id: Optional[str]) -> List[Dict[str, Any]]:
        try:
            queryset = Itinerary.objects.prefetch_related("itineraryitem_set__poi")
            route_filter = Q(visibility=Itinerary.Visibility.PUBLIC)
            if user_id:
                route_filter |= Q(user_id=user_id)
            queryset = queryset.filter(route_filter)
            if city:
                queryset = queryset.filter(
                    Q(title__icontains=city)
                    | Q(itineraryitem__poi__address__icontains=city)
                    | Q(itineraryitem__poi__name__icontains=city)
                )
            routes = []
            for itinerary in queryset.distinct().order_by("-updated_at")[:3]:
                stops = list(itinerary.itineraryitem_set.all().order_by("order_index")[:6])
                routes.append({
                    "id": str(itinerary.id),
                    "title": itinerary.title,
                    "stops": [item.poi.name for item in stops if item.poi],
                    "transport_mode": itinerary.transport_mode,
                })
            return routes
        except Exception:
            return []

    def _dedupe_and_rank(self, candidates: List[TravelCandidate], themes: List[str]) -> List[TravelCandidate]:
        by_name: Dict[str, TravelCandidate] = {}
        for candidate in candidates:
            key = candidate.name.lower().strip()
            if not key:
                continue
            candidate.score += self._theme_bonus(candidate, themes)
            existing = by_name.get(key)
            if existing:
                if candidate.cultural_note and not existing.cultural_note:
                    existing.cultural_note = candidate.cultural_note
                if candidate.note and candidate.source == "city_knowledge" and candidate.note not in existing.note:
                    existing.cultural_note = candidate.note
            if not existing or candidate.score > existing.score:
                by_name[key] = candidate
        return sorted(by_name.values(), key=lambda item: item.score, reverse=True)

    def _matches_theme(self, category: str, note: str, themes: List[str]) -> bool:
        if not themes:
            return True
        text = f"{category} {note}".lower()
        return any(theme in text for theme in themes)

    def _theme_bonus(self, candidate: TravelCandidate, themes: List[str]) -> float:
        if not themes:
            return 0.04
        text = " ".join([candidate.category, candidate.note, candidate.cultural_note, " ".join(candidate.tags)]).lower()
        return sum(0.12 for theme in themes if theme in text)

    def _score_text(self, text: str, themes: List[str]) -> float:
        score = 0.0
        lowered = str(text or "").lower()
        for theme in themes or []:
            if theme in lowered:
                score += 0.2
            for hint in self.THEME_HINTS.get(theme, []):
                if str(hint).lower() in lowered:
                    score += 0.07
        return score

    def _poi_note(self, poi) -> str:
        category = str(poi.category or "").upper()
        if category == "HISTORICAL":
            return "Tarihi/kulturel rota icin guclu bir durak."
        if category == "NATURE":
            return "Rota temposunu dengeleyen dogal bir mola."
        if category == "FOOD":
            return "Yerel lezzet molasi icin iyi bir secim."
        if category == "ENTERTAINMENT":
            return "Geziye sosyal ve hareketli bir durak ekler."
        return "Rota icinde kolay eklenebilecek dengeli bir durak."

    def _poi_cultural_note(self, poi) -> str:
        metadata = poi.metadata if isinstance(poi.metadata, dict) else {}
        description = metadata.get("description") or metadata.get("summary") or ""
        if description:
            return str(description)[:260]
        if str(poi.category or "").upper() == "HISTORICAL":
            return "Sehrin tarihsel kimligini anlamaya yardim eden, kisa surede anlamli baglam veren bir duraktir."
        return ""

    def _cultural_note(self, category: str, note: str) -> str:
        if category == "history":
            return note
        return ""

    def _important_terms(self, message: str) -> List[str]:
        stopwords = {
            "bana", "icin", "için", "bir", "ve", "ile", "nerede", "nereye",
            "gezi", "rota", "oner", "öner", "tavsiye", "yapar", "misin",
            "gun", "gün", "gunluk", "günlük", "plan", "hazirla", "hazırla",
            "yemek", "yenir", "meshuru", "meşhuru",
        }
        terms = []
        for raw in str(message or "").replace(",", " ").split():
            token = raw.strip(".,!?;:()[]{}").lower()
            if len(token) >= 4 and token not in stopwords:
                terms.append(token)
        return terms[:8]
