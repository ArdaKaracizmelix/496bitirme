"""
API views for locations app endpoints.
"""
import logging
import threading
import time

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
from django.core.cache import cache
from django.contrib.gis.geos import Point, Polygon
from django.db.models import Q
from django.shortcuts import get_object_or_404
from .models import POI
from .serializers import POISerializer, POIListSerializer, ClusterSerializer
from .services import GeoService, ExternalSyncService

logger = logging.getLogger(__name__)

# Auto external-sync tuning for map exploration
AUTO_SYNC_MIN_RESULTS = 8
AUTO_SYNC_GEOHASH_PRECISION = 5
AUTO_SYNC_COOLDOWN_SECONDS = 30 * 60  # 30 minutes per geohash cell
_AUTO_SYNC_FALLBACK_COOLDOWN = {}
_AUTO_SYNC_FALLBACK_LOCK = threading.Lock()


def _seed_demo_pois_if_empty():
    """
    Seed a minimal set of demo POIs in DEBUG mode when database is empty.
    Keeps local development usable without manual data import.
    """
    if not settings.DEBUG or POI.objects.exists():
        return

    demo_pois = [
        {
            "name": "Ayasofya",
            "address": "Sultanahmet, Istanbul",
            "lat": 41.0086,
            "lon": 28.9802,
            "category": POI.Category.HISTORICAL,
            "average_rating": 4.8,
            "external_id": "demo-ayasofya",
            "tags": ["tarih", "museum", "istanbul"],
        },
        {
            "name": "Topkapi Sarayi",
            "address": "Fatih, Istanbul",
            "lat": 41.0115,
            "lon": 28.9833,
            "category": POI.Category.HISTORICAL,
            "average_rating": 4.7,
            "external_id": "demo-topkapi",
            "tags": ["tarih", "saray", "istanbul"],
        },
        {
            "name": "Galata Kulesi",
            "address": "Beyoglu, Istanbul",
            "lat": 41.0256,
            "lon": 28.9741,
            "category": POI.Category.HISTORICAL,
            "average_rating": 4.6,
            "external_id": "demo-galata",
            "tags": ["tarih", "tower", "istanbul"],
        },
        {
            "name": "Gencilik Parki",
            "address": "Altindag, Ankara",
            "lat": 39.9391,
            "lon": 32.8538,
            "category": POI.Category.NATURE,
            "average_rating": 4.4,
            "external_id": "demo-genclik-parki",
            "tags": ["park", "ankara", "nature"],
        },
        {
            "name": "Anitkabir",
            "address": "Cankaya, Ankara",
            "lat": 39.9250,
            "lon": 32.8369,
            "category": POI.Category.HISTORICAL,
            "average_rating": 4.9,
            "external_id": "demo-anitkabir",
            "tags": ["tarih", "ankara", "anit"],
        },
        {
            "name": "Kugulu Park",
            "address": "Kavaklidere, Ankara",
            "lat": 39.9086,
            "lon": 32.8597,
            "category": POI.Category.NATURE,
            "average_rating": 4.5,
            "external_id": "demo-kugulu-park",
            "tags": ["park", "ankara", "nature"],
        },
    ]

    for item in demo_pois:
        POI.objects.update_or_create(
            external_id=item["external_id"],
            defaults={
                "name": item["name"],
                "address": item["address"],
                "location": Point(item["lon"], item["lat"]),
                "category": item["category"],
                "average_rating": item["average_rating"],
                "metadata": {},
                "tags": item["tags"],
            },
        )


def _run_external_sync(lat: float, lon: float):
    """Run external sync in a background thread to keep nearby responses fast."""
    try:
        sync_service = ExternalSyncService(
            google_api_key=getattr(settings, 'GOOGLE_PLACES_API_KEY', None),
            fsq_api_key=getattr(settings, 'FOURSQUARE_API_KEY', None),
        )
        created = sync_service.fetch_and_sync(lat, lon)
        logger.info("auto-sync completed lat=%s lon=%s created=%s", lat, lon, created)
    except Exception:
        logger.exception("auto-sync failed lat=%s lon=%s", lat, lon)


def _maybe_trigger_external_sync(lat: float, lon: float, local_result_count: int):
    """
    Trigger throttled external sync when local nearby results are low.
    Uses geohash+cooldown to avoid repeated external API calls.
    """
    if local_result_count >= AUTO_SYNC_MIN_RESULTS:
        return

    geohash = GeoService.encode_geohash(lat, lon, AUTO_SYNC_GEOHASH_PRECISION)
    cache_key = f"locations:auto-sync:{geohash}"

    try:
        if cache.get(cache_key):
            return
        cache.set(cache_key, "1", timeout=AUTO_SYNC_COOLDOWN_SECONDS)
    except Exception:
        # Fallback cooldown for environments where Redis/cache is unavailable.
        now = time.time()
        with _AUTO_SYNC_FALLBACK_LOCK:
            expires_at = _AUTO_SYNC_FALLBACK_COOLDOWN.get(cache_key, 0)
            if expires_at > now:
                return
            _AUTO_SYNC_FALLBACK_COOLDOWN[cache_key] = now + AUTO_SYNC_COOLDOWN_SECONDS
        logger.warning("auto-sync cache unavailable, using process-local cooldown")

    threading.Thread(target=_run_external_sync, args=(lat, lon), daemon=True).start()


class POIViewSet(viewsets.ModelViewSet):
    """
    ViewSet for POI CRUD operations and geospatial queries.
    """
    queryset = POI.objects.all().order_by('-created_at')
    serializer_class = POISerializer
    permission_classes = [AllowAny]

    def list(self, request, *args, **kwargs):
        _seed_demo_pois_if_empty()
        return super().list(request, *args, **kwargs)
    
    def get_serializer_class(self):
        """Use lightweight serializer for list views"""
        if self.action == 'list':
            return POIListSerializer
        return POISerializer
    
    @action(detail=False, methods=['get'])
    def nearby(self, request):
        """
        Find POIs near a location.
        
        Query parameters:
        - latitude: float (required)
        - longitude: float (required)
        - radius: int in meters (default: 5000)
        - category: str (optional filter)
        - min_rating: float (optional filter)
        """
        try:
            lat = float(request.query_params.get('latitude'))
            lon = float(request.query_params.get('longitude'))
            radius = int(request.query_params.get('radius', 5000))
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid parameters. Required: latitude, longitude (float), radius (int)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate coordinates
        if not GeoService.is_location_valid(lat, lon):
            return Response(
                {'error': 'Invalid coordinates'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Build filters dict
        filters = {}
        if request.query_params.get('category'):
            filters['category'] = request.query_params.get('category')
        if request.query_params.get('min_rating'):
            filters['min_rating'] = float(request.query_params.get('min_rating'))
        
        # Get nearby POIs
        _seed_demo_pois_if_empty()
        center = Point(lon, lat)
        pois = GeoService.find_nearby(center, radius, filters)
        _maybe_trigger_external_sync(lat, lon, pois.count())
        
        serializer = POIListSerializer(pois, many=True)
        return Response({
            'count': pois.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def viewport(self, request):
        """
        Find POIs within a viewport (bounding box).
        
        Query parameters:
        - north: float (required)
        - south: float (required)
        - east: float (required)
        - west: float (required)
        """
        try:
            north = float(request.query_params.get('north'))
            south = float(request.query_params.get('south'))
            east = float(request.query_params.get('east'))
            west = float(request.query_params.get('west'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid parameters. Required: north, south, east, west (float)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create bounding box polygon (counterclockwise)
        bbox = Polygon([
            (west, south),
            (east, south),
            (east, north),
            (west, north),
            (west, south),
        ])
        
        pois = GeoService.find_in_viewport(bbox)
        serializer = POIListSerializer(pois, many=True)
        
        return Response({
            'count': pois.count(),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def clusters(self, request):
        """
        Get clustered POIs for viewport at specific zoom level.
        
        Query parameters:
        - north: float (required)
        - south: float (required)
        - east: float (required)
        - west: float (required)
        - zoom: int (required, 0-20)
        """
        try:
            north = float(request.query_params.get('north'))
            south = float(request.query_params.get('south'))
            east = float(request.query_params.get('east'))
            west = float(request.query_params.get('west'))
            zoom = int(request.query_params.get('zoom'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid parameters. Required: north, south, east, west, zoom'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create bounding box
        bbox = Polygon([
            (west, south),
            (east, south),
            (east, north),
            (west, north),
            (west, south),
        ])
        
        clusters = GeoService.get_cluster_aggregates(bbox, zoom)
        serializer = ClusterSerializer(clusters, many=True)
        
        return Response({
            'count': len(clusters),
            'results': serializer.data
        })
    
    @action(detail=True, methods=['get'])
    def distance(self, request, pk=None):
        """
        Calculate distance from a POI to another location.
        
        Query parameters:
        - latitude: float (required)
        - longitude: float (required)
        """
        poi = self.get_object()
        
        try:
            lat = float(request.query_params.get('latitude'))
            lon = float(request.query_params.get('longitude'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid parameters. Required: latitude, longitude (float)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        target_point = Point(lon, lat)
        distance = poi.distance_to(target_point)
        
        if distance is None:
            return Response(
                {'error': 'Distance calculation failed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return Response({
            'poi_id': str(poi.id),
            'distance_meters': float(distance.m),
            'distance_km': float(distance.km),
        })
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def sync_external(self, request):
        """
        Trigger external data sync for a location.
        Admin/Staff only.
        
        Body parameters:
        - latitude: float (required)
        - longitude: float (required)
        - source: str 'google'|'foursquare'|'both' (optional, default: 'both')
        """
        if not request.user.is_staff:
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            lat = float(request.data.get('latitude'))
            lon = float(request.data.get('longitude'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid parameters. Required: latitude, longitude (float)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not GeoService.is_location_valid(lat, lon):
            return Response(
                {'error': 'Invalid coordinates'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Initialize sync service
        sync_service = ExternalSyncService(
            google_api_key=getattr(settings, 'GOOGLE_PLACES_API_KEY', None),
            fsq_api_key=getattr(settings, 'FOURSQUARE_API_KEY', None)
        )
        
        try:
            new_count = sync_service.fetch_and_sync(lat, lon)
            return Response({
                'status': 'success',
                'new_pois_added': new_count,
                'latitude': lat,
                'longitude': lon,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def refresh_metadata(self, request, pk=None):
        """
        Refresh metadata for a specific POI from external source.
        Admin/Staff only.
        """
        if not request.user.is_staff:
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        poi = self.get_object()
        sync_service = ExternalSyncService(
            google_api_key=getattr(settings, 'GOOGLE_PLACES_API_KEY', None),
            fsq_api_key=getattr(settings, 'FOURSQUARE_API_KEY', None)
        )
        
        try:
            success = sync_service.refresh_metadata(poi)
            return Response({
                'status': 'success' if success else 'no_update_needed',
                'refreshed': success,
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def toggle_favorite(self, request, pk=None):
        """
        Toggle favorite status for a POI.
        Returns the new favorite state.
        """
        try:
            from .models import SavedPOI
            poi = self.get_object()
            user_profile = request.user.profile
            
            saved = SavedPOI.objects.filter(user=user_profile, poi=poi).exists()
            
            if saved:
                SavedPOI.objects.filter(user=user_profile, poi=poi).delete()
                is_favorited = False
            else:
                SavedPOI.objects.create(user=user_profile, poi=poi)
                is_favorited = True
            
            return Response({
                'is_favorited': is_favorited,
                'poi_id': str(poi.id)
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def is_favorited(self, request, pk=None):
        """
        Check if POI is favorited by current user.
        """
        try:
            from .models import SavedPOI
            poi = self.get_object()
            user_profile = request.user.profile
            
            is_favorited = SavedPOI.objects.filter(user=user_profile, poi=poi).exists()
            
            return Response({
                'is_favorited': is_favorited,
                'poi_id': str(poi.id)
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def search(self, request):
        """
        Search for POIs by name or tags.
        
        Query parameters:
        - q: search query (required)
        """
        query = request.query_params.get('q', '').strip()
        
        if not query:
            return Response({
                'error': 'Search query is required',
                'count': 0,
                'results': []
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Search by name (case-insensitive contains)
        pois = POI.objects.filter(
            Q(name__icontains=query) |
            Q(tags__contains=[query.lower()])
        ).distinct()
        
        serializer = POIListSerializer(pois, many=True)
        return Response({
            'count': pois.count(),
            'results': serializer.data
        })
