"""
TrendAnalyzer: Background service for discovering trending places and solving cold start problem.
"""
import geohash2
from datetime import datetime, timedelta
from typing import List, Optional
from django.utils import timezone
from django.db.models import Q, Count, Avg
from locations.models import POI
from recommendations.models import Interaction, Review, TrendingList, BlacklistedPOI, SeasonalMetadata


class TrendAnalyzer:
    """
    Background Service: Analytical engine designed to solve the "Cold Start" problem
    and discover "Hidden Gems" (Underrated Locations).
    Runs scheduled tasks to analyze community activity logs.
    """
    
    # Threshold configuration
    UNDERRATED_THRESHOLD = 50  # Max review count to be considered "underrated"
    HIGH_RATING_FLOOR = 4.5    # Min rating to be considered "good"
    CACHE_TTL = 3600           # Cache TTL in seconds (1 hour)
    
    def __init__(self, underrated_threshold: int = 50, high_rating_floor: float = 4.5, cache_ttl: int = 3600):
        """Initialize TrendAnalyzer with custom thresholds if provided"""
        self.UNDERRATED_THRESHOLD = underrated_threshold
        self.HIGH_RATING_FLOOR = high_rating_floor
        self.CACHE_TTL = cache_ttl
    
    def get_underrated_places(self, geohash: str) -> List[POI]:
        """
        Finds underrated POIs in a geohash area.
        Criteria: rating >= HIGH_RATING_FLOOR AND review_count < UNDERRATED_THRESHOLD
        These are "Hidden Gems" - good places that aren't widely known.
        
        Args:
            geohash: Geohash string representing a geographic area
            
        Returns:
            List[POI]: List of underrated POIs in the area
        """
        # Decode geohash to get bounding box
        lat, lon, lat_err, lon_err = geohash2.decode_exactly(geohash)
        bounds = {
            'nE': (lat + lat_err, lon + lon_err),
            'sW': (lat - lat_err, lon - lon_err)
        }
        
        # Query POIs with good ratings but few reviews
        underrated_pois = POI.objects.annotate(
            review_count=Count('reviews')
        ).filter(
            Q(average_rating__gte=self.HIGH_RATING_FLOOR) &
            Q(review_count__lt=self.UNDERRATED_THRESHOLD) &
            Q(location__within=self._get_bbox_polygon(bounds))
        ).order_by('-average_rating')
        
        return list(underrated_pois)
    
    def get_trending_now(self, geohash: str) -> List[POI]:
        """
        Identifies trending POIs with high "velocity" in check-ins/clicks over last 24 hours.
        Uses interaction count as a proxy for "velocity".
        
        This method:
        1. Checks TrendingList cache first (TTL)
        2. If cache miss, analyzes last 24h interaction data
        3. Returns POIs with high interaction velocity
        
        Args:
            geohash: Geohash string
            
        Returns:
            List[POI]: List of trending POIs (by recent interactions)
        """
        # Step 1: Check cache
        try:
            cached_trending = TrendingList.objects.get(geohash=geohash)
            # Check if cache is still valid
            if (timezone.now() - cached_trending.updated_at).total_seconds() < self.CACHE_TTL:
                return POI.objects.filter(id__in=cached_trending.pois)
        except TrendingList.DoesNotExist:
            pass
        
        # Step 2: Get bounding box from geohash
        lat, lon, lat_err, lon_err = geohash2.decode_exactly(geohash)
        bounds = {
            'nE': (lat + lat_err, lon + lon_err),
            'sW': (lat - lat_err, lon - lon_err)
        }
        
        # Step 3: Analyze interactions in last 24 hours
        last_24h = timezone.now() - timedelta(hours=24)
        
        trending_pois = POI.objects.filter(
            Q(location__within=self._get_bbox_polygon(bounds)) &
            Q(interactions__timestamp__gte=last_24h)
        ).annotate(
            interaction_count=Count('interactions')
        ).order_by('-interaction_count')[:20]  # Top 20 trending
        
        # Step 4: Cache the results
        poi_ids = [str(poi.id) for poi in trending_pois]
        TrendingList.objects.update_or_create(
            geohash=geohash,
            defaults={'pois': poi_ids}
        )
        
        return list(trending_pois)
    
    def analyze_seasonal_trends(self) -> None:
        """
        Batch Job: Analyzes seasonal patterns in visit timestamps.
        Tags POIs with seasonal metadata based on historical visit data.
        
        This method:
        1. Iterates over all POIs
        2. Groups interactions by season
        3. Determines peak season
        4. Saves to SeasonalMetadata
        """
        all_pois = POI.objects.all()
        
        for poi in all_pois:
            # Get all interactions for this POI
            interactions = Interaction.objects.filter(poi=poi)
            
            if not interactions.exists():
                continue
            
            # Count interactions by season
            season_counts = {
                'SPRING': 0,
                'SUMMER': 0,
                'FALL': 0,
                'WINTER': 0,
            }
            
            for interaction in interactions:
                month = interaction.timestamp.month
                # Determine season from month
                if month in [3, 4, 5]:
                    season = 'SPRING'
                elif month in [6, 7, 8]:
                    season = 'SUMMER'
                elif month in [9, 10, 11]:
                    season = 'FALL'
                else:
                    season = 'WINTER'
                
                season_counts[season] += 1
            
            # Determine peak season
            peak_season = max(season_counts, key=season_counts.get)
            
            # Create or update metadata
            SeasonalMetadata.objects.update_or_create(
                poi=poi,
                defaults={
                    'peak_season': peak_season,
                    'visit_count_spring': season_counts['SPRING'],
                    'visit_count_summer': season_counts['SUMMER'],
                    'visit_count_fall': season_counts['FALL'],
                    'visit_count_winter': season_counts['WINTER'],
                }
            )
        
        print(f"Analyzed seasonal trends for {all_pois.count()} POIs")
    
    def blacklist_place(self, poi_id: str, reason: str = "Negative feedback spike", duration_hours: int = 24) -> None:
        """
        Temporarily removes a POI from recommendations due to negative feedback.
        
        Args:
            poi_id: UUID string of the POI to blacklist
            reason: Reason for blacklisting
            duration_hours: How long to keep the POI blacklisted (default: 24 hours)
        """
        try:
            poi = POI.objects.get(id=poi_id)
        except POI.DoesNotExist:
            print(f"POI {poi_id} not found")
            return
        
        # Calculate expiration time
        expires_at = timezone.now() + timedelta(hours=duration_hours)
        
        # Create or update blacklist entry
        BlacklistedPOI.objects.update_or_create(
            poi=poi,
            defaults={
                'reason': reason,
                'expires_at': expires_at
            }
        )
        
        print(f"POI {poi.name} blacklisted until {expires_at}")
    
    def cleanup_expired_blacklist(self) -> int:
        """
        Removes expired blacklist entries.
        Should be run periodically (e.g., via Celery task).
        
        Returns:
            int: Number of expired entries removed
        """
        expired_count, _ = BlacklistedPOI.objects.filter(
            expires_at__lte=timezone.now()
        ).delete()
        
        print(f"Cleaned up {expired_count} expired blacklist entries")
        return expired_count
    
    # Helper methods
    def _get_bbox_polygon(self, bounds: dict) -> str:
        """
        Convert geohash bounds to Django GIS polygon for spatial queries.
        
        Args:
            bounds: Dictionary with 'nE' and 'sW' keys from geohash2.expand()
            
        Returns:
            str: WKT representation of the bounding box polygon
        """
        # bounds format: {'nE': (lat, lon), 'sW': (lat, lon)}
        ne = bounds['nE']  # (lat, lon)
        sw = bounds['sW']  # (lat, lon)
        
        # Create polygon from bounds (longitude, latitude order for PostGIS)
        polygon_wkt = (
            f"POLYGON(("
            f"{sw[1]} {sw[0]}, "  # southwest corner
            f"{ne[1]} {sw[0]}, "  # southeast corner
            f"{ne[1]} {ne[0]}, "  # northeast corner
            f"{sw[1]} {ne[0]}, "  # northwest corner
            f"{sw[1]} {sw[0]}"    # close polygon
            f"))"
        )
        
        return polygon_wkt
    
    def get_negative_feedback_count(self, poi_id: str, hours: int = 24) -> int:
        """
        Helper method to count negative feedback (low ratings) in recent time period.
        
        Args:
            poi_id: UUID string of the POI
            hours: Time window in hours to check
            
        Returns:
            int: Count of negative reviews
        """
        since = timezone.now() - timedelta(hours=hours)
        
        negative_reviews = Review.objects.filter(
            poi_id=poi_id,
            rating__lt=3.0,  # Ratings below 3.0 are considered negative
            created_at__gte=since
        ).count()
        
        return negative_reviews
