"""
Domain services for the locations app implementing business logic
for geospatial operations and external data synchronization.
"""
import geohash2
import requests
from typing import Dict, List, Optional, Tuple
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import Distance
from django.db.models import QuerySet, Case, When, Value, IntegerField
from django.db.models import Q
from django.conf import settings
from user.poi_categorization import categorize_google_place, map_derived_category_to_poi_category
from .models import POI


class GeoService:
    """
    Domain Service that encapsulates all spatial business logic.
    Isolates direct database queries ensuring controllers/views interact 
    with a clean API rather than raw ORM/SQL calls.
    """

    NON_TOURISM_TAGS = {
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
            queryset = queryset.filter(category=filters['category'])
        
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
    
    def fetch_and_sync(self, lat: float, lon: float) -> int:
        """
        Main sync method that:
        1. Queries external API for places near coordinates
        2. Calls upsert_poi() for each result
        3. Returns the count of new places added
        
        Args:
            lat: Latitude coordinate
            lon: Longitude coordinate
            
        Returns:
            Integer count of newly added POI records
        """
        new_count = 0
        
        # there can be different APIs to fetch data, for now we are fetching from google and foursquare, but in the future there can be more APIs added, so we can add more methods to fetch data from different APIs.

        # Fetch from Google Places API
        google_places = self._fetch_google_places(lat, lon)
        for place_data in google_places:
            dto = self._parse_google_place(place_data)
            poi = self.upsert_poi(dto)
            if poi:
                new_count += 1
        
        # Fetch from Foursquare API
        fsq_places = self._fetch_foursquare_places(lat, lon)
        for place_data in fsq_places:
            dto = self._parse_fsq_place(place_data)
            poi = self.upsert_poi(dto)
            if poi:
                new_count += 1

        # Fallback: enrich from OSM when provider APIs are unavailable or sparse.
        if new_count < 8:
            osm_places = self._fetch_osm_places(lat, lon)
            for place_data in osm_places:
                dto = self._parse_osm_place(place_data)
                if not dto:
                    continue
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
            if not classification.get('is_meaningful_poi'):
                return None

            mapped_category = map_derived_category_to_poi_category(
                classification.get('derived_category'),
                fallback=None,
            )
            if not mapped_category:
                return None

            poi, created = POI.objects.update_or_create(
                external_id=data.external_id,
                defaults={
                    'name': data.name,
                    'address': data.address,
                    'location': Point(data.lon, data.lat),
                    'category': mapped_category,
                    'metadata': {
                        **(data.metadata or {}),
                        'categorization': classification,
                    },
                    'tags': self._normalize_tags(normalized_tags + classification.get('effective_types', [])),
                }
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
            fallback=POI.Category.ENTERTAINMENT,
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
    
    # Private helper methods
    
    def _fetch_google_places(self, lat: float, lon: float) -> List[Dict]:
        """Fetch places from Google Places API"""
        if not self.GOOGLE_API_KEY:
            return []
        
        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        params = {
            'location': f"{lat},{lon}",
            'radius': 5000,
            'key': self.GOOGLE_API_KEY,
        }
        
        try:
            response = requests.get(url, params=params)
            self.rate_limiter.check_limit()
            return response.json().get('results', [])
        except Exception as e:
            print(f"Error fetching from Google Places: {str(e)}")
            return []
    
    def _fetch_foursquare_places(self, lat: float, lon: float) -> List[Dict]:
        """Fetch places from Foursquare API"""
        if not self.FSQ_API_KEY:
            return []
        
        url = "https://api.foursquare.com/v3/places/search"
        params = {
            'll': f"{lat},{lon}",
            'radius': 5000,
            'limit': 50,
        }
        headers = {
            'Authorization': f"Bearer {self.FSQ_API_KEY}",
            'Accept': 'application/json',
        }
        
        try:
            response = requests.get(url, params=params, headers=headers)
            self.rate_limiter.check_limit()
            return response.json().get('results', [])
        except Exception as e:
            print(f"Error fetching from Foursquare: {str(e)}")
            return []

    def _fetch_osm_places(self, lat: float, lon: float) -> List[Dict]:
        """Fetch fallback places from OpenStreetMap Overpass."""
        query = f"""
[out:json][timeout:20];
(
  node(around:4000,{lat},{lon})[amenity~"restaurant|cafe|fast_food|bar|pub|bakery|ice_cream|tea"];
  way(around:4000,{lat},{lon})[amenity~"restaurant|cafe|fast_food|bar|pub|bakery|ice_cream|tea"];
  node(around:4000,{lat},{lon})[tourism~"museum|attraction|gallery|viewpoint"];
  way(around:4000,{lat},{lon})[tourism~"museum|attraction|gallery|viewpoint"];
  node(around:4000,{lat},{lon})[leisure~"park|garden"];
  way(around:4000,{lat},{lon})[leisure~"park|garden"];
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
        return ExternalPlaceDTO(
            external_id=place_data.get('place_id'),
            name=place_data.get('name'),
            address=place_data.get('vicinity'),
            lat=place_data['geometry']['location']['lat'],
            lon=place_data['geometry']['location']['lng'],
            category=(place_types[0] if place_types else 'other'),
            metadata={
                'rating': place_data.get('rating'),
                'user_ratings_total': place_data.get('user_ratings_total'),
                'photo_url': place_data.get('photos', [{}])[0].get('photo_reference'),
            },
            tags=self._normalize_tags(place_types),
        )
    
    def _parse_fsq_place(self, place_data: Dict) -> 'ExternalPlaceDTO':
        """Parse Foursquare API response"""
        location = place_data.get('location', {})
        categories = place_data.get('categories', [])
        primary_category = categories[0].get('name', 'other') if categories else 'other'
        category_tags = [c.get('name') for c in categories]
        return ExternalPlaceDTO(
            external_id=place_data.get('fsq_id'),
            name=place_data.get('name'),
            address=location.get('formatted_address'),
            lat=location.get('lat', 0),
            lon=location.get('lon', 0),
            category=primary_category,
            metadata={
                'rating': place_data.get('rating'),
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
        category = amenity or tourism or leisure or 'other'

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

        tag_values = [amenity, tourism, leisure, str(tags.get('cuisine') or '').strip()]

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
