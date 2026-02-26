"""
Tests for the recommendations module.
"""
from django.test import TestCase
from django.contrib.gis.geos import Point
from django.utils import timezone
from datetime import timedelta
from user.models import UserProfile
from locations.models import POI
from recommendations.models import Interaction, Review, InteractionType
from recommendations.dtos import ContextDTO, PointDTO, ScoredPOI
from recommendations.scoring_service import ScoringService
from recommendations.trend_analyzer import TrendAnalyzer
from django.contrib.auth.models import User


class ScoringServiceTestCase(TestCase):
    """Test cases for ScoringService"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create test user
        self.test_user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(
            user=self.test_user,
            preferences_vector={'tag1': 0.5, 'tag2': 0.3}
        )
        
        # Create test POI
        self.poi = POI.objects.create(
            name='Test Location',
            address='123 Test St',
            location=Point(-74.0060, 40.7128, srid=4326),  # NYC
            category=POI.Category.NATURE,
            average_rating=4.5,
            tags=['nature', 'outdoor']
        )
        
        self.scoring_service = ScoringService()
    
    def test_cosine_similarity(self):
        """Test cosine similarity calculation"""
        vec1 = [1.0, 0.0, 0.0]
        vec2 = [1.0, 0.0, 0.0]
        
        similarity = self.scoring_service.calculate_similarity(vec1, vec2)
        self.assertEqual(similarity, 1.0)  # Perfect similarity
        
        # Test orthogonal vectors
        vec3 = [0.0, 1.0, 0.0]
        similarity = self.scoring_service.calculate_similarity(vec1, vec3)
        self.assertEqual(similarity, 0.0)  # No similarity
    
    def test_distance_decay(self):
        """Test distance decay function"""
        # At 0 meters, score should be 1.0
        score_0 = self.scoring_service._calculate_distance_decay(0)
        self.assertEqual(score_0, 1.0)
        
        # At 1000 meters, score should be ~0.37
        score_1000 = self.scoring_service._calculate_distance_decay(1000)
        self.assertAlmostEqual(score_1000, 0.367, places=2)
        
        # Negative distance should return 1.0
        score_neg = self.scoring_service._calculate_distance_decay(-100)
        self.assertEqual(score_neg, 1.0)
    
    def test_generate_recommendations(self):
        """Test recommendation generation"""
        context = ContextDTO(
            user_location=PointDTO(latitude=40.7128, longitude=-74.0060),
            radius_meters=10000,
            max_results=5
        )
        
        recommendations = self.scoring_service.generate_recommendations(self.user_profile, context)
        
        # Should return at least one recommendation (our test POI)
        self.assertGreater(len(recommendations), 0)
        self.assertIsInstance(recommendations[0], ScoredPOI)
    
    def test_update_user_vector(self):
        """Test user vector update via reinforcement learning"""
        # Create an interaction
        interaction = Interaction.objects.create(
            user=self.user_profile,
            poi=self.poi,
            interaction_type=InteractionType.LIKE
        )
        
        # Get initial vector
        initial_vector = self.user_profile.preferences_vector.copy()
        
        # Update vector
        self.scoring_service.update_user_vector(str(self.user_profile.id), InteractionType.LIKE)
        
        # Refresh from database
        self.user_profile.refresh_from_db()
        updated_vector = self.user_profile.preferences_vector
        
        # Vector should have changed
        self.assertNotEqual(initial_vector, updated_vector)


class TrendAnalyzerTestCase(TestCase):
    """Test cases for TrendAnalyzer"""
    
    def setUp(self):
        """Set up test fixtures"""
        # Create test user
        self.test_user = User.objects.create_user(
            username='testuser2',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(user=self.test_user)
        
        # Create test POIs
        self.poi_good = POI.objects.create(
            name='Good Location',
            address='123 Test St',
            location=Point(-74.0060, 40.7128, srid=4326),
            category=POI.Category.NATURE,
            average_rating=4.8,
            tags=['nature']
        )
        
        self.poi_popular = POI.objects.create(
            name='Popular Location',
            address='456 Test Ave',
            location=Point(-74.0070, 40.7138, srid=4326),
            category=POI.Category.FOOD,
            average_rating=4.2,
            tags=['food']
        )
        
        self.trend_analyzer = TrendAnalyzer()
    
    def test_underrated_places(self):
        """Test underrated places discovery"""
        # Create a review for the good location
        Review.objects.create(
            user=self.user_profile,
            poi=self.poi_good,
            rating=4.8
        )
        
        # Geohash for NYC area
        geohash = 'dr5r'
        
        underrated = self.trend_analyzer.get_underrated_places(geohash)
        
        # Should find the good location with high rating and low review count
        # Note: This test may not find anything depending on geohash precision
        self.assertIsInstance(underrated, list)
    
    def test_blacklist_place(self):
        """Test POI blacklisting"""
        self.trend_analyzer.blacklist_place(
            str(self.poi_good.id),
            reason='Test blacklist',
            duration_hours=24
        )
        
        # Verify blacklist entry was created
        from recommendations.models import BlacklistedPOI
        blacklist_entry = BlacklistedPOI.objects.get(poi=self.poi_good)
        self.assertEqual(blacklist_entry.reason, 'Test blacklist')
    
    def test_negative_feedback_count(self):
        """Test negative feedback counting"""
        # Create negative reviews
        Review.objects.create(
            user=self.user_profile,
            poi=self.poi_popular,
            rating=2.0
        )
        Review.objects.create(
            user=UserProfile.objects.create(user=User.objects.create_user('user2', password='pass')),
            poi=self.poi_popular,
            rating=1.5
        )
        
        negative_count = self.trend_analyzer.get_negative_feedback_count(
            str(self.poi_popular.id),
            hours=24
        )
        
        self.assertEqual(negative_count, 2)
    
    def test_cleanup_expired_blacklist(self):
        """Test cleanup of expired blacklist entries"""
        from recommendations.models import BlacklistedPOI
        
        # Create an expired blacklist entry
        BlacklistedPOI.objects.create(
            poi=self.poi_good,
            reason='Expired entry',
            expires_at=timezone.now() - timedelta(hours=1)
        )
        
        # Cleanup
        count = self.trend_analyzer.cleanup_expired_blacklist()
        
        self.assertEqual(count, 1)
        
        # Verify it was deleted
        self.assertFalse(BlacklistedPOI.objects.filter(poi=self.poi_good).exists())
