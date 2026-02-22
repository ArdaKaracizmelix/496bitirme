"""
Domain services for the locations app implementing business logic
for geospatial operations and external data synchronization.
"""
import geohash2
import requests
from typing import Dict, List, Optional, Tuple
from django.contrib.gis.geos import Point, Polygon
from django.contrib.gis.measure import Distance
from django.db.models import QuerySet
from django.conf import settings
from .models import POI


class GeoService:
    """
    Domain Service that encapsulates all spatial business logic.
    Isolates direct database queries ensuring controllers/views interact 
    with a clean API rather than raw ORM/SQL calls.
    """
    
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
        
        # Apply optional filters
        if 'category' in filters:
            queryset = queryset.filter(category=filters['category'])
        
        if 'min_rating' in filters:
            queryset = queryset.filter(average_rating__gte=filters['min_rating'])
        
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
        return POI.objects.filter(location__contained=bbox)
    
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
            poi, created = POI.objects.update_or_create(
                external_id=data.external_id,
                defaults={
                    'name': data.name,
                    'address': data.address,
                    'location': Point(data.lon, data.lat),
                    'category': self.map_category(data.category),
                    'metadata': data.metadata,
                    'tags': data.tags,
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
    
    def map_category(self, external_cat: str) -> str:
        """
        Normalizes external category strings to internal Enum values.
        
        Args:
            external_cat: Category string from external provider
            
        Returns:
            Internal POI.Category enum value
        """

        # mapping can be expanded as we integrate more APIs and encounter more category variations
        mapping = {
            'historical_place': POI.Category.HISTORICAL,
            'monument': POI.Category.HISTORICAL,
            'museum': POI.Category.HISTORICAL,
            'park': POI.Category.NATURE,
            'natural_feature': POI.Category.NATURE,
            'restaurant': POI.Category.FOOD,
            'cafe': POI.Category.FOOD,
            'amusement_park': POI.Category.ENTERTAINMENT,
            'movie_theater': POI.Category.ENTERTAINMENT,
        }
        return mapping.get(external_cat.lower(), POI.Category.ENTERTAINMENT)
    
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
    
    def _parse_google_place(self, place_data: Dict) -> 'ExternalPlaceDTO':
        """Parse Google Places API response"""
        return ExternalPlaceDTO(
            external_id=place_data.get('place_id'),
            name=place_data.get('name'),
            address=place_data.get('vicinity'),
            lat=place_data['geometry']['location']['lat'],
            lon=place_data['geometry']['location']['lng'],
            category=place_data.get('types', ['other'])[0],
            metadata={
                'rating': place_data.get('rating'),
                'user_ratings_total': place_data.get('user_ratings_total'),
                'photo_url': place_data.get('photos', [{}])[0].get('photo_reference'),
            },
            tags=place_data.get('types', []),
        )
    
    def _parse_fsq_place(self, place_data: Dict) -> 'ExternalPlaceDTO':
        """Parse Foursquare API response"""
        location = place_data.get('location', {})
        return ExternalPlaceDTO(
            external_id=place_data.get('fsq_id'),
            name=place_data.get('name'),
            address=location.get('formatted_address'),
            lat=location.get('lat', 0),
            lon=location.get('lon', 0),
            category=place_data.get('categories', [{}])[0].get('name', 'other'),
            metadata={
                'rating': place_data.get('rating'),
                'distance': place_data.get('distance'),
            },
            tags=[c.get('name') for c in place_data.get('categories', [])],
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
