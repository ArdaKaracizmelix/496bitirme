"""
Views for the recommendations module.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from recommendations.models import Interaction, Review, InteractionType
from recommendations.serializers import (
    InteractionSerializer, ReviewSerializer, ScoredPOISerializer, 
    ContextDTOSerializer, PointDTOSerializer
)
from recommendations.dtos import ContextDTO, PointDTO
from recommendations.scoring_service import ScoringService
from recommendations.trend_analyzer import TrendAnalyzer
from user.models import UserProfile


class InteractionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing user interactions with POIs.
    """
    queryset = Interaction.objects.all()
    serializer_class = InteractionSerializer
    
    def get_queryset(self):
        """Filter interactions by user if user_id is provided"""
        user_id = self.request.query_params.get('user_id')
        if user_id:
            return Interaction.objects.filter(user_id=user_id)
        return Interaction.objects.all()
    
    def perform_create(self, serializer):
        """Save interaction and update user preference vector"""
        interaction = serializer.save()
        
        # Update user preference vector based on interaction type
        scoring_service = ScoringService()
        scoring_service.update_user_vector(str(interaction.user.id), interaction.interaction_type)


class ReviewViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing POI reviews.
    """
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    
    def get_queryset(self):
        """Filter reviews by POI or user if provided"""
        poi_id = self.request.query_params.get('poi_id')
        user_id = self.request.query_params.get('user_id')
        
        queryset = Review.objects.all()
        if poi_id:
            queryset = queryset.filter(poi_id=poi_id)
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        return queryset


class GenerateRecommendationsView(APIView):
    """
    API endpoint for generating personalized recommendations.
    
    POST /api/recommendations/generate/
    Body:
    {
        "user_id": "uuid",
        "context": {
            "user_location": {"latitude": 40.7128, "longitude": -74.0060},
            "radius_meters": 5000,
            "max_results": 10,
            "is_open_only": true
        }
    }
    """
    
    def post(self, request):
        """Generate recommendations for a user"""
        user_id = request.data.get('user_id')
        context_data = request.data.get('context')
        
        if not user_id:
            return Response(
                {'error': 'user_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not context_data:
            return Response(
                {'error': 'context is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate context data
        context_serializer = ContextDTOSerializer(data=context_data)
        if not context_serializer.is_valid():
            return Response(
                {'error': context_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get user
        try:
            user = UserProfile.objects.get(id=user_id)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': f'User {user_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Create ContextDTO from validated data
        location_data = context_serializer.validated_data['user_location']
        context = ContextDTO(
            user_location=PointDTO(
                latitude=location_data['latitude'],
                longitude=location_data['longitude']
            ),
            time_of_day=context_serializer.validated_data.get('time_of_day'),
            is_open_only=context_serializer.validated_data.get('is_open_only', True),
            radius_meters=context_serializer.validated_data.get('radius_meters', 5000.0),
            max_results=context_serializer.validated_data.get('max_results', 10),
        )
        
        # Generate recommendations
        try:
            scoring_service = ScoringService()
            recommendations = scoring_service.generate_recommendations(user, context)
            
            # Serialize results
            serializer = ScoredPOISerializer(recommendations, many=True)
            return Response(
                {'recommendations': serializer.data},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class UnderratedPlacesView(APIView):
    """
    API endpoint for getting underrated POIs in an area.
    
    GET /api/recommendations/underrated/?geohash=ezs42
    """
    
    def get(self, request):
        """Get underrated places for a geohash"""
        geohash = request.query_params.get('geohash')
        
        if not geohash:
            return Response(
                {'error': 'geohash parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            trend_analyzer = TrendAnalyzer()
            underrated_pois = trend_analyzer.get_underrated_places(geohash)
            
            from locations.serializers import POIListSerializer
            serializer = POIListSerializer(underrated_pois, many=True)
            
            return Response(
                {'underrated_places': serializer.data},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TrendingPlacesView(APIView):
    """
    API endpoint for getting trending POIs in an area.
    
    GET /api/recommendations/trending/?geohash=ezs42
    """
    
    def get(self, request):
        """Get trending places for a geohash"""
        geohash = request.query_params.get('geohash')
        
        if not geohash:
            return Response(
                {'error': 'geohash parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            trend_analyzer = TrendAnalyzer()
            trending_pois = trend_analyzer.get_trending_now(geohash)
            
            from locations.serializers import POIListSerializer
            serializer = POIListSerializer(trending_pois, many=True)
            
            return Response(
                {'trending_places': serializer.data},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BlacklistPOIView(APIView):
    """
    API endpoint for blacklisting a POI.
    
    POST /api/recommendations/blacklist/
    Body:
    {
        "poi_id": "uuid",
        "reason": "Negative feedback spike",
        "duration_hours": 24
    }
    """
    
    def post(self, request):
        """Blacklist a POI"""
        poi_id = request.data.get('poi_id')
        reason = request.data.get('reason', 'Negative feedback spike')
        duration_hours = request.data.get('duration_hours', 24)
        
        if not poi_id:
            return Response(
                {'error': 'poi_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            trend_analyzer = TrendAnalyzer()
            trend_analyzer.blacklist_place(str(poi_id), reason, duration_hours)
            
            return Response(
                {'message': f'POI {poi_id} has been blacklisted'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AnalyzeSeasonalTrendsView(APIView):
    """
    API endpoint for triggering seasonal trend analysis.
    
    POST /api/recommendations/analyze-seasonal-trends/
    """
    
    def post(self, request):
        """Trigger seasonal trend analysis"""
        try:
            trend_analyzer = TrendAnalyzer()
            trend_analyzer.analyze_seasonal_trends()
            
            return Response(
                {'message': 'Seasonal trends analysis completed'},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
