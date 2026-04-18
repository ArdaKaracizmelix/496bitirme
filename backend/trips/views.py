"""
API views for trips app endpoints.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from django.db import transaction, models
from .models import Itinerary, ItineraryItem
from .serializers import (
    ItinerarySerializer,
    ItineraryListSerializer,
    ItineraryItemSerializer,
    ItineraryCloneSerializer,
    ItineraryShareLinkSerializer,
    ItineraryGenerateRequestSerializer,
)
from locations.serializers import POIListSerializer


class ItineraryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Itinerary CRUD operations and related actions.
    
    Supported Query Parameters for LIST endpoint:
    - status: Filter by status (DRAFT, ACTIVE, COMPLETED, ARCHIVED)
    - visibility: Filter by visibility (PRIVATE, PUBLIC)
    - title: Filter by title (case-insensitive substring match)
    - start_date_after: Filter trips starting on or after this date (ISO format)
    - start_date_before: Filter trips starting on or before this date (ISO format)
    - upcoming: Set to 'true' to get only upcoming trips (starts in future)
    - past: Set to 'true' to get only past trips (ended in past)
    
    Example: GET /api/trips/itineraries/?status=ACTIVE&visibility=PUBLIC&upcoming=true
    """
    serializer_class = ItinerarySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Get itineraries with sensible defaults for authenticated users."""
        user = self.request.user
        from django.db.models import Q
        from django.utils import timezone

        include_public_param = self.request.query_params.get('include_public')
        include_public = (
            isinstance(include_public_param, str)
            and include_public_param.lower() == 'true'
        )

        if not user.is_authenticated:
            queryset = Itinerary.objects.filter(
                visibility=Itinerary.Visibility.PUBLIC
            )
        elif self.action == 'list':
            # Default list for signed-in users should show only their own itineraries.
            if include_public:
                queryset = Itinerary.objects.filter(
                    Q(user=user) | Q(visibility=Itinerary.Visibility.PUBLIC)
                ).distinct()
            else:
                queryset = Itinerary.objects.filter(user=user)
        else:
            # Keep public visibility for detail actions (retrieve/clone/share access).
            queryset = Itinerary.objects.filter(
                Q(user=user) | Q(visibility=Itinerary.Visibility.PUBLIC)
            ).distinct()

        queryset = queryset.order_by('-created_at')
        
        # Filter by status
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        
        # Filter by visibility
        visibility_param = self.request.query_params.get('visibility')
        if visibility_param:
            queryset = queryset.filter(visibility=visibility_param)
        
        # Filter by date range
        start_date_param = self.request.query_params.get('start_date_after')
        if start_date_param:
            try:
                start_date = timezone.datetime.fromisoformat(start_date_param)
                queryset = queryset.filter(start_date__gte=start_date)
            except (ValueError, TypeError):
                pass
        
        end_date_param = self.request.query_params.get('start_date_before')
        if end_date_param:
            try:
                end_date = timezone.datetime.fromisoformat(end_date_param)
                queryset = queryset.filter(start_date__lte=end_date)
            except (ValueError, TypeError):
                pass
        
        # Filter by title
        title_param = self.request.query_params.get('title')
        if title_param:
            queryset = queryset.filter(title__icontains=title_param)
        
        # Filter upcoming trips
        upcoming_param = self.request.query_params.get('upcoming')
        if upcoming_param and upcoming_param.lower() == 'true':
            queryset = queryset.filter(start_date__gte=timezone.now())
        
        # Filter past trips
        past_param = self.request.query_params.get('past')
        if past_param and past_param.lower() == 'true':
            queryset = queryset.filter(end_date__lt=timezone.now())
        
        return queryset

    def get_serializer_class(self):
        """Use lightweight serializer for list views"""
        if self.action == 'list':
            return ItineraryListSerializer
        elif self.action == 'clone':
            return ItineraryCloneSerializer
        elif self.action == 'generate_share_link':
            return ItineraryShareLinkSerializer
        elif self.action == 'generate_from_preferences':
            return ItineraryGenerateRequestSerializer
        return ItinerarySerializer

    def get_permissions(self):
        """
        Allow anyone to view public itineraries.
        Require authentication for create/update/delete.
        """
        if self.action == 'list' or self.action == 'retrieve':
            return [AllowAny()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        """Automatically set the user to the current user"""
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        """Only allow owner to update"""
        itinerary = self.get_object()
        if itinerary.user != self.request.user:
            raise PermissionDenied("You can only edit your own itineraries")
        serializer.save()

    def perform_destroy(self, instance):
        """Only allow owner to delete"""
        if instance.user != self.request.user:
            raise PermissionDenied("You can only delete your own itineraries")
        instance.delete()

    @staticmethod
    def _merge_interests(requested_interests, user):
        requested = []
        seen = set()

        for item in requested_interests or []:
            normalized = str(item or '').strip().lower().replace('-', '_').replace(' ', '_')
            if normalized and normalized not in seen:
                requested.append(normalized)
                seen.add(normalized)

        # If user explicitly provided interests, do not append noisy profile history.
        if requested:
            return requested

        profile = getattr(user, 'profile', None)
        profile_interests = []
        if profile is not None and isinstance(profile.preferences_vector, dict):
            weighted = []
            for key, weight in profile.preferences_vector.items():
                normalized = str(key or '').strip().lower().replace('-', '_').replace(' ', '_')
                if not normalized or normalized in seen:
                    continue
                try:
                    numeric_weight = float(weight)
                except (TypeError, ValueError):
                    numeric_weight = 0.0
                weighted.append((normalized, numeric_weight))

            # Keep only top profile interests to avoid polluting planning.
            for normalized, _ in sorted(weighted, key=lambda item: item[1], reverse=True)[:12]:
                profile_interests.append(normalized)
                seen.add(normalized)

        return requested + profile_interests

    @action(detail=True, methods=['post'])
    def clone(self, request, pk=None):
        """
        Clone this itinerary for the current user.
        Only public itineraries can be cloned.
        """
        itinerary = self.get_object()

        if itinerary.visibility != Itinerary.Visibility.PUBLIC:
            return Response(
                {'error': 'Only public itineraries can be cloned'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            cloned = itinerary.clone(request.user)
            # Use the standard serializer for the response, not the input serializer
            serializer = ItinerarySerializer(cloned, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'])
    def generate_share_link(self, request, pk=None):
        """
        Generate a signed shareable link for this itinerary.
        Only public itineraries can be shared.
        """
        itinerary = self.get_object()

        if itinerary.visibility != Itinerary.Visibility.PUBLIC:
            return Response(
                {'error': 'Only public itineraries can be shared'},
                status=status.HTTP_400_BAD_REQUEST
            )

        share_link = itinerary.generate_share_link()
        return Response({'share_link': share_link}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def optimize_route(self, request, pk=None):
        """
        Optimize the route of this itinerary using RouteOptimizer service.
        Reorders stops for minimal travel time.
        
        Request body:
        {
            "mode": "DRIVING" (optional: DRIVING, WALKING, CYCLING, TRANSIT)
        }
        
        Returns the itinerary with reordered stops.
        """
        from .services import RouteOptimizer, GoogleDistanceMatrixClient, TransportMode
        
        itinerary = self.get_object()
        
        # Only owner can optimize
        if itinerary.user != request.user:
            return Response(
                {'error': 'You can only optimize your own itineraries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get stops in current order
        items = itinerary.itineraryitem_set.all().order_by('order_index')
        if items.count() < 2:
            return Response(
                {'error': 'Need at least 2 stops to optimize route'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        stops = [item.poi for item in items]
        
        try:
            # Get transport mode from request (default to DRIVING)
            mode_str = request.data.get('mode', 'DRIVING').upper()
            mode = TransportMode[mode_str]
        except KeyError:
            return Response(
                {'error': f'Invalid transport mode. Choose from: {", ".join([m.value for m in TransportMode])}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Create optimizer and optimize route
            client = GoogleDistanceMatrixClient('')
            optimizer = RouteOptimizer(client)
            optimized_stops = optimizer.optimize_route(stops, mode)
            
            # Update order_index for each stop safely
            with transaction.atomic():
                # Map poi_id to item for efficient lookup
                item_map = {item.poi_id: item for item in items}
                
                # 1. Move to temporary positions to avoid unique constraint collisions
                for new_index, poi in enumerate(optimized_stops):
                    item = item_map[poi.id]
                    item.order_index = new_index + 100000
                    item.save(update_fields=['order_index'])
                
                # 2. Move to final positions
                for new_index, poi in enumerate(optimized_stops):
                    item = item_map[poi.id]
                    item.order_index = new_index
                    item.save(update_fields=['order_index'])
            
            # Return updated itinerary
            serializer = self.get_serializer(itinerary)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {'error': f'Route optimization failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def add_stop(self, request, pk=None):
        """
        Add a POI stop to this itinerary.
        
        Request body:
        {
            "poi_id": "uuid-of-poi",
            "order_index": 2 (optional, defaults to end of list)
        }
        """
        itinerary = self.get_object()
        
        # Only owner can add stops
        if itinerary.user != request.user:
            return Response(
                {'error': 'You can only modify your own itineraries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from locations.models import POI
        
        poi_id = request.data.get('poi_id')
        order_index = request.data.get('order_index')
        
        if not poi_id:
            return Response(
                {'error': 'poi_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            poi = POI.objects.get(id=poi_id)
        except POI.DoesNotExist:
            return Response(
                {'error': f'POI with id {poi_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # If order_index not provided, add at end
        if order_index is None:
            max_index = itinerary.itineraryitem_set.aggregate(
                max_order=models.Max('order_index')
            )['max_order']
            order_index = (max_index or -1) + 1
        
        try:
            item = ItineraryItem.objects.create(
                itinerary=itinerary,
                poi=poi,
                order_index=order_index,
            )
            serializer = ItinerarySerializer(itinerary, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response(
                {'error': f'Failed to add stop: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['patch'])
    def reorder_stops(self, request, pk=None):
        """
        Reorder stops in this itinerary.
        
        Request body:
        {
            "stops": [
                {"id": "item-uuid-1", "order_index": 0},
                {"id": "item-uuid-2", "order_index": 1},
                ...
            ]
        }
        """
        itinerary = self.get_object()
        
        # Only owner can reorder
        if itinerary.user != request.user:
            return Response(
                {'error': 'You can only modify your own itineraries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        stops_data = request.data.get('stops', [])
        
        if not stops_data:
            return Response(
                {'error': 'stops list is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Create a map of updates
                updates = {}
                for stop_item in stops_data:
                    item_id = stop_item.get('id')
                    new_order = stop_item.get('order_index')
                    if item_id is None or new_order is None:
                        return Response(
                            {'error': 'Each stop must have id and order_index'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    updates[str(item_id)] = int(new_order)
                
                # Fetch all items to be updated
                items = list(ItineraryItem.objects.filter(id__in=updates.keys(), itinerary_id=itinerary.id))
                if len(items) != len(updates):
                    return Response(
                        {'error': 'One or more stop ids are invalid for this itinerary'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Move to temporary positions to avoid unique constraint collisions
                for item in items:
                    item.order_index = updates[str(item.id)] + 100000
                    item.save(update_fields=['order_index'])
                
                # Move to final positions
                for item in items:
                    item.order_index = updates[str(item.id)]
                    item.save(update_fields=['order_index'])
            
            serializer = self.get_serializer(itinerary)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': f'Failed to reorder stops: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def export_to_calendar(self, request, pk=None):
        """
        Export trip to device calendar.
        Currently returns success - actual calendar integration depends on frontend.
        """
        itinerary = self.get_object()
        
        # Can only export own itineraries
        if itinerary.user != request.user:
            return Response(
                {'error': 'You can only export your own itineraries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            return Response({
                'status': 'success',
                'message': 'Trip exported to calendar',
                'trip_id': itinerary.id,
                'title': itinerary.title,
                'start_date': itinerary.start_date,
                'end_date': itinerary.end_date,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': f'Failed to export to calendar: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """
        Get summary information about this itinerary.
        Includes basic info and statistics.
        """
        itinerary = self.get_object()
        
        stops = itinerary.itineraryitem_set.all().order_by('order_index')
        stop_count = stops.count()
        
        # Calculate rough metrics
        total_cost = itinerary.estimated_cost or 0
        
        return Response({
            'id': itinerary.id,
            'title': itinerary.title,
            'start_date': itinerary.start_date,
            'end_date': itinerary.end_date,
            'status': itinerary.status,
            'visibility': itinerary.visibility,
            'stops_count': stop_count,
            'estimated_cost': total_cost,
            'stops': ItineraryItemSerializer(stops, many=True).data,
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def generate_from_preferences(self, request):
        """
        Generate a city-based itinerary from duration and interests.

        Request body:
        {
            "city": "Istanbul",
            "duration_days": 3,
            "interests": ["historical", "food"],
            "start_date": "2026-04-13",  // optional, defaults to today
            "title": "My Istanbul Trip", // optional
            "visibility": "PRIVATE",     // optional
            "transport_mode": "DRIVING", // optional
            "stops_per_day": 4           // optional
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        city = payload['city']
        duration_days = payload['duration_days']
        interests = self._merge_interests(payload.get('interests', []), request.user)
        start_date = payload.get('start_date') or timezone.localdate()
        title = payload.get('title') or f"{city} {duration_days}-Day Trip"
        visibility = payload.get('visibility', Itinerary.Visibility.PRIVATE)
        transport_mode = payload.get('transport_mode', Itinerary.TransportMode.DRIVING)
        stops_per_day = payload.get('stops_per_day', 4)

        from .services import TripGenerationService

        try:
            result = TripGenerationService().generate_itinerary(
                user=request.user,
                city=city,
                duration_days=duration_days,
                interests=interests,
                start_date=start_date,
                title=title,
                visibility=visibility,
                transport_mode=transport_mode,
                stops_per_day=stops_per_day,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {'error': f'Failed to generate itinerary: {str(exc)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        itinerary = result['itinerary']
        itinerary_data = ItinerarySerializer(itinerary, context={'request': request}).data
        day_plan_response = [
            {
                'day': item['day'],
                'date': item['date'],
                'theme': item.get('theme'),
                'stops_count': item['stops_count'],
                'stops': POIListSerializer(item['stops'], many=True).data,
            }
            for item in result['day_plan']
        ]

        return Response(
            {
                'itinerary': itinerary_data,
                'summary': {
                    'city': city,
                    'duration_days': duration_days,
                    'interests': interests,
                    'start_date': start_date.isoformat(),
                    'stops_per_day': stops_per_day,
                    'candidate_pois_count': result['candidate_pois_count'],
                    'selected_pois_count': result['selected_pois_count'],
                    'planning_source': result.get('planning_source', 'rule_based'),
                    'planning_source_reason': result.get('planning_source_reason', 'unknown'),
                },
                'ai_debug': {
                    'raw_response': result.get('ai_raw_response', ''),
                    'retry_raw_response': result.get('ai_retry_raw_response', ''),
                },
                'day_plan': day_plan_response,
            },
            status=status.HTTP_201_CREATED,
        )
    @action(detail=False, methods=['get'])
    def my_itineraries(self, request):
        """
        Get all itineraries belonging to the current user.
        """
        itineraries = Itinerary.objects.filter(user=request.user).order_by('-created_at')
        serializer = self.get_serializer(itineraries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def public_itineraries(self, request):
        """
        Get all public itineraries.
        """
        itineraries = Itinerary.objects.filter(visibility=Itinerary.Visibility.PUBLIC).order_by('-created_at')
        serializer = self.get_serializer(itineraries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def access_shared(self, request, token=None, **kwargs):
        """
        Access a shared itinerary using a signed token.
        Can use either: 
        - GET /api/trips/itineraries/access_shared/?token=<signed_token>
        - GET /api/trips/shared/<signed_token>/
        """
        # Support both query parameter and path parameter
        access_token = token or request.query_params.get('token')
        
        if not access_token:
            return Response(
                {'error': 'Token parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            signer = TimestampSigner()
            itinerary_id = signer.unsign(access_token, max_age=60*60*24*365)  # 1 year validity
            itinerary = get_object_or_404(Itinerary, id=itinerary_id)

            if itinerary.visibility != Itinerary.Visibility.PUBLIC:
                return Response(
                    {'error': 'This itinerary is not publicly shared'},
                    status=status.HTTP_404_NOT_FOUND
                )

            serializer = self.get_serializer(itinerary)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except SignatureExpired:
            return Response(
                {'error': 'Share link has expired'},
                status=status.HTTP_410_GONE
            )
        except BadSignature:
            return Response(
                {'error': 'Invalid share link'},
                status=status.HTTP_400_BAD_REQUEST
            )


class ItineraryItemViewSet(viewsets.ModelViewSet):
    """
    ViewSet for ItineraryItem CRUD operations.
    """
    serializer_class = ItineraryItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Get items for itineraries user has access to"""
        user = self.request.user
        from django.db.models import Q
        return ItineraryItem.objects.filter(
            Q(itinerary__user=user) | Q(itinerary__visibility=Itinerary.Visibility.PUBLIC)
        ).order_by('itinerary', 'order_index')

    def perform_create(self, serializer):
        """Only allow owner to add items"""
        itinerary_id = self.request.data.get('itinerary')
        itinerary = get_object_or_404(Itinerary, id=itinerary_id)

        if itinerary.user != self.request.user:
            raise PermissionDenied("You can only add items to your own itineraries")

        serializer.save(itinerary=itinerary)

    def perform_update(self, serializer):
        """Only allow owner to update"""
        item = self.get_object()
        if item.itinerary.user != self.request.user:
            raise PermissionDenied("You can only edit items in your own itineraries")
        serializer.save()

    def perform_destroy(self, instance):
        """Only allow owner to delete"""
        if instance.itinerary.user != self.request.user:
            raise PermissionDenied("You can only delete items from your own itineraries")
        instance.delete()

    def filter_queryset(self, queryset):
        """Filter by itinerary_id if provided"""
        queryset = super().filter_queryset(queryset)
        
        itinerary_id = self.request.query_params.get('itinerary_id')
        if itinerary_id:
            queryset = queryset.filter(itinerary_id=itinerary_id)
        
        return queryset

    @action(detail=False, methods=['get'])
    def by_itinerary(self, request):
        """
        Get all items for a specific itinerary.
        Query parameter: itinerary_id (required)
        
        Example: GET /api/trips/itinerary-items/by_itinerary/?itinerary_id=<uuid>
        """
        itinerary_id = request.query_params.get('itinerary_id')
        if not itinerary_id:
            return Response(
                {'error': 'itinerary_id query parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        itinerary = get_object_or_404(Itinerary, id=itinerary_id)
        
        # Check access
        if itinerary.user != request.user and itinerary.visibility != Itinerary.Visibility.PUBLIC:
            return Response(
                {'error': 'You do not have access to this itinerary'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        items = itinerary.itineraryitem_set.all().order_by('order_index')
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def bulk_reorder(self, request):
        """
        Bulk reorder items in an itinerary.
        
        Request body:
        {
            "itinerary_id": "uuid-of-itinerary",
            "order": [
                {"id": "item-uuid-1", "order_index": 0},
                {"id": "item-uuid-2", "order_index": 1},
                ...
            ]
        }
        
        Returns updated items in new order.
        """
        itinerary_id = request.data.get('itinerary_id')
        order_data = request.data.get('order', [])
        
        if not itinerary_id:
            return Response(
                {'error': 'itinerary_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not order_data:
            return Response(
                {'error': 'order list is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        itinerary = get_object_or_404(Itinerary, id=itinerary_id)
        
        # Check ownership
        if itinerary.user != request.user:
            return Response(
                {'error': 'You can only reorder items in your own itineraries'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            with transaction.atomic():
                # Create a map of updates
                updates = {}
                for order_item in order_data:
                    item_id = order_item.get('id')
                    new_order = order_item.get('order_index')
                    if item_id is None or new_order is None:
                        return Response(
                            {'error': 'Each order item must have id and order_index'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    updates[item_id] = new_order

                # Fetch all items to be updated
                items = list(ItineraryItem.objects.filter(id__in=updates.keys(), itinerary_id=itinerary_id))

                # 1. Move to temporary positions to avoid unique constraint collisions
                # (e.g. swapping 0 and 1 directly causes a collision)
                for item in items:
                    # Add a large offset to move out of the way
                    item.order_index = updates[item.id] + 100000
                    item.save(update_fields=['order_index'])

                # 2. Move to final positions
                for item in items:
                    item.order_index = updates[item.id]
                    item.save(update_fields=['order_index'])
            
            # Return updated items in order
            items = itinerary.itineraryitem_set.all().order_by('order_index')
            serializer = self.get_serializer(items, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except ItineraryItem.DoesNotExist:
            return Response(
                {'error': 'One or more items not found in this itinerary'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to reorder items: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
