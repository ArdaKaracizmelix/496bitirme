"""
DRF Serializers for POI model and related data.
"""
from rest_framework import serializers
from django.contrib.gis.geos import Point
from .models import POI


class POISerializer(serializers.ModelSerializer):
    """Serializer for POI model with geospatial data handling"""
    
    # Custom field for latitude/longitude in frontend-friendly format
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    
    class Meta:
        model = POI
        fields = [
            'id',
            'name',
            'address',
            'latitude',
            'longitude',
            'category',
            'average_rating',
            'external_id',
            'metadata',
            'tags',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_latitude(self, obj):
        """Extract latitude from location PointField"""
        if obj.location:
            return obj.location.y
        return None
    
    def get_longitude(self, obj):
        """Extract longitude from location PointField"""
        if obj.location:
            return obj.location.x
        return None
    
    def create(self, validated_data):
        """Override create to handle latitude/longitude conversion to Point"""
        # Extract lat/lon from context if provided
        request = self.context.get('request')
        latitude = request.data.get('latitude') if request else None
        longitude = request.data.get('longitude') if request else None
        
        if latitude and longitude:
            validated_data['location'] = Point(longitude, latitude)
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """Override update to handle latitude/longitude conversion to Point"""
        request = self.context.get('request')
        if request:
            latitude = request.data.get('latitude')
            longitude = request.data.get('longitude')
            
            if latitude and longitude:
                validated_data['location'] = Point(longitude, latitude)
        
        return super().update(instance, validated_data)


class POIListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views"""
    
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    
    class Meta:
        model = POI
        fields = [
            'id',
            'name',
            'latitude',
            'longitude',
            'category',
            'average_rating',
        ]
    
    def get_latitude(self, obj):
        if obj.location:
            return obj.location.y
        return None
    
    def get_longitude(self, obj):
        if obj.location:
            return obj.location.x
        return None


class ClusterSerializer(serializers.Serializer):
    """Serializer for clustered POI data"""
    
    center = serializers.ListField(
        child=serializers.FloatField(),
        help_text="[latitude, longitude]"
    )
    count = serializers.IntegerField(help_text="Number of POIs in cluster")
    avg_rating = serializers.FloatField(help_text="Average rating of cluster")
    category = serializers.CharField(help_text="Primary category of cluster")
