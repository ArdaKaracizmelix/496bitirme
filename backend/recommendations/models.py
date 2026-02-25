import uuid
from django.db import models
from locations.models import POI
from user.models import UserProfile


class InteractionType(models.TextChoices):
    """Enumeration for user interaction types"""
    VIEW = 'VIEW', 'View'
    LIKE = 'LIKE', 'Like'
    SHARE = 'SHARE', 'Share'
    VISIT = 'VISIT', 'Visit'
    CLICK = 'CLICK', 'Click'
    CHECK_IN = 'CHECK_IN', 'Check In'


class Interaction(models.Model):
    """
    Records user interactions with POIs for reinforcement learning.
    Used by ScoringService.update_user_vector() to refine user preference vectors.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='interactions')
    poi = models.ForeignKey(POI, on_delete=models.CASCADE, related_name='interactions')
    interaction_type = models.CharField(
        max_length=20,
        choices=InteractionType.choices,
        help_text="Type of user interaction: VIEW, LIKE, SHARE, VISIT, CLICK, CHECK_IN"
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'recommendations_interaction'
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['poi', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.user.user.username} - {self.interaction_type} - {self.poi.name}"


class Review(models.Model):
    """
    User reviews for POIs.
    Used by TrendAnalyzer.get_underrated_places() for filtering by review count and rating.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name='reviews')
    poi = models.ForeignKey(POI, on_delete=models.CASCADE, related_name='reviews')
    rating = models.FloatField(
        help_text="Rating from 0.0 to 5.0",
        validators=[lambda x: 0 <= x <= 5]
    )
    comment = models.TextField(blank=True, default="")
    is_verified_purchase = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'recommendations_review'
        indexes = [
            models.Index(fields=['poi', 'rating']),
            models.Index(fields=['created_at']),
        ]
        unique_together = ('user', 'poi')
    
    def __str__(self):
        return f"Review by {self.user.user.username} for {self.poi.name} - {self.rating}/5"


class TrendingList(models.Model):
    """
    Cached trending POIs for a specific geohash.
    Used by TrendAnalyzer.get_trending_now() to avoid repeated Redis queries.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    geohash = models.CharField(
        max_length=12,
        unique=True,
        help_text="Geohash string identifying geographic area"
    )
    pois = models.JSONField(
        default=list,
        help_text="List of trending POI IDs (UUID strings)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'recommendations_trending_list'
        indexes = [
            models.Index(fields=['geohash']),
        ]
    
    def __str__(self):
        return f"Trending in {self.geohash}"


class BlacklistedPOI(models.Model):
    """
    Temporarily blacklisted POIs due to negative feedback spikes.
    Used by TrendAnalyzer.blacklist_place() to exclude POIs from recommendations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    poi = models.OneToOneField(POI, on_delete=models.CASCADE, related_name='blacklist_entry')
    reason = models.TextField(help_text="Reason for blacklisting")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="When the blacklist entry expires")
    
    class Meta:
        db_table = 'recommendations_blacklisted_poi'
        indexes = [
            models.Index(fields=['expires_at']),
        ]
    
    def __str__(self):
        return f"Blacklist: {self.poi.name}"


class SeasonalMetadata(models.Model):
    """
    Seasonal trends metadata for POIs.
    Used by TrendAnalyzer.analyze_seasonal_trends() to tag POIs with seasonal information.
    """
    SEASON_CHOICES = [
        ('SPRING', 'Spring'),
        ('SUMMER', 'Summer'),
        ('FALL', 'Fall'),
        ('WINTER', 'Winter'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    poi = models.OneToOneField(POI, on_delete=models.CASCADE, related_name='seasonal_metadata')
    peak_season = models.CharField(
        max_length=10,
        choices=SEASON_CHOICES,
        help_text="Season with highest visit frequency"
    )
    visit_count_spring = models.IntegerField(default=0)
    visit_count_summer = models.IntegerField(default=0)
    visit_count_fall = models.IntegerField(default=0)
    visit_count_winter = models.IntegerField(default=0)
    last_analyzed_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'recommendations_seasonal_metadata'
    
    def __str__(self):
        return f"Seasonal data for {self.poi.name}"
