from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any, Optional
from enum import Enum
import math
import json
import re
import hashlib
from difflib import SequenceMatcher
from datetime import datetime, timedelta, time
import logging
import requests

from django.db.models import Q
from django.utils import timezone
from django.contrib.gis.geos import Point
from django.conf import settings

from locations.models import POI
from locations.services import ExternalSyncService
from user.poi_categorization import categorize_google_place, map_derived_category_to_poi_category
from .models import Itinerary, ItineraryItem

logger = logging.getLogger(__name__)


class TransportMode(Enum):
    """Enum for transport modes"""
    DRIVING = 'DRIVING'
    WALKING = 'WALKING'
    CYCLING = 'CYCLING'
    TRANSIT = 'TRANSIT'


class DistanceMatrixAPI(ABC):
    """Abstract base class for distance matrix clients"""

    @abstractmethod
    def get_distance_matrix(self, locations: List[Tuple[float, float]], mode: TransportMode) -> List[List[float]]:
        """
        Get distance matrix for a list of locations.
        Returns: N x N matrix where cell (i, j) is travel time from location i to j
        """
        pass


class GoogleDistanceMatrixClient(DistanceMatrixAPI):
    """Google Maps Distance Matrix API client"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def get_distance_matrix(self, locations: List[Tuple[float, float]], mode: TransportMode) -> List[List[float]]:
        """
        Placeholder for Google Distance Matrix API call.
        In production, this would call the Google API.
        """
        # For now, return a mock distance matrix
        n = len(locations)
        matrix = [[0.0] * n for _ in range(n)]

        for i in range(n):
            for j in range(n):
                if i != j:
                    # Calculate haversine distance as placeholder
                    distance = self._haversine_distance(locations[i], locations[j])
                    matrix[i][j] = distance

        return matrix

    @staticmethod
    def _haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        """
        Calculate haversine distance between two coordinates in kilometers.
        Converted to minutes for travel time estimate (assuming ~60 km/h).
        """
        lat1, lon1 = coord1
        lat2, lon2 = coord2

        R = 6371  # Earth radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)

        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(
            dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance_km = R * c

        # Convert to travel time in minutes (assuming ~60 km/h average)
        travel_time_minutes = (distance_km / 60) * 60
        return travel_time_minutes


class RouteOptimizer:
    """
    Domain service that solves the Traveling Salesman Problem (TSP) to find the optimal route.
    Reorders a list of stops for minimal travel time.
    """

    def __init__(self, matrix_client: DistanceMatrixAPI):
        """
        Initialize with a distance matrix API client.

        Args:
            matrix_client: Client for Google/Mapbox Distance Matrix API
        """
        self.matrix_client = matrix_client

    def optimize_route(self, stops: List, mode: TransportMode = TransportMode.DRIVING) -> List:
        """
        Orchestrator method that optimizes the route of stops.

        Args:
            stops: List of POI objects to visit
            mode: Transport mode (DRIVING, WALKING, etc.)

        Returns:
            List of POI objects in optimized order
        """
        if len(stops) <= 2:
            # No optimization needed for 2 or fewer stops
            return stops

        # Validate constraints
        if not self.validate_constraints(stops):
            raise ValueError("Route constraints validation failed")

        # Build distance matrix from locations
        locations = [(stop.location.y, stop.location.x) for stop in stops]
        distance_matrix = self._build_distance_matrix(locations, mode)

        # Solve TSP to find optimal order
        optimal_indices = self._solve_tsp(distance_matrix)

        # Return reordered stops
        return [stops[i] for i in optimal_indices]

    def _build_distance_matrix(self, locations: List[Tuple[float, float]], mode: TransportMode) -> List[List[float]]:
        """
        Constructs an N x N distance/time matrix where cell (i, j) is the travel time
        from location i to location j.

        Args:
            locations: List of (latitude, longitude) tuples
            mode: Transport mode

        Returns:
            Matrix of travel times in minutes
        """
        return self.matrix_client.get_distance_matrix(locations, mode)

    def _solve_tsp(self, matrix: List[List[float]]) -> List[int]:
        """
        Executes the optimization logic using nearest neighbor heuristic.

        Args:
            matrix: Distance/time matrix

        Returns:
            List of indices representing the optimized order
        """
        n = len(matrix)
        unvisited = set(range(1, n))  # Start from stop 0
        current = 0
        path = [0]

        while unvisited:
            nearest = min(unvisited, key=lambda x: matrix[current][x])
            path.append(nearest)
            unvisited.remove(nearest)
            current = nearest

        return path

    def validate_constraints(self, stops: List) -> bool:
        """
        Checks if the route is feasible.
        Validates that all stops have valid location data.

        Args:
            stops: List of POI objects

        Returns:
            True if all constraints are satisfied
        """
        for stop in stops:
            if not stop.location:
                return False
            if not stop.location.valid:
                return False
        return True


class TripGenerationService:
    """Service that creates a city-based itinerary from user interests and duration."""

    _INTEREST_TO_CATEGORY = {
        'HISTORICAL': {'historical', 'history', 'museum', 'monument', 'castle', 'cultural_landmark', 'historical_landmark', 'art_museum'},
        'NATURE': {'nature', 'park', 'national_park', 'state_park', 'beach', 'lake', 'mountain', 'woods', 'garden', 'botanical_garden', 'hiking_area', 'zoo', 'aquarium'},
        'FOOD': {'food', 'restaurant', 'cafe', 'bar', 'bakery', 'coffee_shop', 'meal_takeaway', 'meal_delivery', 'ice_cream_shop'},
        'ENTERTAINMENT': {'entertainment', 'movie_theater', 'night_club', 'amusement_park', 'stadium', 'shopping_mall', 'theater', 'performing_arts_theater'},
    }
    _EXCLUDED_TAGS_FOR_ITINERARY = {
        'hospital',
        'pharmacy',
        'school',
        'university',
        'doctor',
        'dentist',
        'medical_center',
        'health',
        'parking',
        'transit_station',
        'locality',
        'political',
    }
    _EXCLUDED_CATEGORIES_FOR_ITINERARY = {
        'HEALTH_AND_WELLNESS',
        'HEALTH',
        'TRANSPORTATION',
    }
    _BAD_NAME_PHRASES = {
        'maybe',
        'not sure',
        'could use',
        'but uncertain',
        'might not be accurate',
        'we need',
        'real poi',
        's search memory',
        'analysis',
        'output a travel itinerary',
        'ensure no duplicates',
        'pick real',
        'let\'s pick',
        'let\'s list',
        'let\'s gather',
        'need to pick',
        'need real',
        'actually',
        'but maybe',
        'alternatively',
        'duplicate',
        'gather coordinates',
        'find address',
        'address unknown',
        'realistic',
        'distinct',
        'provide 12',
        'provide 4',
        'provide name',
        'let\'s provide',
        'provide lat',
        'provide 12 lines',
        'needs 12',
        'for example',
        'such as',
        'instead of',
    }

    _BLOCKED_SUGGESTION_TOKENS = {
        'candidate_pois', 'candidate_poi', 'candidate ids', 'candidate_ids',
        'category', 'categories', 'description', 'reason', 'address', 'latitude', 'longitude',
        'poi', 'pois', 'day', 'days', 'focus', 'location', 'daily_themes', 'suggested_pois',
        'historical_landmark', 'historical landmark', 'art_gallery', 'art gallery', 'museum',
        'monument', 'food', 'restaurant', 'cafe', 'coffee_shop', 'nature', 'park',
        'entertainment', 'shopping', 'wellness', 'transportation', 'lodging'
    }

    @staticmethod
    def _normalize_interests(interests: List[str]) -> List[str]:
        return [
            str(item or '').strip().lower().replace('-', '_').replace(' ', '_')
            for item in (interests or [])
            if str(item or '').strip()
        ]

    @classmethod
    def _map_interests_to_categories(cls, interests: List[str]) -> List[str]:
        normalized = set(cls._normalize_interests(interests))
        matched = []
        for category, keywords in cls._INTEREST_TO_CATEGORY.items():
            if normalized.intersection(keywords):
                matched.append(category)
        return matched

    @staticmethod
    def _build_city_query(city: str) -> Q:
        city_text = str(city or '').strip()
        normalized = city_text.lower()
        normalized_tag = normalized.replace(' ', '_')

        return (
            Q(address__icontains=city_text)
            | Q(tags__contains=[normalized])
            | Q(tags__contains=[normalized_tag])
            | Q(metadata__city__icontains=city_text)
            | Q(metadata__locality__icontains=city_text)
            | Q(metadata__district__icontains=city_text)
        )

    @classmethod
    def _rank_pois(cls, pois: List[POI], interests: List[str]) -> List[POI]:
        normalized_interests = set(cls._normalize_interests(interests))
        interest_categories = set(cls._map_interests_to_categories(interests))

        def score(poi: POI) -> float:
            poi_tags = {str(tag).strip().lower().replace('-', '_').replace(' ', '_') for tag in (poi.tags or [])}
            category_match = 1 if poi.category in interest_categories else 0
            tag_overlap = len(normalized_interests.intersection(poi_tags))
            rating_score = float(poi.average_rating or 0.0)

            # Weighted popularity + preference fit
            return (rating_score * 2.0) + (category_match * 3.0) + (tag_overlap * 1.0)

        if not interests:
            return sorted(pois, key=lambda p: float(p.average_rating or 0.0), reverse=True)

        return sorted(
            pois,
            key=lambda p: (score(p), float(p.average_rating or 0.0)),
            reverse=True,
        )

    @classmethod
    def _select_diverse_pois(cls, ranked_pois: List[POI], max_stops: int, interests: List[str]) -> List[POI]:
        """
        Select POIs with category diversity.
        Strategy:
        1) Round-robin by category buckets (preferred categories first when interests exist)
        2) Fill remaining slots by global rank order
        """
        if max_stops <= 0 or not ranked_pois:
            return []

        preferred_categories = cls._map_interests_to_categories(interests)
        buckets: Dict[str, List[POI]] = {}
        first_index_by_category: Dict[str, int] = {}

        for idx, poi in enumerate(ranked_pois):
            category = poi.category
            buckets.setdefault(category, []).append(poi)
            if category not in first_index_by_category:
                first_index_by_category[category] = idx

        def category_sort_key(category: str):
            preferred_rank = 0 if category in preferred_categories else 1
            first_rank = first_index_by_category.get(category, 10**9)
            return (preferred_rank, first_rank)

        category_order = sorted(buckets.keys(), key=category_sort_key)

        selected: List[POI] = []
        selected_ids = set()
        # Round-robin for diversity
        while len(selected) < max_stops:
            picked_in_round = 0
            for category in category_order:
                if len(selected) >= max_stops:
                    break
                bucket = buckets.get(category) or []
                while bucket and bucket[0].id in selected_ids:
                    bucket.pop(0)
                if not bucket:
                    continue
                poi = bucket.pop(0)
                selected.append(poi)
                selected_ids.add(poi.id)
                picked_in_round += 1
            if picked_in_round == 0:
                break

        # Fill remaining by original rank
        if len(selected) < max_stops:
            for poi in ranked_pois:
                if len(selected) >= max_stops:
                    break
                if poi.id in selected_ids:
                    continue
                selected.append(poi)
                selected_ids.add(poi.id)

        return selected

    @staticmethod
    def _build_llm_client():
        try:
            from ai_service.services.llm_client import LLMClient
            return LLMClient()
        except Exception:
            return None

    @staticmethod
    def _should_include_ai_debug() -> bool:
        return bool(
            getattr(settings, 'ITINERARY_AI_DEBUG', False)
            or getattr(settings, 'DEBUG', False)
        )

    @staticmethod
    def _generate_llm_json_response(llm_client, *, messages: List[Dict[str, Any]], max_tokens: int = 1200) -> str:
        call_kwargs = {
            'messages': messages,
            'temperature': 0.0,
            'max_tokens': max_tokens,
        }

        response_format_variants = [
            {'type': 'json_object'},
            {'type': 'json_schema', 'json_schema': {'name': 'itinerary_plan', 'schema': {'type': 'object'}}},
        ]

        for response_format in response_format_variants:
            try:
                return llm_client.generate_response(**call_kwargs, response_format=response_format)
            except TypeError:
                break
            except Exception:
                logger.exception('LLM JSON-mode call failed; falling back to next mode')

        return llm_client.generate_response(**call_kwargs)

    @classmethod
    def _normalize_daily_locations(
        cls,
        *,
        city: str,
        duration_days: int,
        daily_locations: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, str]]:
        if not daily_locations:
            return [
                {'day': day + 1, 'location': city, 'notes': ''}
                for day in range(duration_days)
            ]

        normalized_daily_locations = []
        for index in range(duration_days):
            raw_item = daily_locations[index] if index < len(daily_locations) else {}
            if not isinstance(raw_item, dict):
                raw_item = {'location': str(raw_item or '').strip()}
            normalized_daily_locations.append(
                {
                    'day': index + 1,
                    'location': str(raw_item.get('location') or city).strip() or city,
                    'notes': str(raw_item.get('notes') or '').strip(),
                }
            )
        return normalized_daily_locations

    @classmethod
    def _build_candidate_context(cls, candidate_pool: List[POI], city: str) -> List[Dict[str, Any]]:
        """
        Keep candidate context intentionally compact.

        The AI only needs enough information to choose among existing POIs.
        Sending full addresses and coordinates for every candidate increases
        token usage and latency without helping much for day-level selection.
        """
        candidate_context: List[Dict[str, Any]] = []
        for poi in candidate_pool:
            metadata = poi.metadata or {}
            candidate_context.append(
                {
                    'candidate_id': str(poi.id),
                    'name': poi.name,
                    'category': str(poi.category or '').strip(),
                    'tags': [str(tag).strip() for tag in (poi.tags or [])[:6] if str(tag).strip()],
                    'area': (
                        str(metadata.get('district') or '').strip()
                        or str(metadata.get('locality') or '').strip()
                        or str(metadata.get('city') or '').strip()
                        or city
                    ),
                    'rating': float(poi.average_rating or 0.0),
                }
            )
        return candidate_context

    @staticmethod
    def _extract_json_object(text: str) -> Dict[str, Any]:
        payload = str(text or '').strip()
        if not payload:
            return {}

        if payload.startswith("```"):
            payload = payload.strip("`")
            if payload.lower().startswith("json"):
                payload = payload[4:].strip()

        try:
            parsed = json.loads(payload)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            pass

        match = re.search(r"\{[\s\S]*\}", payload)
        if not match:
            return {}

        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _coerce_int_list(values: Any) -> List[int]:
        if not isinstance(values, list):
            return []
        parsed = []
        for item in values:
            try:
                parsed.append(int(item))
            except (TypeError, ValueError):
                continue
        return parsed

    @staticmethod
    def _normalize_text(value: str) -> str:
        return re.sub(r'\s+', ' ', str(value or '').strip().lower())

    @classmethod
    def _extract_indices_from_parsed_response(cls, parsed: Dict[str, Any], candidate_pool: List[POI]) -> List[int]:
        candidate_names = {
            cls._normalize_text(poi.name): idx
            for idx, poi in enumerate(candidate_pool)
        }

        keys = ['ordered_indices', 'ordered_indexes', 'poi_indices', 'itinerary_indices']
        ordered_indices: List[int] = []

        for key in keys:
            ordered_indices = cls._coerce_int_list(parsed.get(key))
            if ordered_indices:
                return ordered_indices

        # Backward compatibility: ordered_poi_ids
        ordered_ids_raw = parsed.get('ordered_poi_ids')
        if isinstance(ordered_ids_raw, list):
            candidate_map_by_id = {str(poi.id): idx for idx, poi in enumerate(candidate_pool)}
            seen = set()
            for item in ordered_ids_raw:
                key = str(item).strip()
                idx = candidate_map_by_id.get(key)
                if idx is None or idx in seen:
                    continue
                ordered_indices.append(idx)
                seen.add(idx)
            if ordered_indices:
                return ordered_indices

        # Nested format support: {"days":[{"stops":[...]}]}
        days = parsed.get('days')
        if isinstance(days, list):
            seen = set()
            for day in days:
                if not isinstance(day, dict):
                    continue
                stops = day.get('stops')
                if not isinstance(stops, list):
                    continue
                for stop in stops:
                    idx = None
                    if isinstance(stop, dict):
                        if stop.get('index') is not None:
                            try:
                                idx = int(stop.get('index'))
                            except (TypeError, ValueError):
                                idx = None
                        elif stop.get('candidate_index') is not None:
                            try:
                                idx = int(stop.get('candidate_index'))
                            except (TypeError, ValueError):
                                idx = None
                        elif stop.get('name'):
                            idx = candidate_names.get(cls._normalize_text(stop.get('name')))
                    elif isinstance(stop, (int, float, str)):
                        try:
                            idx = int(stop)
                        except (TypeError, ValueError):
                            idx = candidate_names.get(cls._normalize_text(stop))

                    if idx is None or idx in seen:
                        continue
                    seen.add(idx)
                    ordered_indices.append(idx)
            if ordered_indices:
                return ordered_indices

        # Name-only list support: {"ordered_poi_names":["..."]}
        name_keys = ['ordered_poi_names', 'ordered_names', 'poi_names']
        for key in name_keys:
            names = parsed.get(key)
            if not isinstance(names, list):
                continue
            seen = set()
            indices = []
            for name in names:
                idx = candidate_names.get(cls._normalize_text(name))
                if idx is None or idx in seen:
                    continue
                seen.add(idx)
                indices.append(idx)
            if indices:
                return indices

        return []

    @staticmethod
    def _extract_indices_from_text(text: str, candidate_count: int) -> List[int]:
        values = re.findall(r'\d+', str(text or ''))
        if not values:
            return []
        seen = set()
        parsed = []
        for item in values:
            idx = int(item)
            if idx < 0 or idx >= candidate_count or idx in seen:
                continue
            seen.add(idx)
            parsed.append(idx)
        return parsed

    @staticmethod
    def _extract_piped_poi_entries(text: str) -> List[Dict[str, Any]]:
        """Parse pipe-delimited POI format: <name> | <address or empty> | <lat,lon or empty> | day <n>
        
        STRICT: Only accept lines with proper pipe separation.
        Format: <name> | <address> | <lat,lon> | day <n>
        """
        entries = []
        seen_names = set()
        
        for line in str(text or '').splitlines():
            clean_line = re.sub(r'\s+', ' ', line).strip()
            if not clean_line or clean_line.count('|') < 2:
                continue
            
            # Strict regex to ensure proper pipe format
            # Pattern: text | text | optional_coords | optional_day
            pattern = r'^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$|^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$'
            match = re.match(pattern, clean_line)
            if not match:
                continue
            
            # Extract from groups
            if match.group(1):  # Full 4-part format
                name = match.group(1).strip()
                address = match.group(2).strip()
                coords = match.group(3).strip()
                day_str = match.group(4).strip()
            else:  # 3-part format (missing day)
                name = match.group(5).strip()
                address = match.group(6).strip()
                coords = match.group(7).strip()
                day_str = ""
            
            # Validate name: not a meta-text fragment
            name = re.sub(r'^\s*[-*•#\d\.\)\(]+\s*', '', name).strip()
            if len(name) < 3:
                continue
            
            # Reject obvious fragments and meta-text
            if re.match(r'^[a-z]\s+', name):  # Single letter prefix
                continue
            if any(word in name.lower() for word in ('ensure', 'pick', 'provide', 'need', 'let', 'gather', 'but ', 'maybe')):
                continue
            
            key = name.lower()
            if key in seen_names:
                continue
            
            # Parse coordinates if present
            lat, lon = None, None
            if coords and coords not in ('', 'empty', 'unknown'):
                coord_match = re.search(r'(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)', coords)
                if coord_match:
                    try:
                        lat = float(coord_match.group(1))
                        lon = float(coord_match.group(2))
                    except (ValueError, AttributeError):
                        pass
            
            # Parse day number
            day = None
            if day_str:
                day_match = re.search(r'day\s*(\d+)', day_str, re.IGNORECASE)
                if day_match:
                    try:
                        day = int(day_match.group(1))
                    except ValueError:
                        pass
            
            seen_names.add(key)
            entries.append({
                'name': name,
                'address': address if address not in ('', 'empty', 'unknown') else "",
                'latitude': lat,
                'longitude': lon,
                'day': day,
            })
        
        return entries

    @staticmethod
    def _extract_names_from_text(text: str) -> List[str]:
        text_value = str(text or '')

        # FIRST: Direct pipe-delimited format with strict regex - highest priority
        # This catches lines like: "Galata Tower | Galata, Istanbul | 41.0250,28.9820 | day 1"
        piped_names = []
        seen_piped = set()
        
        # Strict regex pattern for piped format: name | address | coords | day
        piped_pattern = r'^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(?:day\s*)?(\d+)'
        for line in text_value.splitlines():
            clean_line = re.sub(r'\s+', ' ', line).strip()
            if not clean_line:
                continue
            
            # Try strict piped format first
            match = re.match(piped_pattern, clean_line, re.IGNORECASE)
            if match:
                candidate = match.group(1).strip()
                candidate = re.sub(r'^\s*[-*•#\d\.\)\(]+\s*', '', candidate).strip()
                
                if len(candidate) < 3:
                    continue
                
                # Reject obvious fragments/meta-text
                if re.match(r'^[a-z]\s+', candidate):
                    continue
                
                key = candidate.lower()
                if key in seen_piped:
                    continue
                
                seen_piped.add(key)
                piped_names.append(candidate)
        
        if piped_names:
            return piped_names

        # FALLBACK: Direct pipe-delimited format without strict regex (more lenient)
        # This catches lines like: "Name | address | coords"
        piped_names_lenient = []
        seen_piped_len = set()
        for line in text_value.splitlines():
            clean_line = re.sub(r'\s+', ' ', line).strip()
            if not clean_line or '|' not in clean_line:
                continue
            candidate = clean_line.split('|', 1)[0].strip()
            candidate = re.sub(r'^\s*[-*•#\d\.\)\(]+\s*', '', candidate).strip()
            candidate = re.sub(r'[.,;:\s]+$', '', candidate).strip()
            if len(candidate) < 3:
                continue
            # Reject if looks like a fragment (single letter prefix) or meta-text
            if re.match(r'^[a-z]\s+', candidate):
                continue
            key = candidate.lower()
            if key in seen_piped_len:
                continue
            seen_piped_len.add(key)
            piped_names_lenient.append(candidate)
        if piped_names_lenient:
            return piped_names_lenient

        # Extract quoted names early.
        quoted_names = []
        seen_quoted = set()
        for match in re.findall(r'["“”\']([^"“”\']{3,80})["“”\']', text_value):
            candidate = re.sub(r'\s+', ' ', match).strip()
            if len(candidate) < 3:
                continue
            lower = candidate.lower()
            if lower.startswith(('we need', 'json', 'day ', 'city:', 'duration', 'interests')):
                continue
            if lower in seen_quoted:
                continue
            seen_quoted.add(lower)
            quoted_names.append(candidate)
        if quoted_names:
            return quoted_names

        # Prefer explicit numbered list items if present.
        numbered_names = []
        seen_numbered = set()
        numbered_matches = re.findall(r'(?:^|\n)\s*\d+\.\s*([^\n]+)', text_value)
        for raw_item in numbered_matches:
            candidate = raw_item.split('|', 1)[0].strip()
            candidate = re.sub(r'\([^)]*\)', '', candidate).strip()
            candidate = re.split(r'\s+[–—-]\s+|:\s+', candidate, maxsplit=1)[0].strip()
            candidate = re.sub(r'[.,;:\s]+$', '', candidate).strip()
            if len(candidate) < 3:
                continue
            # Reject if looks like a fragment (single letter prefix) or meta-text
            if re.match(r'^[a-z]\s+', candidate):
                continue
            key = candidate.lower()
            if key in seen_numbered:
                continue
            # Additional check: valid POI names should have meaningful words, not meta-text
            if any(word in key for word in ('ensure', 'pick', 'provide', 'need', 'let', 'gather')):
                continue
            seen_numbered.add(key)
            numbered_names.append(candidate)
        if numbered_names:
            return numbered_names

        # Parse bulleted list items.
        bulleted_names = []
        seen_bulleted = set()
        bulleted_matches = re.findall(r'(?:^|\n)\s*[-*•]\s*([^\n]+)', text_value)
        for raw_item in bulleted_matches:
            candidate = raw_item.split('|', 1)[0].strip()
            candidate = re.sub(r'\([^)]*\)', '', candidate).strip()
            candidate = re.sub(r'[.,;:\s]+$', '', candidate).strip()
            if len(candidate) < 3:
                continue
            # Reject if looks like a fragment (single letter prefix) or meta-text
            if re.match(r'^[a-z]\s+', candidate):
                continue
            key = candidate.lower()
            if key in seen_bulleted:
                continue
            # Additional check: valid POI names should have meaningful words, not meta-text
            if any(word in key for word in ('ensure', 'pick', 'provide', 'need', 'let', 'gather')):
                continue
            seen_bulleted.add(key)
            bulleted_names.append(candidate)
        if bulleted_names:
            return bulleted_names

        day_block_matches = re.findall(r'Day\s*\d+\s*:\s*([^\n]+)', str(text or ''), flags=re.IGNORECASE)
        day_names = []
        seen_day = set()
        for block in day_block_matches:
            parts = [part.strip() for part in block.split(',')]
            for part in parts:
                name = re.sub(r'\([^)]*\)', '', part).strip()
                if len(name) < 3:
                    continue
                # Reject if looks like a fragment (single letter prefix) or meta-text
                if re.match(r'^[a-z]\s+', name):
                    continue
                key = name.lower()
                if key in seen_day:
                    continue
                # Additional check: valid POI names should have meaningful words, not meta-text
                if any(word in key for word in ('ensure', 'pick', 'provide', 'need', 'let', 'gather')):
                    continue
                seen_day.add(key)
                day_names.append(name)
        if day_names:
            return day_names

        # Extract from "e.g., A, B, C" style prose.
        prose_examples = []
        seen_examples = set()
        for match in re.findall(r'(?:e\.g\.|for example|such as)\s*[:\-]?\s*([^\n]+)', text_value, flags=re.IGNORECASE):
            parts = [part.strip() for part in match.split(',')]
            for part in parts:
                name = re.sub(r'\([^)]*\)', '', part).strip()
                name = re.sub(r'[.,;:\s]+$', '', name).strip()
                if len(name) < 3:
                    continue
                key = name.lower()
                if key in seen_examples:
                    continue
                seen_examples.add(key)
                prose_examples.append(name)
        if prose_examples:
            return prose_examples

        # Do not parse arbitrary prose lines; it causes garbage POI names.
        return []

    @classmethod
    def _sanitize_suggested_names(cls, names: List[str], city: str) -> List[str]:
        city_norm = re.sub(r'\s+', ' ', str(city or '').strip().lower())
        blocked_prefixes = (
            'we need', 'let us', "let's", 'return ', 'city:', 'duration', 'interests',
            'max stops', 'provide ', 'output ', 'json', 'day ', 'so we need',
        )
        meta_text_patterns = (
            'ensure no duplicates', 'pick real', 'provide ', "let's pick", "let's list",
            "let's gather", 'need to', 'need real', 'now pick', 'actually ', 'but we need',
            'alternatively pick', 'such as', 'for example', 'instead of', 'maybe', 'let me',
            'gather coordinates', 'find address', 'coordinate', 'address unknown', 'realistic', 'distinct',
        )

        cleaned = []
        seen = set()
        for value in names or []:
            name = re.sub(r'\s+', ' ', str(value or '').strip())
            name = name.lstrip('.').strip()
            if len(name) < 3:
                continue
            lower = name.lower()
            normalized = lower.replace('-', ' ').replace('_', ' ').strip()

            if lower.startswith(blocked_prefixes):
                continue
            if any(phrase in lower for phrase in meta_text_patterns):
                continue
            if any(phrase in lower for phrase in cls._BAD_NAME_PHRASES):
                continue
            if lower in {city_norm, f'{city_norm}, turkey', f'{city_norm}, türkiye'}:
                continue
            if normalized in cls._BLOCKED_SUGGESTION_TOKENS or lower in cls._BLOCKED_SUGGESTION_TOKENS:
                continue
            if re.match(r'^[a-z]\s+', name):
                continue
            if re.match(r'^\d+\.', name):
                continue
            if '|' in name:
                continue
            if not re.search(r'[A-Za-zÀ-ÿ]', name):
                continue
            if len(name.split()) > 8:
                continue
            if name.count('.') > 1:
                continue
            # Reject obvious schema-ish single-token or snake_case placeholders.
            if ('_' in name or name.islower()) and len(name.split()) <= 2 and normalized in cls._BLOCKED_SUGGESTION_TOKENS:
                continue
            # Reject generic noun phrases without a proper place-like signal.
            if len(name.split()) <= 3 and normalized in cls._BLOCKED_SUGGESTION_TOKENS:
                continue

            key = lower
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(name)

        return cleaned

    @classmethod
    def _extract_suggested_names(cls, parsed: Dict[str, Any], raw_text: str) -> List[str]:
        suggested = parsed.get('suggested_pois') if isinstance(parsed, dict) else None
        names = []
        if isinstance(suggested, list):
            for item in suggested:
                if isinstance(item, dict) and item.get('name'):
                    names.append(str(item.get('name')).strip())
                elif isinstance(item, str) and item.strip():
                    names.append(item.strip())

        normalized = []
        seen = set()
        for name in cls._sanitize_suggested_names(names, ''):
            clean = str(name or '').strip()
            if not clean:
                continue
            key = clean.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(clean)
        return normalized

    @classmethod
    def _extract_suggested_items(cls, parsed: Dict[str, Any], raw_text: str) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        suggested = parsed.get('suggested_pois') if isinstance(parsed, dict) else None
        if not isinstance(suggested, list):
            return []

        for item in suggested:
            if isinstance(item, dict):
                name = str(item.get('name') or '').strip()
                if not name:
                    continue
                items.append(
                    {
                        'name': name,
                        'reason': str(item.get('reason') or '').strip(),
                        'address': str(item.get('address') or '').strip(),
                        'day': item.get('suggested_day') if item.get('suggested_day') is not None else item.get('day'),
                        'latitude': item.get('latitude'),
                        'longitude': item.get('longitude'),
                    }
                )
            elif isinstance(item, str) and item.strip():
                items.append({'name': item.strip()})

        return items

    @classmethod
    def _is_poi_suitable_for_itinerary(cls, poi: POI, interests: List[str]) -> bool:
        tags = {cls._normalize_text(tag) for tag in (poi.tags or [])}
        interests_set = {cls._normalize_text(item) for item in (interests or [])}
        category = str(poi.category or '').upper()
        name_norm = cls._normalize_text(poi.name)

        # If user explicitly asks for otherwise excluded concepts, allow them.
        explicit_override = bool(interests_set.intersection({'lodging', 'hotel', 'hostel', 'hospital', 'pharmacy'}))

        if not explicit_override:
            if category in cls._EXCLUDED_CATEGORIES_FOR_ITINERARY:
                return False
            if tags.intersection(cls._EXCLUDED_TAGS_FOR_ITINERARY):
                return False
            if any(token in name_norm for token in ('hospital', 'pharmacy', 'clinic', 'school', 'university')):
                return False
            if 'lodging' in tags or 'hotel' in tags or 'hostel' in tags:
                return False

        # Avoid previously created junk/noise POIs from malformed model text.
        if not cls._sanitize_suggested_names([str(poi.name or '')], str((poi.metadata or {}).get('city') or '')):
            return False

        return True

    @classmethod
    def _match_suggested_names_to_pois(cls, suggested_names: List[str], candidate_pool: List[POI]) -> List[POI]:
        if not suggested_names or not candidate_pool:
            return []

        exact_map = {}
        for poi in candidate_pool:
            exact_map.setdefault(cls._normalize_text(poi.name), []).append(poi)

        selected: List[POI] = []
        selected_ids = set()

        for name in suggested_names:
            normalized = cls._normalize_text(name)
            matched = None

            # 1) exact normalized match
            exact_candidates = exact_map.get(normalized) or []
            for poi in exact_candidates:
                if poi.id not in selected_ids:
                    matched = poi
                    break

            # 2) contains match
            if matched is None:
                for poi in candidate_pool:
                    if poi.id in selected_ids:
                        continue
                    poi_norm = cls._normalize_text(poi.name)
                    if normalized in poi_norm or poi_norm in normalized:
                        matched = poi
                        break

            # 3) fuzzy best match
            if matched is None:
                best_score = 0.0
                best_poi = None
                for poi in candidate_pool:
                    if poi.id in selected_ids:
                        continue
                    poi_norm = cls._normalize_text(poi.name)
                    score = SequenceMatcher(None, normalized, poi_norm).ratio()
                    if score > best_score:
                        best_score = score
                        best_poi = poi
                if best_poi is not None and best_score >= 0.72:
                    matched = best_poi

            if matched is not None and matched.id not in selected_ids:
                selected.append(matched)
                selected_ids.add(matched.id)

        return selected

    @classmethod
    def _infer_category_for_suggestion(cls, text: str, interests: List[str]) -> str:
        normalized_interests = cls._normalize_interests(interests)
        classification = categorize_google_place(normalized_interests, str(text or ''))
        if classification.get('derived_category') and classification.get('derived_category') != 'OTHER':
            return map_derived_category_to_poi_category(classification.get('derived_category'))

        mapped = cls._map_interests_to_categories(normalized_interests)

        if mapped:
            return mapped[0]
        return POI.Category.ENTERTAINMENT

    @classmethod
    def _find_existing_city_poi_by_name(cls, city: str, name: str) -> POI | None:
        city_query = cls._build_city_query(city)
        normalized_name = str(name or '').strip()
        if not normalized_name:
            return None

        exact = POI.objects.filter(city_query, name__iexact=normalized_name).order_by('-average_rating').first()
        if exact:
            return exact

        starts_with = POI.objects.filter(city_query, name__istartswith=normalized_name).order_by('-average_rating').first()
        if starts_with:
            return starts_with

        contains = POI.objects.filter(city_query, name__icontains=normalized_name).order_by('-average_rating').first()
        return contains

    @classmethod
    def _geocode_place_name(cls, city: str, place_name: str) -> Dict[str, Any]:
        query = f"{place_name}, {city}"
        try:
            response = requests.get(
                'https://nominatim.openstreetmap.org/search',
                params={
                    'q': query,
                    'format': 'jsonv2',
                    'addressdetails': 1,
                    'limit': 1,
                },
                headers={'User-Agent': 'ExcursaTripGeneration/1.0'},
                timeout=8,
            )
            response.raise_for_status()
            results = response.json() or []
            if not results:
                return {}
            item = results[0]
            lat = float(item.get('lat'))
            lon = float(item.get('lon'))
            display_name = str(item.get('display_name') or '').strip()
            return {
                'latitude': lat,
                'longitude': lon,
                'address': display_name or f"{place_name}, {city}",
                'source': 'nominatim_place_search',
                'osm_place_id': item.get('place_id'),
            }
        except Exception:
            return {}

    @classmethod
    def _upsert_ai_suggested_poi(cls, *, city: str, suggestion: Dict[str, Any], interests: List[str]) -> POI | None:
        name = str(suggestion.get('name') or '').strip()
        if not name:
            return None
        if not cls._sanitize_suggested_names([name], city):
            return None
        if cls._normalize_text(name) == cls._normalize_text(city):
            return None

        # Reject obvious non-tourism places even if the LLM suggests them.
        name_classification = categorize_google_place([], name)
        if name_classification.get('blocked_types'):
            return None

        existing = cls._find_existing_city_poi_by_name(city, name)
        if existing:
            return existing

        latitude = suggestion.get('latitude')
        longitude = suggestion.get('longitude')
        address = str(suggestion.get('address') or '').strip()

        try:
            latitude = float(latitude) if latitude is not None else None
            longitude = float(longitude) if longitude is not None else None
        except (TypeError, ValueError):
            latitude = None
            longitude = None

        if latitude is None or longitude is None:
            geo = cls._geocode_place_name(city, name)
            latitude = geo.get('latitude')
            longitude = geo.get('longitude')
            if not address:
                address = str(geo.get('address') or '').strip()
        else:
            geo = {}

        if latitude is None or longitude is None:
            return None

        reason = str(suggestion.get('reason') or '').strip()
        category = cls._infer_category_for_suggestion(f"{name} {reason}", interests)
        city_tag = city.lower().replace(' ', '_')
        tags = ['ai_suggested', city_tag] + cls._normalize_interests(interests)[:6]
        tags = [tag for tag in dict.fromkeys(tags) if tag]

        raw_key = f"{city}|{name}|{round(float(latitude), 5)}|{round(float(longitude), 5)}"
        hash_key = hashlib.sha1(raw_key.encode('utf-8')).hexdigest()[:20]
        external_id = f"ai-{hash_key}"

        metadata = {
            'source': 'ai_suggested',
            'suggested_reason': reason,
            'city': city,
            'geocode': geo,
        }
        defaults = {
            'name': name,
            'address': address or f"{name}, {city}",
            'location': Point(float(longitude), float(latitude)),
            'category': category,
            'average_rating': 4.2,
            'metadata': metadata,
            'tags': tags,
        }
        try:
            poi, _ = POI.objects.update_or_create(external_id=external_id, defaults=defaults)
            return poi
        except Exception:
            logger.exception("Failed creating AI suggested POI city=%s name=%s", city, name)
            return None

    @classmethod
    def _suggest_pois_with_ai(
        cls,
        *,
        city: str,
        duration_days: int,
        interests: List[str],
        stops_per_day: int,
        daily_locations: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        llm_client = cls._build_llm_client()
        if llm_client is None:
            return {'reason': 'llm_unavailable', 'suggested_pois': [], 'daily_themes': []}

        daily_locations = cls._normalize_daily_locations(
            city=city,
            duration_days=duration_days,
            daily_locations=daily_locations,
        )
        max_suggestions = max(duration_days * stops_per_day + 4, min(duration_days * stops_per_day + 8, 24))

        system_prompt = f"""Return ONLY valid JSON.
Do NOT write explanations.
Do NOT write reasoning.
Do NOT write markdown.
Do NOT write code fences.
Do NOT write any text outside the JSON object.
The response must be parseable by json.loads().

Schema:
{{
  "daily_themes": ["string"],
  "suggested_pois": [
    {{
      "name": "string",
      "reason": "string",
      "address": "string",
      "suggested_day": 1
    }}
  ]
}}

Rules:
- Suggest between {duration_days * stops_per_day} and {max_suggestions} POIs, prioritizing quality over quantity.
- Use only real, visitable, city-relevant POIs.
- Prefer famous landmarks, museums, major parks, notable cultural sites, and high-signal places matching the interests.
- Avoid hospitals, schools, office buildings, random businesses, parking areas, and generic local services.
- Avoid duplicates and near-duplicates.
- suggested_day must be between 1 and {duration_days}.
- address may be empty if unknown.
- Never output schema words, category names, field names, placeholders, or descriptive fragments as POI names.
- Examples of forbidden outputs: candidate_pois, category, description, historical_landmark, art_gallery.
- Allowed top-level keys: daily_themes, suggested_pois.
- Allowed POI keys: name, reason, address, suggested_day.
"""

        payload_json = json.dumps(
            {
                'city': city,
                'duration_days': duration_days,
                'stops_per_day': stops_per_day,
                'interests': interests,
                'daily_locations': daily_locations,
                'instructions': 'Suggest candidate POIs first. Planning into verified day-by-day route happens later.',
            },
            ensure_ascii=False,
        )
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': payload_json},
        ]

        raw_response = ''
        retry_raw = ''
        parsed: Dict[str, Any] = {}
        try:
            raw_response = cls._generate_llm_json_response(
                llm_client,
                messages=messages,
                max_tokens=1800,
            )
            parsed = cls._extract_json_object(raw_response)
        except Exception:
            logger.exception('AI POI suggestion first pass failed city=%s', city)

        if not isinstance(parsed, dict) or not isinstance(parsed.get('suggested_pois'), list):
            retry_messages = [
                {
                    'role': 'system',
                    'content': (
                        'Return ONLY valid JSON. No prose. No markdown. No code fences. '
                        'Use exactly the same schema as before. Output the final JSON object directly.'
                    ),
                },
                {'role': 'user', 'content': payload_json},
            ]
            try:
                retry_raw = cls._generate_llm_json_response(
                    llm_client,
                    messages=retry_messages,
                    max_tokens=1800,
                )
                parsed = cls._extract_json_object(retry_raw)
            except Exception:
                logger.exception('AI POI suggestion retry failed city=%s', city)

        source_text = raw_response or retry_raw
        suggested_items = cls._extract_suggested_items(parsed if isinstance(parsed, dict) else {}, source_text)
        suggested_items = [
            item for item in suggested_items
            if cls._sanitize_suggested_names([str(item.get('name') or '')], city)
        ][:max_suggestions]

        result = {
            'reason': 'ok' if suggested_items else 'invalid_ai_output',
            'suggested_pois': suggested_items,
            'daily_themes': [
                str(item).strip()
                for item in (parsed.get('daily_themes') if isinstance(parsed, dict) and isinstance(parsed.get('daily_themes'), list) else [])
                if str(item).strip()
            ],
        }
        if cls._should_include_ai_debug():
            result['suggestions_ai_debug'] = {
                'raw_response': raw_response,
                'retry_raw_response': retry_raw,
                'parsed_response': parsed if isinstance(parsed, dict) else {},
            }
        return result

    @classmethod
    def _resolve_ai_suggested_pois(
        cls,
        *,
        city: str,
        suggestions: List[Dict[str, Any]],
        interests: List[str],
        max_stops: int,
        min_rating: Optional[float] = None,
    ) -> Dict[str, Any]:
        resolved: List[POI] = []
        seen_ids = set()
        unresolved: List[Dict[str, Any]] = []
        debug_items: List[Dict[str, Any]] = []
        city_center = cls._geocode_city_center(city)

        max_candidates_to_resolve = min(max(max_stops + 4, 12), max_stops * 2)
        for suggestion in (suggestions or [])[:max_candidates_to_resolve]:
            name = str(suggestion.get('name') or '').strip()
            if not name:
                continue
            if not cls._sanitize_suggested_names([name], city):
                if cls._should_include_ai_debug():
                    debug_items.append({'name': name, 'status': 'filtered_schema_or_noise'})
                continue

            resolved_poi = cls._find_existing_city_poi_by_name(city, name)
            resolution_source = 'db_match' if resolved_poi is not None else None

            if resolved_poi is None:
                resolved_poi = cls._upsert_ai_suggested_poi(
                    city=city,
                    suggestion=suggestion,
                    interests=interests,
                )
                if resolved_poi is not None:
                    resolution_source = str((resolved_poi.metadata or {}).get('source') or 'external_lookup')

            if resolved_poi is None:
                unresolved.append(suggestion)
                if cls._should_include_ai_debug():
                    debug_items.append({'name': name, 'status': 'unresolved'})
                continue

            if min_rating is not None and float(resolved_poi.average_rating or 0.0) < float(min_rating):
                if cls._should_include_ai_debug():
                    debug_items.append({'name': name, 'status': 'filtered_min_rating'})
                continue

            if city_center and getattr(resolved_poi, 'location', None):
                try:
                    poi_lat = float(resolved_poi.location.y)
                    poi_lon = float(resolved_poi.location.x)
                    distance_km = GoogleDistanceMatrixClient._haversine_distance(
                        (float(city_center['lat']), float(city_center['lon'])),
                        (poi_lat, poi_lon),
                    )
                    if distance_km > 80:
                        unresolved.append(suggestion)
                        if cls._should_include_ai_debug():
                            debug_items.append({'name': name, 'status': 'filtered_out_of_city_radius'})
                        continue
                except Exception:
                    pass

            if not cls._is_poi_suitable_for_itinerary(resolved_poi, interests):
                if cls._should_include_ai_debug():
                    debug_items.append({'name': name, 'status': 'filtered_unsuitable'})
                continue

            if resolved_poi.id in seen_ids:
                if cls._should_include_ai_debug():
                    debug_items.append({'name': name, 'status': 'duplicate'})
                continue

            seen_ids.add(resolved_poi.id)
            resolved.append(resolved_poi)
            if cls._should_include_ai_debug():
                debug_items.append({'name': name, 'status': 'resolved', 'source': resolution_source, 'poi_id': str(resolved_poi.id)})

        result = {
            'resolved_pois': resolved,
            'unresolved_suggestions': unresolved,
            'reason': 'ok' if resolved else 'no_verified_candidates',
        }
        if cls._should_include_ai_debug():
            result['resolver_ai_debug'] = {'items': debug_items}
        return result

    @classmethod
    def _deduplicate_ai_day_plans(cls, days_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Post-process AI output to guarantee no POI appears more than once across all days.
        This is a safety net to ensure the AI follows the no-repeat rule.
        """
        if not isinstance(days_data, list):
            return []
        
        seen_ids = set()
        deduplicated_days = []
        
        for day_item in days_data:
            if not isinstance(day_item, dict):
                continue
            
            # Get the raw candidate IDs for this day
            raw_ids = day_item.get('poi_candidate_ids', [])
            if not isinstance(raw_ids, list):
                # Fallback for older format
                raw_ids = []
                pois = day_item.get('pois', [])
                if isinstance(pois, list):
                    for poi_entry in pois:
                        if isinstance(poi_entry, dict) and 'candidate_id' in poi_entry:
                            raw_ids.append(str(poi_entry['candidate_id']).strip())
                        elif isinstance(poi_entry, str):
                            raw_ids.append(str(poi_entry).strip())
            
            # Filter out any duplicate IDs
            unique_ids_for_day = []
            for candidate_id in raw_ids:
                candidate_id_str = str(candidate_id).strip()
                if not candidate_id_str:
                    continue
                # Skip if already used in any previous day
                if candidate_id_str in seen_ids:
                    continue
                # Skip if already in this day's list
                if candidate_id_str in unique_ids_for_day:
                    continue
                
                unique_ids_for_day.append(candidate_id_str)
                seen_ids.add(candidate_id_str)
            
            # Create deduplicated day item
            deduplicated_day = {
                'day': day_item.get('day', len(deduplicated_days) + 1),
                'location': day_item.get('location', ''),
                'focus': day_item.get('focus', ''),
                'poi_candidate_ids': unique_ids_for_day,
            }
            deduplicated_days.append(deduplicated_day)
        
        return deduplicated_days

    @classmethod
    def _plan_with_ai(
        cls,
        *,
        city: str,
        duration_days: int,
        interests: List[str],
        stops_per_day: int,
        ranked_pois: List[POI],
        max_stops: int,
        daily_locations: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        llm_client = cls._build_llm_client()
        if llm_client is None:
            return {'reason': 'llm_unavailable'}

        candidate_pool = ranked_pois[:max(12, min(len(ranked_pois), max_stops * 6))]
        if not candidate_pool:
            return {'reason': 'no_candidates'}

        daily_locations = cls._normalize_daily_locations(
            city=city,
            duration_days=duration_days,
            daily_locations=daily_locations,
        )
        candidate_context = cls._build_candidate_context(candidate_pool, city)
        candidate_map_by_id: Dict[str, POI] = {str(poi.id): poi for poi in candidate_pool}
        candidate_map_by_name: Dict[str, POI] = {}
        for poi in candidate_pool:
            candidate_map_by_name.setdefault(cls._normalize_text(poi.name), poi)

        system_prompt = f"""Return ONLY valid JSON.
Do NOT write explanations.
Do NOT write reasoning.
Do NOT write markdown.
Do NOT write code fences.
Do NOT write any text outside the JSON object.
The response must be parseable by json.loads().

Schema:
{{
  "daily_themes": ["string"],
  "days": [
    {{
      "day": 1,
      "location": "string",
      "focus": "string",
      "poi_candidate_ids": ["uuid-string"]
    }}
  ]
}}

CRITICAL RULES (MUST FOLLOW - NO EXCEPTIONS):
1. ABSOLUTELY NO POI can be used more than once across the entire {duration_days}-day itinerary.
2. Track all POI ids you use to ensure ZERO repetition across days.
3. Each day should have unique POIs - no duplicate ids across day arrays.
4. Do NOT repeat a POI inside the same day either.
5. If you cannot fill all {stops_per_day} slots per day without repeating, leave slots empty - do NOT repeat POIs.

Instructions:
- Return exactly {duration_days} day objects.
- Aim for exactly {stops_per_day} unique candidate ids per day.
- Use ONLY candidate ids from the provided candidate_pois list.
- Do NOT invent new POIs.
- Do NOT return addresses, coordinates, reasons, or any extra fields.
- Keep day locations aligned with the provided daily_locations.
- Maximize coverage and variety across the full trip.
- Allowed top-level keys: daily_themes, days.
- Allowed day keys: day, location, focus, poi_candidate_ids.
"""

        user_payload = {
            'city': city,
            'duration_days': duration_days,
            'stops_per_day': stops_per_day,
            'interests': interests,
            'daily_locations': daily_locations,
            'candidate_pois': candidate_context,
        }
        payload_json = json.dumps(user_payload, ensure_ascii=False)
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': payload_json},
        ]

        raw_response = ''
        retry_raw = ''
        parsed: Dict[str, Any] = {}

        try:
            raw_response = cls._generate_llm_json_response(
                llm_client,
                messages=messages,
                max_tokens=2000,
            )
            parsed = cls._extract_json_object(raw_response)
        except Exception:
            logger.exception('AI itinerary planning first pass failed city=%s', city)

        if not isinstance(parsed, dict) or not isinstance(parsed.get('days'), list):
            retry_messages = [
                {
                    'role': 'system',
                    'content': (
                        'Return ONLY valid JSON. No prose. No markdown. No code fences. '
                        'Use exactly the same schema as before. Output the final JSON object directly.'
                    ),
                },
                {'role': 'user', 'content': payload_json},
            ]
            try:
                retry_raw = cls._generate_llm_json_response(
                    llm_client,
                    messages=retry_messages,
                    max_tokens=2000,
                )
                parsed = cls._extract_json_object(retry_raw)
            except Exception:
                logger.exception('AI itinerary planning retry failed city=%s', city)

        days_data = parsed.get('days') if isinstance(parsed, dict) else None
        if not isinstance(days_data, list):
            logger.warning(
                'AI planning unusable JSON city=%s model_output_preview=%s retry_preview=%s',
                city,
                str(raw_response or '')[:220].replace('\n', ' '),
                str(retry_raw or '')[:220].replace('\n', ' '),
            )
            result = {'reason': 'invalid_ai_output'}
            if cls._should_include_ai_debug():
                result.update(
                    {
                        'raw_response': raw_response,
                        'retry_raw_response': retry_raw,
                        'parsed_response': parsed if isinstance(parsed, dict) else {},
                    }
                )
            return result

        # Deduplicate AI output to guarantee no POI appears more than once
        days_data = cls._deduplicate_ai_day_plans(days_data)

        selected_pois: List[POI] = []
        selected_ids = set()
        globally_used_ids = set()
        day_plans: List[Dict[str, Any]] = []
        duplicate_debug: List[Dict[str, Any]] = []

        def _append_selected(poi: POI):
            if poi.id in selected_ids or len(selected_pois) >= max_stops:
                return
            selected_pois.append(poi)
            selected_ids.add(poi.id)

        def _rank_fillers_for_day(day_index: int, day_item: Dict[str, Any], *, exclude_ids: set, allow_global_reuse: bool) -> List[POI]:
            location_hint = str(day_item.get('location') or daily_locations[day_index]['location'] or city).strip()
            ranked_for_day = cls._rank_pois(ranked_pois, interests + [location_hint])
            if allow_global_reuse:
                return [poi for poi in ranked_for_day if poi.id not in exclude_ids]
            return [poi for poi in ranked_for_day if poi.id not in exclude_ids and poi.id not in globally_used_ids]

        unique_capacity = len({poi.id for poi in ranked_pois})
        needs_reuse = unique_capacity < max_stops

        for day_index in range(duration_days):
            day_item = days_data[day_index] if day_index < len(days_data) and isinstance(days_data[day_index], dict) else {}

            raw_candidate_ids = day_item.get('poi_candidate_ids')
            if not isinstance(raw_candidate_ids, list):
                # Backward compatibility for older prompt/output formats.
                poi_entries = day_item.get('pois') if isinstance(day_item.get('pois'), list) else []
                raw_candidate_ids = []
                for poi_entry in poi_entries:
                    if isinstance(poi_entry, dict) and poi_entry.get('candidate_id') is not None:
                        raw_candidate_ids.append(str(poi_entry.get('candidate_id')).strip())
                    elif isinstance(poi_entry, str):
                        raw_candidate_ids.append(poi_entry.strip())

            resolved_day_pois: List[POI] = []
            resolved_day_ids = set()

            for candidate_id in raw_candidate_ids[:stops_per_day]:
                matched_poi = candidate_map_by_id.get(str(candidate_id).strip())
                if matched_poi is None:
                    continue
                if matched_poi.id in resolved_day_ids:
                    if cls._should_include_ai_debug():
                        duplicate_debug.append({'day': day_index + 1, 'candidate_id': str(candidate_id), 'status': 'duplicate_within_day_from_ai'})
                    continue
                if matched_poi.id in globally_used_ids:
                    if cls._should_include_ai_debug():
                        duplicate_debug.append({'day': day_index + 1, 'candidate_id': str(candidate_id), 'status': 'duplicate_across_days_from_ai'})
                    continue

                resolved_day_pois.append(matched_poi)
                resolved_day_ids.add(matched_poi.id)
                globally_used_ids.add(matched_poi.id)
                _append_selected(matched_poi)

            if len(resolved_day_pois) < stops_per_day:
                filler_ranked = _rank_fillers_for_day(day_index, day_item, exclude_ids=resolved_day_ids, allow_global_reuse=False)
                for poi in filler_ranked:
                    if len(resolved_day_pois) >= stops_per_day:
                        break
                    if poi.id in resolved_day_ids or poi.id in globally_used_ids:
                        continue
                    resolved_day_pois.append(poi)
                    resolved_day_ids.add(poi.id)
                    globally_used_ids.add(poi.id)
                    _append_selected(poi)

            # Last-resort fallback only when there are not enough unique candidates for all slots.
            if len(resolved_day_pois) < stops_per_day and needs_reuse:
                filler_ranked = _rank_fillers_for_day(day_index, day_item, exclude_ids=resolved_day_ids, allow_global_reuse=True)
                for poi in filler_ranked:
                    if len(resolved_day_pois) >= stops_per_day:
                        break
                    if poi.id in resolved_day_ids:
                        continue
                    resolved_day_pois.append(poi)
                    resolved_day_ids.add(poi.id)
                    _append_selected(poi)
                    if cls._should_include_ai_debug():
                        duplicate_debug.append({'day': day_index + 1, 'candidate_id': str(poi.id), 'status': 'last_resort_reuse'})

            day_plans.append(
                {
                    'day': int(day_item.get('day') or (day_index + 1)),
                    'location': str(day_item.get('location') or daily_locations[day_index]['location'] or city).strip() or city,
                    'focus': str(day_item.get('focus') or '').strip(),
                    'pois': resolved_day_pois[:stops_per_day],
                }
            )

        if len(selected_pois) < max_stops:
            for poi in ranked_pois:
                if len(selected_pois) >= max_stops:
                    break
                if poi.id in selected_ids:
                    continue
                selected_pois.append(poi)
                selected_ids.add(poi.id)

        daily_themes = parsed.get('daily_themes') if isinstance(parsed, dict) else []
        if not isinstance(daily_themes, list):
            daily_themes = []

        result = {
            'selected_pois': selected_pois[:max_stops],
            'daily_themes': [str(item).strip() for item in daily_themes if str(item).strip()],
            'day_plans': day_plans,
            'reason': 'ok',
        }
        if cls._should_include_ai_debug():
            result.update(
                {
                    'raw_response': raw_response,
                    'retry_raw_response': retry_raw,
                    'parsed_response': parsed,
                    'duplicate_control_debug': {
                        'unique_candidate_capacity': unique_capacity,
                        'required_slots': max_stops,
                        'needs_reuse': needs_reuse,
                        'events': duplicate_debug,
                    },
                }
            )
        return result

    @staticmethod
    def _map_external_to_category(place_class: str, place_type: str) -> str:
        mapped_type = str(place_type or '').strip().lower().replace('-', '_').replace(' ', '_')
        mapped_class = str(place_class or '').strip().lower().replace('-', '_').replace(' ', '_')
        classification = categorize_google_place([mapped_class, mapped_type], "")
        return map_derived_category_to_poi_category(classification.get('derived_category'))

    @staticmethod
    def _keyword_category(name: str) -> str:
        classification = categorize_google_place([], str(name or ''))
        return map_derived_category_to_poi_category(classification.get('derived_category'))

    @staticmethod
    def _geocode_city_center(city: str):
        try:
            response = requests.get(
                'https://geocoding-api.open-meteo.com/v1/search',
                params={
                    'name': city,
                    'count': 1,
                    'language': 'en',
                    'format': 'json',
                },
                timeout=6,
            )
            response.raise_for_status()
            results = response.json().get('results') or []
            if not results:
                return None
            first = results[0]
            return {
                'lat': float(first['latitude']),
                'lon': float(first['longitude']),
                'city': str(first.get('name') or city),
                'country': str(first.get('country') or ''),
            }
        except Exception:
            logger.exception("Failed geocoding city center city=%s", city)
            return None

    def _hydrate_city_pois_from_wikipedia(self, city: str, limit: int = 40) -> int:
        center = self._geocode_city_center(city)
        if not center:
            return 0

        try:
            response = requests.get(
                'https://en.wikipedia.org/w/api.php',
                params={
                    'action': 'query',
                    'list': 'geosearch',
                    'gscoord': f"{center['lat']}|{center['lon']}",
                    'gsradius': 20000,
                    'gslimit': min(max(limit, 10), 50),
                    'format': 'json',
                },
                timeout=8,
            )
            response.raise_for_status()
            pages = (response.json().get('query') or {}).get('geosearch') or []
        except Exception:
            logger.exception("Wikipedia geosearch failed city=%s", city)
            return 0

        created_or_updated = 0
        for page in pages:
            try:
                pageid = page.get('pageid')
                name = str(page.get('title') or '').strip()
                lat = float(page.get('lat'))
                lon = float(page.get('lon'))
                if not pageid or not name:
                    continue
            except (TypeError, ValueError):
                continue

            keyword_classification = categorize_google_place([], name)
            if not keyword_classification.get('is_meaningful_poi'):
                continue

            external_id = f"wiki-{pageid}"
            address_parts = [center.get('city') or city, center.get('country') or '']
            address = ', '.join([part for part in address_parts if part])
            tags = ['wikipedia', city.lower().replace(' ', '_')]
            defaults = {
                'name': name,
                'address': address or city,
                'location': Point(lon, lat),
                'category': self._keyword_category(name),
                'average_rating': 4.0,
                'metadata': {
                    'source': 'wikipedia-geosearch',
                    'city': center.get('city') or city,
                    'country': center.get('country') or '',
                },
                'tags': tags,
            }
            try:
                POI.objects.update_or_create(external_id=external_id, defaults=defaults)
                created_or_updated += 1
            except Exception:
                continue

        return created_or_updated

    def _hydrate_city_pois(self, city: str, limit: int = 60) -> int:
        """
        Fetch POIs for a city from OpenStreetMap Nominatim and upsert into local POI table.
        This is a dynamic fallback for cities not present in local dataset.
        """
        city_text = str(city or '').strip()
        if not city_text:
            return 0

        try:
            response = requests.get(
                'https://nominatim.openstreetmap.org/search',
                params={
                    'q': f'popular places in {city_text}',
                    'format': 'jsonv2',
                    'addressdetails': 1,
                    'limit': max(10, min(limit, 80)),
                },
                headers={'User-Agent': 'ExcursaTripGeneration/1.0'},
                timeout=8,
            )
            response.raise_for_status()
            results = response.json() or []
        except Exception:
            logger.exception("Failed to hydrate city POIs from Nominatim for city=%s", city_text)
            results = []

        created_or_updated = 0
        for item in results:
            try:
                name = str(item.get('name') or '').strip()
                lat = float(item.get('lat'))
                lon = float(item.get('lon'))
                if not name:
                    continue
            except (TypeError, ValueError):
                continue

            address_data = item.get('address') or {}
            locality = (
                address_data.get('city')
                or address_data.get('town')
                or address_data.get('village')
                or city_text
            )
            display_name = str(item.get('display_name') or '').strip()
            address = ', '.join([part.strip() for part in display_name.split(',')[:2] if part.strip()]) or city_text
            place_type = str(item.get('type') or '').lower()
            place_class = str(item.get('class') or '').lower()
            external_id = f"osm-{item.get('place_id')}"
            classification = categorize_google_place([place_class, place_type], name)
            if not classification.get('is_meaningful_poi'):
                continue

            tags = [place_type, place_class, str(locality).lower().replace(' ', '_'), city_text.lower().replace(' ', '_')]
            tags.extend(classification.get('effective_types') or [])
            tags = [tag for tag in dict.fromkeys(tags) if tag]

            defaults = {
                'name': name,
                'address': address,
                'location': Point(lon, lat),
                'category': map_derived_category_to_poi_category(classification.get('derived_category')),
                'metadata': {
                    'source': 'nominatim',
                    'city': str(locality),
                    'categorization': classification,
                },
                'tags': tags,
            }

            try:
                POI.objects.update_or_create(external_id=external_id, defaults=defaults)
                created_or_updated += 1
            except Exception:
                continue

        if created_or_updated == 0:
            created_or_updated += self._hydrate_city_pois_from_wikipedia(city_text, limit=min(limit, 50))

        return created_or_updated

    def _get_city_candidates(self, city: str, min_count: int) -> List[POI]:
        city_query = self._build_city_query(city)
        candidates = list(POI.objects.filter(city_query).order_by('-average_rating')[:500])
        if candidates:
            return candidates

        # Preferred generation path when local DB has no city POIs: sync external POIs.
        center = self._geocode_city_center(city)
        if center:
            try:
                sync_service = ExternalSyncService(
                    google_api_key=getattr(settings, 'GOOGLE_PLACES_API_KEY', None),
                    fsq_api_key=getattr(settings, 'FOURSQUARE_API_KEY', None),
                )
                sync_service.fetch_and_sync(center['lat'], center['lon'], city=city)
                candidates = list(POI.objects.filter(city_query).order_by('-average_rating')[:500])
            except Exception:
                logger.exception("External city sync failed city=%s", city)
            if candidates:
                return candidates

        imported_count = self._hydrate_city_pois(city, limit=max(30, min_count * 4))
        if imported_count > 0:
            candidates = list(POI.objects.filter(city_query).order_by('-average_rating')[:500])
        return candidates

    def generate_itinerary(
        self,
        *,
        user,
        city: str,
        duration_days: int,
        interests: List[str],
        start_date,
        title: str,
        visibility: str,
        transport_mode: str,
        stops_per_day: int,
        min_rating: Optional[float] = None,
        day_locations: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        max_stops = duration_days * stops_per_day

        suggestion_result = self._suggest_pois_with_ai(
            city=city,
            duration_days=duration_days,
            interests=interests,
            stops_per_day=stops_per_day,
            daily_locations=day_locations,
        )
        suggested_pois = suggestion_result.get('suggested_pois') or []

        resolution_result = self._resolve_ai_suggested_pois(
            city=city,
            suggestions=suggested_pois,
            interests=interests,
            max_stops=max_stops,
            min_rating=min_rating,
        )
        verified_pois = resolution_result.get('resolved_pois') or []

        if len(verified_pois) < max_stops:
            db_candidates = self._get_city_candidates(city, min_count=max(8, max_stops))
            if min_rating is not None:
                db_candidates = [
                    poi for poi in db_candidates
                    if float(poi.average_rating or 0.0) >= float(min_rating)
                ]
            db_candidates = [poi for poi in db_candidates if self._is_poi_suitable_for_itinerary(poi, interests)]
            existing_ids = {poi.id for poi in verified_pois}
            for poi in self._rank_pois(db_candidates, interests):
                if poi.id in existing_ids:
                    continue
                verified_pois.append(poi)
                existing_ids.add(poi.id)
                if len(verified_pois) >= max_stops:
                    break

        if not verified_pois:
            raise ValueError('No POIs could be verified for the selected city/interests.')

        ranked_pois = self._rank_pois(verified_pois, interests)
        ai_plan = self._plan_with_ai(
            city=city,
            duration_days=duration_days,
            interests=interests,
            stops_per_day=stops_per_day,
            ranked_pois=ranked_pois,
            max_stops=max_stops,
            daily_locations=day_locations,
        )
        selected_pois = ai_plan.get('selected_pois') or self._select_diverse_pois(ranked_pois, max_stops, interests)
        planning_source = 'ai_verified_candidates' if ai_plan.get('selected_pois') else 'rule_based_verified_candidates'
        daily_themes = ai_plan.get('daily_themes') or suggestion_result.get('daily_themes') or []
        planning_source_reason = ai_plan.get('reason', 'fallback_rule_based')
        ai_day_plans = ai_plan.get('day_plans') or []

        if not selected_pois:
            raise ValueError('No POIs matched the selected city/interests after verification.')

        start_dt = datetime.combine(start_date, time(hour=9, minute=0))
        end_dt = datetime.combine(start_date + timedelta(days=duration_days - 1), time(hour=20, minute=0))
        if timezone.is_aware(timezone.now()):
            start_dt = timezone.make_aware(start_dt)
            end_dt = timezone.make_aware(end_dt)

        itinerary = Itinerary.objects.create(
            user=user,
            title=title,
            start_date=start_dt,
            end_date=end_dt,
            visibility=visibility,
            transport_mode=transport_mode,
            status=Itinerary.Status.DRAFT,
        )

        hour_slots = [9, 11, 14, 17, 19, 20, 21, 22]
        day_plan: List[Dict[str, Any]] = []
        ordered_day_plans = []

        if ai_day_plans:
            for day in range(duration_days):
                ai_day_meta = ai_day_plans[day] if day < len(ai_day_plans) and isinstance(ai_day_plans[day], dict) else {}
                ai_day_pois = ai_day_meta.get('pois') if isinstance(ai_day_meta.get('pois'), list) else []
                ordered_day_plans.append(
                    {
                        'day': day + 1,
                        'location': str(ai_day_meta.get('location') or '').strip() or None,
                        'focus': str(ai_day_meta.get('focus') or '').strip() or None,
                        'pois': ai_day_pois[:stops_per_day],
                    }
                )
        else:
            for day in range(duration_days):
                ordered_day_plans.append(
                    {
                        'day': day + 1,
                        'location': None,
                        'focus': None,
                        'pois': selected_pois[day * stops_per_day:(day + 1) * stops_per_day],
                    }
                )

        global_order_index = 0
        for day in range(duration_days):
            day_date = start_date + timedelta(days=day)
            day_meta = ordered_day_plans[day] if day < len(ordered_day_plans) else {'pois': []}
            day_pois = day_meta.get('pois') if isinstance(day_meta.get('pois'), list) else []
            if not day_pois:
                break

            day_stops = []
            for day_index, poi in enumerate(day_pois[:stops_per_day]):
                ItineraryItem.objects.create(
                    itinerary=itinerary,
                    poi=poi,
                    order_index=global_order_index,
                    arrival_time=time(hour=hour_slots[min(day_index, len(hour_slots) - 1)], minute=0),
                    notes=f'Day {day + 1}: {poi.name}',
                )
                global_order_index += 1
                day_stops.append(poi)

            day_plan.append(
                {
                    'day': day + 1,
                    'date': day_date.isoformat(),
                    'theme': daily_themes[day] if day < len(daily_themes) else None,
                    'focus': day_meta.get('focus'),
                    'location_hint': day_meta.get('location'),
                    'stops_count': len(day_stops),
                    'stops': day_stops,
                }
            )

        response = {
            'itinerary': itinerary,
            'selected_pois_count': len(selected_pois),
            'candidate_pois_count': len(ranked_pois),
            'verified_pois_count': len(verified_pois),
            'suggested_pois_count': len(suggested_pois),
            'day_plan': day_plan,
            'reused_draft': False,
            'planning_source': planning_source,
            'planning_source_reason': planning_source_reason,
        }
        if self._should_include_ai_debug():
            response.update(
                {
                    'ai_raw_response': ai_plan.get('raw_response', ''),
                    'ai_retry_raw_response': ai_plan.get('retry_raw_response', ''),
                    'ai_parsed_response': ai_plan.get('parsed_response', {}),
                }
            )
            if suggestion_result.get('suggestions_ai_debug'):
                response['ai_suggestions_debug'] = suggestion_result.get('suggestions_ai_debug')
            if resolution_result.get('resolver_ai_debug'):
                response['ai_resolution_debug'] = resolution_result.get('resolver_ai_debug')
            if resolution_result.get('unresolved_suggestions'):
                response['unresolved_ai_suggestions'] = resolution_result.get('unresolved_suggestions')
        return response