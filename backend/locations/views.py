"""
API views for locations app endpoints.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.conf import settings
from django.contrib.gis.geos import Point, Polygon
from django.shortcuts import get_object_or_404
from .models import POI
from .serializers import POISerializer, POIListSerializer, ClusterSerializer
from .services import GeoService, ExternalSyncService


class POIViewSet(viewsets.ModelViewSet):
    """
    ViewSet for POI CRUD operations and geospatial queries.
    """
    queryset = POI.objects.all().order_by('-created_at')
    serializer_class = POISerializer
    permission_classes = [AllowAny]
    
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
        center = Point(lon, lat)
        pois = GeoService.find_nearby(center, radius, filters)
        
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
            google_api_key=getattr(settings, 'GOOGLE_API_KEY', None),
            fsq_api_key=getattr(settings, 'FSQ_API_KEY', None)
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
            google_api_key=getattr(settings, 'GOOGLE_API_KEY', None),
            fsq_api_key=getattr(settings, 'FSQ_API_KEY', None)
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
