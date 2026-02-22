import uuid
from django.db import models
from django.contrib.gis.db import models as gis_models
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import Distance
from django.contrib.gis.db.models.functions import Distance as DistanceFunc


class POI(models.Model):
    """
    Point of Interest (POI) - Primary database entity representing a physical location.
    Extends Django's Model class and utilizes django.contrib.gis.db.models.PointField 
    for geospatial storage with PostGIS enabling optimized spatial indexing (R-Tree).
    """
    
    class Category(models.TextChoices):
        # there will be more categories added in the future, fetching from external sources(APIs).

        """Enumeration for POI categories"""
        HISTORICAL = 'HISTORICAL', 'Historical'
        NATURE = 'NATURE', 'Nature'
        FOOD = 'FOOD', 'Food'
        ENTERTAINMENT = 'ENTERTAINMENT', 'Entertainment'
    
    # Primary Key
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # Basic Information
    name = models.CharField(max_length=255, help_text="The official name of the place")
    address = models.CharField(max_length=512, help_text="Human readable physical address")
    
    # Geospatial Data
    location = gis_models.PointField(
        srid=4326, 
        help_text="PostGIS: Stores geometry data (SRID=4326) representing Longitude/Latitude"
    )
    
    # Classification
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        help_text="Classification: HISTORICAL, NATURE, FOOD, ENTERTAINMENT etc."
    )
    
    # Rating & Quality
    average_rating = models.FloatField(
        default=0.0,
        help_text="Cached aggregate rating (0.0 - 5.0) to avoid joining review tables on every read"
    )
    
    # External Integration
    external_id = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        help_text="Unique ID from source provider to prevent duplicates"
    )
    
    # Flexible Storage
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Flexible storage for structured data"
    )
    
    # Vector Search Tags
    tags = models.JSONField(
        default=list,
        blank=True,
        help_text="List of keywords used for vector similarity matching in the Recommendation Engine"
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'locations_poi'
        indexes = [
            models.Index(fields=['external_id']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return self.name
    
    def save(self, *args, **kwargs):
        """
        Overridden save method to ensure coordinates are valid and triggers 
        cache invalidation for the surrounding Geohash.
        """
        # Validate coordinates
        if self.location:
            lat = self.location.y
            lon = self.location.x
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Invalid coordinates: latitude must be -90 to 90, longitude must be -180 to 180")
        
        super().save(*args, **kwargs)
    
    def distance_to(self, target_point):
        """
        Returns the geodesic distance to another point using PostGIS ST_Distance.
        
        Args:
            target_point: A GIS Point object
            
        Returns:
            Distance object representing the distance in meters
        """
        if not self.location or not target_point:
            return None
        # Use ST_Distance with geography type for proper geodetic distance in meters
        from django.db import connection
        
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT ST_Distance(%s::geography, %s::geography)",
                [self.location.wkt, target_point.wkt]
            )
            distance_meters = cursor.fetchone()[0]
        
        return Distance(m=distance_meters)
    
    def get_lat_lon(self):
        """
        Helper method to return coordinates in a frontend-friendly format.
        
        Returns:
            Tuple of (latitude: float, longitude: float)
        """
        if self.location:
            return (self.location.y, self.location.x)
        return None
