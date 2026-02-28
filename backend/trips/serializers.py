"""
DRF Serializers for Itinerary and ItineraryItem models.
"""
from rest_framework import serializers
from .models import Itinerary, ItineraryItem
from locations.serializers import POISerializer


class ItineraryItemSerializer(serializers.ModelSerializer):
    """Serializer for ItineraryItem model"""
    poi = POISerializer(read_only=True)
    poi_id = serializers.PrimaryKeyRelatedField(
        queryset=__import__('locations.models', fromlist=['POI']).POI.objects.all(),
        write_only=True,
        source='poi'
    )

    class Meta:
        model = ItineraryItem
        fields = [
            'id',
            'poi',
            'poi_id',
            'order_index',
            'arrival_time',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ItinerarySerializer(serializers.ModelSerializer):
    """Serializer for Itinerary model"""
    stops = ItineraryItemSerializer(
        source='itineraryitem_set',
        many=True,
        read_only=True
    )
    username = serializers.CharField(source='user.username', read_only=True)
    total_duration = serializers.SerializerMethodField()

    class Meta:
        model = Itinerary
        fields = [
            'id',
            'user',
            'username',
            'title',
            'start_date',
            'end_date',
            'status',
            'visibility',
            'estimated_cost',
            'stops',
            'total_duration',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user',
            'username',
            'created_at',
            'updated_at',
            'stops',
            'total_duration',
        ]

    def get_total_duration(self, obj):
        """Get total duration in minutes"""
        return obj.get_total_duration()

    def create(self, validated_data):
        """Override create to set the user from request"""
        request = self.context.get('request')
        validated_data['user'] = request.user
        return super().create(validated_data)


class ItineraryListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views"""
    username = serializers.CharField(source='user.username', read_only=True)
    total_stops = serializers.SerializerMethodField()

    class Meta:
        model = Itinerary
        fields = [
            'id',
            'username',
            'title',
            'start_date',
            'end_date',
            'status',
            'visibility',
            'estimated_cost',
            'total_stops',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'username',
            'created_at',
        ]

    def get_total_stops(self, obj):
        """Get count of stops"""
        return obj.stops.count()


class ItineraryCloneSerializer(serializers.Serializer):
    """Serializer for cloning an itinerary"""
    target_user_id = serializers.IntegerField(required=True)

    def validate_target_user_id(self, value):
        """Validate that the target user exists"""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if not User.objects.filter(id=value).exists():
            raise serializers.ValidationError("Target user does not exist")
        return value


class ItineraryShareLinkSerializer(serializers.Serializer):
    """Serializer for generating share link"""
    share_link = serializers.SerializerMethodField()

    def get_share_link(self, obj):
        """Get the share link"""
        return obj.generate_share_link()
