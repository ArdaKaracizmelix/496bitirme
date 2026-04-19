"""
Domain services for the locations app implementing business logic
for geospatial operations and external data synchronization.
"""
import geohash2
import requests
import time
from typing import Dict, List, Optional, Tuple
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import Distance
from django.db.models import QuerySet, Case, When, Value, IntegerField
from django.db.models import Q
from django.conf import settings
from user.poi_categorization import (
    MEANINGFUL_POI_BLOCK_TYPES,
    categorize_google_place,
    map_derived_category_to_poi_category,
)
from .models import POI


TRAVEL_SYNC_MIN_EXPECTED_RESULTS = 25
TRAVEL_SYNC_DEFAULT_RADIUS_M = 20000
TRAVEL_SYNC_MAX_RADIUS_M = 50000
GOOGLE_NEXT_PAGE_DELAY_SECONDS = 2

GOOGLE_PLACE_SEARCH_PROFILES = [
    {'type': 'tourist_attraction'},
    {'type': 'museum'},
    {'type': 'park'},
    {'type': 'art_gallery'},
    {'keyword': 'historical landmark'},
    {'keyword': 'monument'},
    {'keyword': 'scenic viewpoint'},
    {'keyword': 'cultural center'},
    {'keyword': 'archaeological site'},
    {'keyword': 'castle'},
    {'keyword': 'landmark'},
]

# Foursquare high-level category roots: Arts & Entertainment,
# Outdoors & Recreation, Travel & Transportation. Food/shopping are
# intentionally excluded from the map POI sync pipeline.
FOURSQUARE_TRAVEL_CATEGORY_IDS = '10000,16000,19000'

TRAVEL_GENERIC_NAME_BLOCKLIST = {
    'atm', 'bank', 'banka', 'eczane', 'pharmacy', 'hospital', 'hastane',
    'doctor', 'doktor', 'dentist', 'dis hekimi', 'diş hekimi',
    'muayenehane', 'clinic', 'klinik', 'medical', 'veterinary', 'veteriner',
    'insurance', 'sigorta', 'lawyer', 'avukat', 'accounting', 'muhasebe',
    'car repair', 'oto servis', 'locksmith', 'çilingir', 'cilingir',
    'government', 'belediye', 'kaymakamlik', 'kaymakamlık', 'valilik',
    'noter', 'post office', 'ptt', 'gas station', 'benzin', 'otopark',
    'parking', 'plumber', 'tesisat', 'electrician', 'elektrikci', 'elektrikçi',
    'hardware', 'hırdavat', 'hirdavat',
    'burger king', 'mcdonald', 'kfc', 'dominos', 'domino', 'penti', 'lc waikiki',
    'defacto', 'gratis', 'bim', 'a101', 'sok market', 'şok market', 'migros',
    'carrefour', 'market', 'supermarket', 'mall', 'avm', 'store', 'magaza',
    'mağaza', 'clothing', 'shoe', 'electronics',
}


class GeoService:
    """
    Domain Service that encapsulates all spatial business logic.
    Isolates direct database queries ensuring controllers/views interact 
    with a clean API rather than raw ORM/SQL calls.
    """

    NON_TOURISM_TAGS = {
        *MEANINGFUL_POI_BLOCK_TYPES,
        'atm',
        'bank',
        'finance',
        'insurance',
        'lawyer',
        'accounting',
        'pharmacy',
        'drugstore',
        'hospital',
        'doctor',
        'dentist',
        'physiotherapist',
        'veterinary_care',
        'veterinary',
        'medical',
        'medical_center',
        'clinic',
        'police',
        'post_office',
        'government',
        'government_office',
        'local_government_office',
        'car_repair',
        'locksmith',
        'electrician',
        'plumber',
        'hardware_store',
        'gas_station',
        'parking',
        'real_estate_agency',
        'school',
        'primary_school',
        'secondary_school',
        'high_school',
        'middle_school',
        'preschool',
        'kindergarten',
        'university',
        'college',
        'college_or_university',
        'academy',
        'campus',
        'education',
        'educational_institution',
        'language_school',
        'music_school',
        'driving_school',
        'trade_school',
        'adult_education_school',
        'academic_department',
        'university_department',
        'research_institute',
    }
    
    @staticmethod
    def normalize_interest_values(interests: List[str]) -> List[str]:
        return [
            str(item or '').strip().lower().replace('-', '_')
            for item in (interests or [])
            if str(item or '').strip()
        ]

    @staticmethod
    def build_interest_tag_query(interest_values: List[str]) -> Q:
        query = Q()
        for value in (interest_values or []):
            query |= Q(tags__contains=[value])
        return query

    @staticmethod
    def _build_non_tourism_tag_query() -> Optional[Q]:
        query = None
        for tag in GeoService.NON_TOURISM_TAGS:
            condition = Q(tags__contains=[tag])
            query = condition if query is None else (query | condition)
        return query

    @staticmethod
    def _exclude_non_tourism_pois(queryset: QuerySet) -> QuerySet:
        tag_query = GeoService._build_non_tourism_tag_query()
        if tag_query is None:
            return queryset
        return queryset.exclude(tag_query)

    @staticmethod
    def apply_category_filter(queryset: QuerySet, category: str) -> QuerySet:
        normalized = str(category or '').strip().upper()
        if not normalized:
            return queryset
        if normalized == 'CULTURE':
            return queryset.filter(
                Q(category=POI.Category.HISTORICAL, metadata__derived_category='CULTURE')
                | Q(tags__contains=['cultural_center'])
                | Q(tags__contains=['art_gallery'])
                | Q(tags__contains=['performing_arts_theater'])
            )
        if normalized == 'VIEWPOINT':
            return queryset.filter(
                Q(tags__contains=['viewpoint'])
                | Q(tags__contains=['scenic_spot'])
                | Q(tags__contains=['observation_deck'])
                | Q(metadata__primary_category='viewpoint')
            )
        return queryset.filter(category=normalized)

    @staticmethod
    def _map_interests_to_categories(interests: List[str]) -> List[str]:
        """
        Map user interest labels/types to internal POI category enums.
        """
        category_map = {
            'HISTORICAL': {
                'historical',
                'history',
                'museum',
                'monument',
                'castle',
                'cultural_landmark',
                'historical_landmark',
                'art_museum',
                'culture',
                'art_gallery',
                'library',
                'tourist_attraction',
            },
            'NATURE': {'nature', 'park', 'national_park', 'state_park', 'beach', 'lake', 'mountain', 'woods', 'garden', 'botanical_garden', 'hiking_area', 'zoo', 'aquarium'},
            'FOOD': {
                'food',
                'food_and_drink',
                'restaurant',
                'cafe',
                'bar',
                'bakery',
                'coffee_shop',
                'meal_takeaway',
                'meal_delivery',
                'ice_cream_shop',
            },
            'ENTERTAINMENT': {
                'entertainment',
                'entertainment_and_recreation',
                'movie_theater',
                'night_club',
                'amusement_park',
                'stadium',
                'shopping',
                'shopping_mall',
                'store',
                'market',
                'book_store',
                'clothing_store',
                'gym',
                'spa',
                'wellness',
                'wellness_center',
                'theater',
                'performing_arts_theater',
            },
        }

        normalized = set(GeoService.normalize_interest_values(interests))
        matched = []
        for category, keywords in category_map.items():
            if normalized.intersection(keywords):
                matched.append(category)
        return matched

    @staticmethod
    def find_nearby(center: Point, radius_m: int, filters: Optional[Dict] = None) -> QuerySet:
        """
        Executes a PostGIS ST_DWithin query to retrieve POIs within a specific radius.
        
        Args:
            center: A GIS Point object representing the center coordinates
            radius_m: Radius in meters
            filters: Optional dictionary with 'category' and/or 'min_rating' filters
            
        Returns:
            QuerySet of POI objects within the radius, optionally filtered
        """
        filters = filters or {}
        
        # Base query using PostGIS spatial index for performance
        queryset = POI.objects.filter(
            location__distance_lte=(center, Distance(m=radius_m))
        )
        queryset = GeoService._exclude_non_tourism_pois(queryset)
        
        # Apply optional filters
        if 'category' in filters:
            queryset = GeoService.apply_category_filter(queryset, filters['category'])
        
        if 'min_rating' in filters:
            queryset = queryset.filter(average_rating__gte=filters['min_rating'])

        # Soft personalization: boost interest-matching categories without hard filtering.
        interest_values = GeoService.normalize_interest_values(filters.get('interests', []))
        interest_categories = GeoService._map_interests_to_categories(interest_values)
        tag_match_query = GeoService.build_interest_tag_query(interest_values)
        interests_only = bool(filters.get('interests_only'))

        if interests_only and (interest_values or interest_categories) and 'category' not in filters:
            strict_query = Q()
            if interest_categories:
                strict_query |= Q(category__in=interest_categories)
            if interest_values:
                strict_query |= tag_match_query
            queryset = queryset.filter(strict_query)
            return queryset.order_by('-average_rating')

        if (interest_values or interest_categories) and 'category' not in filters:
            queryset = queryset.annotate(
                interest_tag_rank=Case(
                    When(tag_match_query, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                ),
                interest_rank=Case(
                    When(category__in=interest_categories, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            ).order_by('interest_tag_rank', 'interest_rank', '-average_rating')
            return queryset

        return queryset.order_by('-average_rating')
    
    @staticmethod
    def find_in_viewport(bbox: Polygon) -> QuerySet:
        """
        Retrieves POIs contained within the visible map screen boundaries (Bounding Box).
        
        Args:
            bbox: A GIS Polygon representing the viewport bounds
            
        Returns:
            QuerySet of POI objects within the bounding box
        """
        queryset = POI.objects.filter(location__contained=bbox)
        return GeoService._exclude_non_tourism_pois(queryset)
    
    @staticmethod
    def get_cluster_aggregates(bbox: Polygon, zoom: int) -> List[Dict]:
        """
        Uses database level grouping (Grid Snap) to return clustered points 
        for performance optimization at low zoom levels.
        
        Args:
            bbox: A GIS Polygon representing the viewport bounds
            zoom: Zoom level to determine cluster grid size
            
        Returns:
            List of cluster dictionaries with aggregated data
        """
        # Grid size varies by zoom level (larger grid at lower zoom)
        grid_sizes = {
            0: 5000,    # meters at zoom 0
            5: 2000,
            10: 1000,
            15: 500,
            20: 250,
        }
        
        grid_size = grid_sizes.get(zoom, 1000)
        
        # call find_in_viewport to leverage spatial index and reduce dataset before clustering
        pois = GeoService.find_in_viewport(bbox)
        
        clusters = []
        processed = set()
        
        for poi in pois:
            if poi.id in processed:
                continue
            
            # Get nearby points within grid
            nearby = POI.objects.filter(
                location__distance_lte=(
                    poi.location, 
                    Distance(m=grid_size)
                ),
                location__contained=bbox
            )
            
            # Create cluster
            cluster = {
                'center': poi.get_lat_lon(),
                'count': nearby.count(),
                'avg_rating': sum(p.average_rating for p in nearby) / nearby.count(),
                'category': poi.category,
            }
            clusters.append(cluster)
            
            # Mark as processed
            for p in nearby:
                processed.add(p.id)
        
        return clusters
    
    @staticmethod
    def encode_geohash(lat: float, lon: float, precision: int = 6) -> str:
        """
        Generates a Geohash string (precision 5-7) to be used as a key for Redis caching.
        
        Args:
            lat: Latitude coordinate
            lon: Longitude coordinate
            precision: Geohash precision (default 6)
            
        Returns:
            Geohash string for caching purposes
        """
        return geohash2.encode(lat, lon, precision)
    
    @staticmethod
    def is_location_valid(lat: float, lon: float) -> bool:
        """
        Validates if the coordinates fall within supported bounds.
        
        Args:
            lat: Latitude coordinate
            lon: Longitude coordinate
            
        Returns:
            Boolean indicating if coordinates are valid
        """
        return -90 <= lat <= 90 and -180 <= lon <= 180


class ExternalSyncService:
    """
    Integration Service responsible for populating the database with fresh data.
    Acts as an adapter between the internal POI model and third party providers.
    """
    
    # Class attributes for API credentials - will be set after initialization - might be added different APIs
    GOOGLE_API_KEY = None
    FSQ_API_KEY = None
    
    def __init__(self, google_api_key: str = None, fsq_api_key: str = None):
        """
        Initialize the service with API credentials.
        Falls back to Django settings if credentials not provided.
        
        Args:
            google_api_key: Google Places API key (optional, uses settings if not provided)
            fsq_api_key: Foursquare API key (optional, uses settings if not provided)
        """
        self.GOOGLE_API_KEY = google_api_key or settings.GOOGLE_PLACES_API_KEY
        self.FSQ_API_KEY = fsq_api_key or settings.FOURSQUARE_API_KEY
        self.rate_limiter = RateLimiter()
    
    def fetch_and_sync(
        self,
        lat: float,
        lon: float,
        radius_m: int = TRAVEL_SYNC_DEFAULT_RADIUS_M,
        city: str | None = None,
    ) -> int:
        """
        Main sync method that:
        1. Queries external API for places near coordinates
        2. Calls upsert_poi() for each result
        3. Returns the count of new places added
        
        Args:
            lat: Latitude coordinate
            lon: Longitude coordinate
            radius_m: Search radius in meters. Larger city syncs should pass
                20-50km instead of the default map exploration radius.
            city: Optional resolved city label stored in metadata.
            
        Returns:
            Integer count of newly added POI records
        """
        new_count = 0
        radius_m = max(2000, min(int(radius_m or TRAVEL_SYNC_DEFAULT_RADIUS_M), TRAVEL_SYNC_MAX_RADIUS_M))
        
        # there can be different APIs to fetch data, for now we are fetching from google and foursquare, but in the future there can be more APIs added, so we can add more methods to fetch data from different APIs.

        # Fetch from Google Places API
        google_places = self._fetch_google_places(lat, lon, radius_m=radius_m)
        for place_data in google_places:
            dto = self._parse_google_place(place_data)
            dto.metadata['city'] = city or dto.metadata.get('city')
            poi = self.upsert_poi(dto)
            if poi:
                new_count += 1
        
        # Fetch from Foursquare API
        fsq_places = self._fetch_foursquare_places(lat, lon, radius_m=radius_m)
        for place_data in fsq_places:
            dto = self._parse_fsq_place(place_data)
            dto.metadata['city'] = city or dto.metadata.get('city')
            poi = self.upsert_poi(dto)
            if poi:
                new_count += 1

        # Fallback: enrich from OSM when provider APIs are unavailable or sparse.
        if new_count < TRAVEL_SYNC_MIN_EXPECTED_RESULTS:
            osm_places = self._fetch_osm_places(lat, lon, radius_m=radius_m)
            for place_data in osm_places:
                dto = self._parse_osm_place(place_data)
                if not dto:
                    continue
                dto.metadata['city'] = city or dto.metadata.get('city')
                poi = self.upsert_poi(dto)
                if poi:
                    new_count += 1
        
        return new_count
    
    def upsert_poi(self, data: 'ExternalPlaceDTO') -> Optional[POI]:
        """
        "Update or Insert" logic: 
        - If external_id exists: update fields
        - If not exists: create new POI record
        
        Args:
            data: ExternalPlaceDTO with place information
            
        Returns:
            POI instance, or None if update failed
        """
        try:
            normalized_tags = self._normalize_tags(data.tags)
            classification = categorize_google_place(
                [data.category] + normalized_tags,
                data.name,
            )
            quality_score = self._quality_score(data, classification)
            if not classification.get('is_meaningful_poi') or quality_score <= 0:
                return None

            mapped_category = map_derived_category_to_poi_category(
                classification.get('derived_category'),
                fallback=None,
            )
            if not mapped_category:
                return None

            duplicate = self._find_duplicate_poi(data)
            metadata = {
                **(data.metadata or {}),
                'source': (data.metadata or {}).get('source') or self._infer_source_from_external_id(data.external_id),
                'raw_types': classification.get('raw_types', []),
                'primary_category': classification.get('primary_type'),
                'derived_category': classification.get('derived_category'),
                'quality_score': quality_score,
                'categorization': classification,
            }
            rating = data.metadata.get('rating') if isinstance(data.metadata, dict) else None
            try:
                average_rating = float(rating) if rating is not None else 0.0
            except (TypeError, ValueError):
                average_rating = 0.0

            defaults = {
                'name': data.name,
                'address': data.address,
                'location': Point(data.lon, data.lat),
                'category': mapped_category,
                'average_rating': average_rating,
                'metadata': metadata,
                'tags': self._normalize_tags(normalized_tags + classification.get('effective_types', [])),
            }

            if duplicate:
                for field, value in defaults.items():
                    setattr(duplicate, field, value)
                if data.external_id and not duplicate.external_id:
                    duplicate.external_id = data.external_id
                duplicate.save()
                return None

            poi, created = POI.objects.update_or_create(
                external_id=data.external_id,
                defaults=defaults,
            )
            return poi if created else None
        except Exception as e:
            print(f"Error upserting POI {data.external_id}: {str(e)}")
            return None
    
    def refresh_metadata(self, poi: POI) -> bool:
        """
        Specifically updates volatile data for a single POI if the data is older.
        Useful for refreshing ratings, descriptions, or other mutable fields.
        
        Args:
            poi: POI instance to refresh
            
        Returns:
            Boolean indicating success
        """
        try:
            # Check if data is stale (older than 7 days)
            from datetime import timedelta
            from django.utils import timezone
            
            if (timezone.now() - poi.updated_at).days > 7:
                # Fetch fresh data from external source
                external_data = self._fetch_external_poi_data(poi.external_id)
                
                if external_data:
                    poi.average_rating = external_data.get('rating', poi.average_rating)
                    poi.metadata = external_data.get('metadata', poi.metadata)
                    poi.save()
                    return True
            
            return False
        except Exception as e:
            print(f"Error refreshing metadata for POI {poi.id}: {str(e)}")
            return False
    
    def map_category(self, external_cat: str, tags: Optional[List[str]] = None, name: str = "") -> str:
        """
        Normalizes external category strings to internal Enum values.
        
        Args:
            external_cat: Category string from external provider
            
        Returns:
            Internal POI.Category enum value
        """

        classification = categorize_google_place([external_cat] + (tags or []), name)
        mapped = map_derived_category_to_poi_category(
            classification.get('derived_category'),
            fallback=None,
        )
        return mapped or POI.Category.ENTERTAINMENT

    def _normalize_tags(self, tags: List[str]) -> List[str]:
        normalized = []
        for item in tags or []:
            value = str(item or '').strip().lower().replace('-', '_').replace(' ', '_')
            if value:
                normalized.append(value)
        # Keep deterministic unique order
        return list(dict.fromkeys(normalized))

    def _quality_score(self, data: 'ExternalPlaceDTO', classification: Dict) -> int:
        """
        Conservative travel relevance score. Returns 0 for places we should not
        write to POI storage at all.
        """
        if not data or not data.name or data.lat in (None, 0) or data.lon in (None, 0):
            return 0

        normalized_tags = set(self._normalize_tags([data.category] + (data.tags or [])))
        effective_types = set(classification.get('effective_types') or [])
        all_types = normalized_tags | effective_types

        lowered_name = str(data.name or '').strip().lower()
        if any(blocked in lowered_name for blocked in TRAVEL_GENERIC_NAME_BLOCKLIST):
            return 0
        if all_types & MEANINGFUL_POI_BLOCK_TYPES:
            return 0
        if not classification.get('allowed_types'):
            return 0

        metadata = data.metadata or {}
        rating = metadata.get('rating')
        review_count = (
            metadata.get('user_ratings_total')
            or metadata.get('review_count')
            or metadata.get('stats', {}).get('total_ratings')
            or 0
        )
        try:
            rating_value = float(rating) if rating is not None else 0.0
        except (TypeError, ValueError):
            rating_value = 0.0
        try:
            review_count_value = int(review_count or 0)
        except (TypeError, ValueError):
            review_count_value = 0

        derived = str(classification.get('derived_category') or '').upper()
        is_food = derived == 'FOOD' or bool(all_types & {'restaurant', 'cafe', 'bakery', 'coffee_shop'})
        is_commercial = bool(all_types & {
            'store',
            'shopping_mall',
            'clothing_store',
            'shoe_store',
            'electronics_store',
            'supermarket',
            'convenience_store',
            'department_store',
            'market',
            'food',
            'fast_food',
            'meal_takeaway',
            'meal_delivery',
        })

        # Map POIs should be sightseeing-first. Food/commercial places are
        # handled by curated city knowledge/chatbot, not by external map sync.
        if is_food or is_commercial or derived in {'FOOD', 'SHOPPING', 'WELLNESS', 'LODGING'}:
            return 0

        score = 20
        score += 20 if classification.get('primary_type') else 0
        score += min(review_count_value, 200) // 10
        score += int(rating_value * 4) if rating_value else 0

        return score

    def _infer_source_from_external_id(self, external_id: str | None) -> str:
        value = str(external_id or '')
        if value.startswith('osm-'):
            return 'osm_overpass'
        if value.startswith('fsq') or len(value) == 24:
            return 'foursquare'
        return 'google_places'

    def _find_duplicate_poi(self, data: 'ExternalPlaceDTO') -> Optional[POI]:
        """Avoid duplicate providers creating the same place twice."""
        if not data or not data.name:
            return None
        if data.external_id:
            existing = POI.objects.filter(external_id=data.external_id).first()
            if existing:
                return existing
        try:
            point = Point(float(data.lon), float(data.lat))
        except (TypeError, ValueError):
            return None
        return (
            POI.objects
            .filter(name__iexact=str(data.name).strip())
            .filter(location__distance_lte=(point, Distance(m=60)))
            .first()
        )
    
    # Private helper methods
    
    def _fetch_google_places(
        self,
        lat: float,
        lon: float,
        radius_m: int = TRAVEL_SYNC_DEFAULT_RADIUS_M,
    ) -> List[Dict]:
        """
        Fetch travel-relevant places from Google Places API.
        Uses multiple focused searches instead of one generic nearby request,
        because generic nearbysearch often returns pharmacies, ATMs and offices.
        """
        if not self.GOOGLE_API_KEY:
            return []
        
        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        radius_m = max(2000, min(int(radius_m or TRAVEL_SYNC_DEFAULT_RADIUS_M), TRAVEL_SYNC_MAX_RADIUS_M))
        results_by_place_id = {}

        for profile in GOOGLE_PLACE_SEARCH_PROFILES:
            params = {
                'location': f"{lat},{lon}",
                'radius': radius_m,
                'key': self.GOOGLE_API_KEY,
            }
            params.update(profile)

            for item in self._fetch_google_nearby_pages(url, params):
                place_id = item.get('place_id')
                if not place_id:
                    continue
                results_by_place_id[place_id] = item

        return list(results_by_place_id.values())

    def _fetch_google_nearby_pages(self, url: str, params: Dict) -> List[Dict]:
        """Fetch up to three Google Nearby Search pages for one query profile."""
        results = []
        page_params = dict(params)
        for page_index in range(3):
            try:
                if page_index > 0:
                    time.sleep(GOOGLE_NEXT_PAGE_DELAY_SECONDS)
                response = requests.get(url, params=page_params, timeout=10)
                self.rate_limiter.check_limit()
                response.raise_for_status()
                payload = response.json()
            except Exception as e:
                print(f"Error fetching from Google Places: {str(e)}")
                break

            status = payload.get('status')
            if status not in {'OK', 'ZERO_RESULTS'}:
                print(f"Google Places returned status={status}: {payload.get('error_message')}")
                break

            results.extend(payload.get('results', []))
            next_page_token = payload.get('next_page_token')
            if not next_page_token:
                break
            page_params = {
                'pagetoken': next_page_token,
                'key': params.get('key'),
            }
        return results
    
    def _fetch_foursquare_places(
        self,
        lat: float,
        lon: float,
        radius_m: int = TRAVEL_SYNC_DEFAULT_RADIUS_M,
    ) -> List[Dict]:
        """Fetch travel/food/outdoor places from Foursquare API"""
        if not self.FSQ_API_KEY:
            return []
        
        url = "https://api.foursquare.com/v3/places/search"
        params = {
            'll': f"{lat},{lon}",
            'radius': max(2000, min(int(radius_m or TRAVEL_SYNC_DEFAULT_RADIUS_M), 100000)),
            'limit': 50,
            'categories': FOURSQUARE_TRAVEL_CATEGORY_IDS,
            'sort': 'RATING',
            'fields': 'fsq_id,name,geocodes,location,categories,rating,stats,distance',
        }
        headers = {
            'Authorization': self.FSQ_API_KEY,
            'Accept': 'application/json',
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            self.rate_limiter.check_limit()
            response.raise_for_status()
            return response.json().get('results', [])
        except Exception as e:
            print(f"Error fetching from Foursquare: {str(e)}")
            return []

    def _fetch_osm_places(
        self,
        lat: float,
        lon: float,
        radius_m: int = TRAVEL_SYNC_DEFAULT_RADIUS_M,
    ) -> List[Dict]:
        """Fetch fallback places from OpenStreetMap Overpass."""
        radius_m = max(2000, min(int(radius_m or TRAVEL_SYNC_DEFAULT_RADIUS_M), 15000))
        query = f"""
[out:json][timeout:20];
(
  node(around:{radius_m},{lat},{lon})[tourism~"museum|attraction|gallery|viewpoint|artwork|information"];
  way(around:{radius_m},{lat},{lon})[tourism~"museum|attraction|gallery|viewpoint|artwork|information"];
  node(around:{radius_m},{lat},{lon})[historic~"monument|castle|archaeological_site|memorial|ruins|fort"];
  way(around:{radius_m},{lat},{lon})[historic~"monument|castle|archaeological_site|memorial|ruins|fort"];
  node(around:{radius_m},{lat},{lon})[leisure~"park|garden|nature_reserve"];
  way(around:{radius_m},{lat},{lon})[leisure~"park|garden|nature_reserve"];
  node(around:{radius_m},{lat},{lon})[natural~"peak|beach|spring|water|wood|cliff|cave_entrance"];
  way(around:{radius_m},{lat},{lon})[natural~"peak|beach|spring|water|wood|cliff|cave_entrance"];
);
out center 120;
""".strip()
        try:
            response = requests.post(
                'https://overpass-api.de/api/interpreter',
                data=query,
                headers={'User-Agent': 'ExcursaPOISync/1.0'},
                timeout=10,
            )
            response.raise_for_status()
            return response.json().get('elements', [])
        except Exception as e:
            print(f"Error fetching from OSM Overpass: {str(e)}")
            return []
    
    def _parse_google_place(self, place_data: Dict) -> 'ExternalPlaceDTO':
        """Parse Google Places API response"""
        place_types = place_data.get('types', [])
        photos = place_data.get('photos') or []
        return ExternalPlaceDTO(
            external_id=place_data.get('place_id'),
            name=place_data.get('name'),
            address=place_data.get('vicinity'),
            lat=place_data['geometry']['location']['lat'],
            lon=place_data['geometry']['location']['lng'],
            category=(place_types[0] if place_types else 'other'),
            metadata={
                'source': 'google_places',
                'rating': place_data.get('rating'),
                'user_ratings_total': place_data.get('user_ratings_total'),
                'photo_url': photos[0].get('photo_reference') if photos else None,
            },
            tags=self._normalize_tags(place_types),
        )
    
    def _parse_fsq_place(self, place_data: Dict) -> 'ExternalPlaceDTO':
        """Parse Foursquare API response"""
        location = place_data.get('location', {})
        geocodes = place_data.get('geocodes') or {}
        main_geocode = geocodes.get('main') or {}
        categories = place_data.get('categories', [])
        primary_category = categories[0].get('name', 'other') if categories else 'other'
        category_tags = [c.get('name') for c in categories]
        return ExternalPlaceDTO(
            external_id=place_data.get('fsq_id'),
            name=place_data.get('name'),
            address=location.get('formatted_address'),
            lat=main_geocode.get('latitude'),
            lon=main_geocode.get('longitude'),
            category=primary_category,
            metadata={
                'source': 'foursquare',
                'rating': place_data.get('rating'),
                'review_count': (place_data.get('stats') or {}).get('total_ratings'),
                'distance': place_data.get('distance'),
            },
            tags=self._normalize_tags(category_tags),
        )

    def _parse_osm_place(self, place_data: Dict) -> Optional['ExternalPlaceDTO']:
        """Parse Overpass element into ExternalPlaceDTO."""
        tags = place_data.get('tags') or {}
        name = str(tags.get('name') or '').strip()
        if not name:
            return None

        place_type = str(place_data.get('type') or '').strip().lower()
        if place_type == 'node':
            lat = place_data.get('lat')
            lon = place_data.get('lon')
        else:
            center = place_data.get('center') or {}
            lat = center.get('lat')
            lon = center.get('lon')

        try:
            lat = float(lat)
            lon = float(lon)
        except (TypeError, ValueError):
            return None

        amenity = str(tags.get('amenity') or '').strip()
        tourism = str(tags.get('tourism') or '').strip()
        leisure = str(tags.get('leisure') or '').strip()
        historic = str(tags.get('historic') or '').strip()
        natural = str(tags.get('natural') or '').strip()
        category = amenity or tourism or historic or leisure or natural or 'other'

        street_bits = [
            str(tags.get('addr:street') or '').strip(),
            str(tags.get('addr:housenumber') or '').strip(),
        ]
        locality_bits = [
            str(tags.get('addr:suburb') or tags.get('addr:neighbourhood') or '').strip(),
            str(tags.get('addr:city') or tags.get('addr:town') or tags.get('addr:village') or '').strip(),
        ]
        address_parts = [' '.join([bit for bit in street_bits if bit]).strip()] + [
            bit for bit in locality_bits if bit
        ]
        address = ', '.join([part for part in address_parts if part]) or name

        element_id = place_data.get('id')
        if element_id is None:
            return None
        external_id = f"osm-{place_type}-{element_id}"

        tag_values = [
            amenity,
            tourism,
            historic,
            leisure,
            natural,
            str(tags.get('cuisine') or '').strip(),
        ]

        return ExternalPlaceDTO(
            external_id=external_id,
            name=name,
            address=address,
            lat=lat,
            lon=lon,
            category=category,
            metadata={
                'source': 'osm_overpass',
                'osm_type': place_type,
                'osm_id': element_id,
            },
            tags=self._normalize_tags(tag_values),
        )
    
    # function still needs to be implemented 
    def _fetch_external_poi_data(self, external_id: str) -> Optional[Dict]:
        """Fetch fresh data for a specific POI from external source"""
        # This would call the appropriate API based on external_id format
        return None


class RateLimiter:
    """Utility to ensure the system does not exceed 3rd party API quota limits."""
    
    def __init__(self, calls_per_minute: int = 60):
        """
        Initialize rate limiter.
        
        Args:
            calls_per_minute: Maximum API calls allowed per minute
        """
        self.calls_per_minute = calls_per_minute
        self.call_times = []
    
    def check_limit(self) -> bool:
        """
        Check if API call is within rate limits.
        
        Returns:
            Boolean indicating if the call is allowed
        """
        from datetime import datetime, timedelta
        
        now = datetime.now()
        # Remove calls older than 1 minute
        self.call_times = [t for t in self.call_times if now - t < timedelta(minutes=1)]
        
        if len(self.call_times) >= self.calls_per_minute:
            raise Exception(f"Rate limit exceeded: {self.calls_per_minute} calls per minute")
        
        self.call_times.append(now)
        return True


class ExternalPlaceDTO:
    """Data Transfer Object for external place data"""
    
    def __init__(
        self,
        external_id: str,
        name: str,
        address: str,
        lat: float,
        lon: float,
        category: str,
        metadata: Dict = None,
        tags: List[str] = None,
    ):
        self.external_id = external_id
        self.name = name
        self.address = address
        self.lat = lat
        self.lon = lon
        self.category = category
        self.metadata = metadata or {}
        self.tags = tags or []
