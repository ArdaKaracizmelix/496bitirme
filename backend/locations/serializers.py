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
    matched_interests = serializers.SerializerMethodField()
    
    class Meta:
        model = POI
        fields = [
            'id',
            'name',
            'latitude',
            'longitude',
            'category',
            'average_rating',
            'matched_interests',
        ]
    
    def get_latitude(self, obj):
        if obj.location:
            return obj.location.y
        return None
    
    def get_longitude(self, obj):
        if obj.location:
            return obj.location.x
        return None

    def get_matched_interests(self, obj):
        requested = self.context.get('requested_interests') or []
        if not isinstance(requested, list) or not requested:
            return []

        def _normalize(value):
            return str(value or '').strip().lower().replace('-', '_').replace(' ', '_')

        poi_tags = [_normalize(tag) for tag in (obj.tags or []) if _normalize(tag)]
        if not poi_tags:
            return []

        poi_tags_set = set(poi_tags)
        matches = []
        for item in requested:
            normalized = _normalize(item)
            if not normalized:
                continue
            singular = normalized[:-1] if normalized.endswith('s') else normalized
            if (
                normalized in poi_tags_set
                or singular in poi_tags_set
                or any(
                    normalized in tag
                    or tag in normalized
                    or singular in tag
                    or tag in singular
                    for tag in poi_tags_set
                )
            ):
                matches.append(normalized)

        # Keep deterministic uniqueness
        return list(dict.fromkeys(matches))


class ClusterSerializer(serializers.Serializer):
    """Serializer for clustered POI data"""
    
    center = serializers.ListField(
        child=serializers.FloatField(),
        help_text="[latitude, longitude]"
    )
    count = serializers.IntegerField(help_text="Number of POIs in cluster")
    avg_rating = serializers.FloatField(help_text="Average rating of cluster")
    category = serializers.CharField(help_text="Primary category of cluster")
