"""
Serializers for the recommendations module.
"""
from rest_framework import serializers
from recommendations.models import Interaction, Review, TrendingList, BlacklistedPOI, SeasonalMetadata, InteractionType
from recommendations.dtos import ScoredPOI, ContextDTO, PointDTO
from locations.serializers import POIListSerializer
from user.serializers import UserProfileSerializer


class InteractionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interaction
        fields = ['id', 'user', 'poi', 'interaction_type', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ['id', 'user', 'poi', 'rating', 'comment', 'is_verified_purchase', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        
    def validate_rating(self, value):
        if not (0 <= value <= 5):
            raise serializers.ValidationError("Rating must be between 0 and 5")
        return value


class TrendingListSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrendingList
        fields = ['id', 'geohash', 'pois', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class BlacklistedPOISerializer(serializers.ModelSerializer):
    class Meta:
        model = BlacklistedPOI
        fields = ['id', 'poi', 'reason', 'created_at', 'expires_at']
        read_only_fields = ['id', 'created_at']


class SeasonalMetadataSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeasonalMetadata
        fields = ['id', 'poi', 'peak_season', 'visit_count_spring', 'visit_count_summer', 
                  'visit_count_fall', 'visit_count_winter', 'last_analyzed_at']
        read_only_fields = ['id', 'last_analyzed_at']


class PointDTOSerializer(serializers.Serializer):
    """Serializer for PointDTO"""
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)


class ContextDTOSerializer(serializers.Serializer):
    """Serializer for ContextDTO"""
    user_location = PointDTOSerializer(required=True)
    time_of_day = serializers.CharField(required=False, allow_blank=True)
    is_open_only = serializers.BooleanField(required=False, default=True)
    radius_meters = serializers.FloatField(required=False, default=5000.0, min_value=100)
    max_results = serializers.IntegerField(required=False, default=10, min_value=1, max_value=100)


class ScoredPOISerializer(serializers.Serializer):
    """Serializer for ScoredPOI DTO"""
    poi_id = serializers.UUIDField()
    poi_name = serializers.CharField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    category = serializers.CharField()
    average_rating = serializers.FloatField()
    final_score = serializers.FloatField()
    similarity_score = serializers.FloatField()
    distance_score = serializers.FloatField()
    rating_score = serializers.FloatField()
    distance_meters = serializers.FloatField(allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), allow_empty=True)
