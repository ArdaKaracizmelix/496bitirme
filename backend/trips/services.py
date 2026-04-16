from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any
from enum import Enum
import math
from datetime import datetime, timedelta, time
import logging
import requests

from django.db.models import Q
from django.utils import timezone
from django.contrib.gis.geos import Point
from django.conf import settings

from locations.models import POI
from locations.services import ExternalSyncService, GeoService
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
        'CULTURE_HISTORY': {'culture', 'historical', 'history', 'museum', 'monument', 'castle', 'cultural_landmark', 'historical_landmark', 'art_museum', 'art_gallery'},
        'OUTDOOR_NATURE': {'nature', 'outdoor', 'park', 'national_park', 'state_park', 'beach', 'lake', 'mountain', 'woods', 'garden', 'botanical_garden', 'hiking_area', 'zoo', 'aquarium'},
        'FOOD_DRINK': {'food', 'restaurant', 'cafe', 'bar', 'bakery', 'coffee_shop', 'meal_takeaway', 'meal_delivery', 'ice_cream_shop'},
        'ENTERTAINMENT': {'entertainment', 'movie_theater', 'night_club', 'amusement_park', 'stadium', 'shopping_mall', 'theater', 'performing_arts_theater'},
        'SHOPPING': {'shopping', 'shopping_mall', 'market', 'book_store', 'clothing_store'},
        'HEALTH_WELLNESS': {'wellness', 'spa', 'gym', 'wellness_center', 'yoga_studio'},
        'TRANSPORTATION': {'transportation', 'airport', 'train_station', 'bus_station', 'transit_station', 'subway_station'},
        'LODGING': {'lodging', 'hotel', 'hostel', 'resort_hotel', 'motel', 'campground'},
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

    @staticmethod
    def _merge_unique_pois(*poi_lists: List[POI]) -> List[POI]:
        merged: List[POI] = []
        seen_ids = set()
        for poi_list in poi_lists:
            for poi in poi_list or []:
                if poi.id in seen_ids:
                    continue
                seen_ids.add(poi.id)
                merged.append(poi)
        return merged

    @classmethod
    def _rank_pois(cls, pois: List[POI], interests: List[str]) -> List[POI]:
        normalized_interests = set(cls._normalize_interests(interests))
        interest_categories = set(cls._map_interests_to_categories(interests))
        utility_tokens = {
            'school', 'primary_school', 'secondary_school', 'university',
            'administrative_area_level_1', 'administrative_area_level_2',
            'postal_code', 'locality', 'political', 'country', 'city_hall',
            'airport', 'bus_station', 'train_station', 'subway_station',
            'transit_station', 'hospital', 'doctor', 'pharmacy', 'police',
            'fire_station', 'post_office',
        }
        utility_name_tokens = {
            'school', 'university', 'hospital', 'airport', 'station',
            'municipality', 'province', 'district',
        }

        def score(poi: POI) -> float:
            poi_tags = {str(tag).strip().lower().replace('-', '_').replace(' ', '_') for tag in (poi.tags or [])}
            poi_name = str(getattr(poi, 'name', '') or '').lower()
            category_match = 1 if poi.category in interest_categories else 0
            tag_overlap = len(normalized_interests.intersection(poi_tags))
            rating_score = float(poi.average_rating or 0.0)
            utility_penalty = 0.0
            if poi_tags.intersection(utility_tokens) or any(token in poi_name for token in utility_name_tokens):
                utility_penalty = 4.0

            # Weighted popularity + preference fit
            return (rating_score * 2.0) + (category_match * 3.0) + (tag_overlap * 1.0) - utility_penalty

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
    def _map_external_to_category(place_class: str, place_type: str) -> str:
        mapped_type = str(place_type or '').lower()
        mapped_class = str(place_class or '').lower()

        if mapped_class == 'tourism' or mapped_type in {'museum', 'monument', 'memorial', 'castle', 'ruins'}:
            return POI.Category.CULTURE_HISTORY
        if mapped_class in {'natural', 'leisure'} or mapped_type in {'park', 'garden', 'nature_reserve', 'zoo'}:
            return POI.Category.OUTDOOR_NATURE
        if mapped_class in {'amenity', 'shop'} and mapped_type in {'restaurant', 'cafe', 'bar', 'bakery'}:
            return POI.Category.FOOD_DRINK
        if mapped_class in {'shop'} or mapped_type in {'shopping_mall', 'market', 'book_store', 'clothing_store'}:
            return POI.Category.SHOPPING
        if mapped_type in {'airport', 'train_station', 'bus_station', 'subway_station', 'transit_station'}:
            return POI.Category.TRANSPORTATION
        if mapped_type in {'hotel', 'hostel', 'lodging', 'motel', 'resort_hotel', 'campground'}:
            return POI.Category.LODGING
        return POI.Category.ENTERTAINMENT

    @staticmethod
    def _keyword_category(name: str) -> str:
        text = str(name or '').lower()
        if any(token in text for token in ('museum', 'cathedral', 'church', 'palace', 'monument', 'tower', 'historic')):
            return POI.Category.CULTURE_HISTORY
        if any(token in text for token in ('park', 'garden', 'forest', 'beach', 'lake', 'river')):
            return POI.Category.OUTDOOR_NATURE
        if any(token in text for token in ('restaurant', 'cafe', 'bakery', 'bar', 'food', 'market')):
            return POI.Category.FOOD_DRINK
        if any(token in text for token in ('hotel', 'hostel', 'resort', 'motel')):
            return POI.Category.LODGING
        if any(token in text for token in ('airport', 'station', 'terminal')):
            return POI.Category.TRANSPORTATION
        return POI.Category.ENTERTAINMENT

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

            tags = [place_type, place_class, str(locality).lower().replace(' ', '_'), city_text.lower().replace(' ', '_')]
            tags = [tag for tag in dict.fromkeys(tags) if tag]

            defaults = {
                'name': name,
                'address': address,
                'location': Point(lon, lat),
                'category': self._map_external_to_category(place_class, place_type),
                'metadata': {
                    'source': 'nominatim',
                    'city': str(locality),
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
        text_candidates = list(POI.objects.filter(city_query).order_by('-average_rating')[:500])

        center = self._geocode_city_center(city)
        geo_candidates: List[POI] = []
        if center:
            center_point = Point(center['lon'], center['lat'])
            # Prefer POIs physically near the city center when city text metadata is sparse.
            for radius in (12000, 20000, 35000, 50000):
                nearby = list(GeoService.find_nearby(center_point, radius)[:500])
                geo_candidates = self._merge_unique_pois(geo_candidates, nearby)
                if len(geo_candidates) >= min_count:
                    break

        candidates = self._merge_unique_pois(text_candidates, geo_candidates)
        if len(candidates) >= min_count:
            return candidates

        # Preferred generation path: sync external POIs (Google Places pipeline)
        if center:
            try:
                sync_service = ExternalSyncService(
                    google_api_key=getattr(settings, 'GOOGLE_PLACES_API_KEY', None),
                    fsq_api_key=getattr(settings, 'FOURSQUARE_API_KEY', None),
                )
                sync_service.fetch_and_sync(center['lat'], center['lon'])
                text_candidates = list(POI.objects.filter(city_query).order_by('-average_rating')[:500])
                center_point = Point(center['lon'], center['lat'])
                geo_candidates = []
                for radius in (12000, 20000, 35000, 50000):
                    nearby = list(GeoService.find_nearby(center_point, radius)[:500])
                    geo_candidates = self._merge_unique_pois(geo_candidates, nearby)
                    if len(geo_candidates) >= min_count:
                        break
                candidates = self._merge_unique_pois(text_candidates, geo_candidates)
            except Exception:
                logger.exception("External city sync failed city=%s", city)
            if len(candidates) >= min_count:
                return candidates

        imported_count = self._hydrate_city_pois(city, limit=max(30, min_count * 4))
        if imported_count > 0:
            text_candidates = list(POI.objects.filter(city_query).order_by('-average_rating')[:500])
            if center:
                center_point = Point(center['lon'], center['lat'])
                geo_candidates = self._merge_unique_pois(
                    list(GeoService.find_nearby(center_point, 20000)[:500]),
                    list(GeoService.find_nearby(center_point, 50000)[:500]),
                )
                candidates = self._merge_unique_pois(text_candidates, geo_candidates)
            else:
                candidates = text_candidates
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
    ) -> Dict[str, Any]:
        max_stops = duration_days * stops_per_day
        candidates = self._get_city_candidates(city, min_count=max(8, max_stops))

        if not candidates:
            raise ValueError(f"No POIs found for city '{city}'.")

        ranked_pois = self._rank_pois(candidates, interests)
        selected_pois = self._select_diverse_pois(ranked_pois, max_stops, interests)

        if not selected_pois:
            raise ValueError("No POIs matched the selected city/interests.")

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

        for day in range(duration_days):
            day_date = start_date + timedelta(days=day)
            day_pois = selected_pois[day * stops_per_day:(day + 1) * stops_per_day]
            if not day_pois:
                break

            day_stops = []
            for day_index, poi in enumerate(day_pois):
                order_index = (day * stops_per_day) + day_index
                ItineraryItem.objects.create(
                    itinerary=itinerary,
                    poi=poi,
                    order_index=order_index,
                    arrival_time=time(hour=hour_slots[min(day_index, len(hour_slots) - 1)], minute=0),
                    notes=f"Day {day + 1}: {poi.name}",
                )
                day_stops.append(poi)

            day_plan.append(
                {
                    'day': day + 1,
                    'date': day_date.isoformat(),
                    'stops_count': len(day_stops),
                    'stops': day_stops,
                }
            )

        return {
            'itinerary': itinerary,
            'selected_pois_count': len(selected_pois),
            'candidate_pois_count': len(candidates),
            'day_plan': day_plan,
        }
