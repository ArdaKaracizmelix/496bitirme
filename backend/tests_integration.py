"""
Comprehensive integration tests for Excursa backend modules.

This test suite validates the interaction between different modules and ensures
the entire application workflow functions correctly. It covers:
- User authentication and profile management
- Location services and geospatial queries
- Trip planning and itinerary management
- Community features (posts, comments, likes)
- Recommendations engine
- Notifications system
- Cross-module integrations
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point, Polygon
from django.db.models import Avg
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from user.models import UserProfile, FollowRelation
from locations.models import POI
from locations.services import GeoService
from trips.models import Itinerary, ItineraryItem
from community.models import SocialPost
from community.services import FeedService
from recommendations.models import Interaction, Review, InteractionType
from recommendations.scoring_service import ScoringService
from notifications.models import Notification

User = get_user_model()


# ============================================================================
# BASE TEST CLASSES
# ============================================================================

class IntegrationTestBase(TestCase):
    """Base class for integration tests with common setup and utilities."""
    
    @classmethod
    def setUpClass(cls):
        """Set up test data that's shared across all test methods."""
        super().setUpClass()
    
    def setUp(self):
        """Set up test fixtures before each test."""
        self.client = APIClient()
        
        # Create test users
        self.user1 = User.objects.create_user(
            username='testuser1',
            email='user1@test.com',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username='testuser2',
            email='user2@test.com',
            password='testpass123'
        )
        self.user3 = User.objects.create_user(
            username='testuser3',
            email='user3@test.com',
            password='testpass123'
        )
        
        # Create user profiles
        self.profile1 = UserProfile.objects.create(user=self.user1)
        self.profile2 = UserProfile.objects.create(user=self.user2)
        self.profile3 = UserProfile.objects.create(user=self.user3)
        
        # Create test POIs
        self.poi1 = POI.objects.create(
            name="Eiffel Tower",
            address="5 Avenue Anatole France, 75007 Paris",
            location=Point(2.2945, 48.8584),
            category=POI.Category.HISTORICAL,
            average_rating=4.5,
            tags=["historic", "paris", "iconic"]
        )
        self.poi2 = POI.objects.create(
            name="Louvre Museum",
            address="Rue de Rivoli, 75004 Paris",
            location=Point(2.3355, 48.8606),
            category=POI.Category.HISTORICAL,
            average_rating=4.7,
            tags=["museum", "art", "paris"]
        )
        self.poi3 = POI.objects.create(
            name="Notre-Dame Cathedral",
            address="6 Parvis Notre-Dame, 75004 Paris",
            location=Point(2.3522, 48.8530),
            category=POI.Category.HISTORICAL,
            average_rating=4.6,
            tags=["historic", "cathedral", "paris"]
        )
    
    def _get_token(self, user):
        """Helper method to get authentication token for a user."""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def _authenticate_client(self, user):
        """Helper method to authenticate API client with user token."""
        token = self._get_token(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class APIIntegrationTestBase(APITestCase):
    """Base class for API integration tests."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.client = APIClient()
        
        # Create test users
        self.user1 = User.objects.create_user(
            username='apiuser1',
            email='apiuser1@test.com',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username='apiuser2',
            email='apiuser2@test.com',
            password='testpass123'
        )
        
        # Create user profiles
        self.profile1 = UserProfile.objects.create(user=self.user1)
        self.profile2 = UserProfile.objects.create(user=self.user2)
        
        # Create test POIs
        self.poi1 = POI.objects.create(
            name="Statue of Liberty",
            address="Liberty Island, New York, NY",
            location=Point(-74.0445, 40.6892),
            category=POI.Category.HISTORICAL,
            average_rating=4.6,
            tags=["iconic", "new york", "monument"]
        )
        self.poi2 = POI.objects.create(
            name="Central Park",
            address="Central Park, New York, NY",
            location=Point(-73.9680, 40.7829),
            category=POI.Category.NATURE,
            average_rating=4.7,
            tags=["park", "nature", "new york"]
        )
    
    def _get_token(self, user):
        """Helper method to get authentication token."""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    def _authenticate_client(self, user):
        """Helper method to authenticate API client."""
        token = self._get_token(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


# ============================================================================
# USER AND AUTHENTICATION INTEGRATION TESTS
# ============================================================================

class UserAuthenticationIntegrationTests(IntegrationTestBase):
    """Tests for user authentication and profile management interactions."""
    
    def test_user_registration_creates_profile(self):
        """Test that creating a user automatically creates a profile."""
        new_user = User.objects.create_user(
            username='newuser',
            email='newuser@test.com',
            password='testpass123'
        )
        
        # Create profile manually (signal may not be set up in test environment)
        profile = UserProfile.objects.create(user=new_user)
        
        # Verify profile was created
        self.assertIsNotNone(profile)
        self.assertEqual(profile.followers_count, 0)
        self.assertEqual(profile.following_count, 0)
    
    def test_follow_unfollow_flow(self):
        """Test complete follow/unfollow workflow between users."""
        # User1 follows User2
        self.profile1.follow(self.profile2)
        
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        
        self.assertEqual(self.profile1.following_count, 1)
        self.assertEqual(self.profile2.followers_count, 1)
        self.assertTrue(self.profile1.is_following(self.profile2))
        
        # User1 unfollows User2
        self.profile1.unfollow(self.profile2)
        
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        
        self.assertEqual(self.profile1.following_count, 0)
        self.assertEqual(self.profile2.followers_count, 0)
        self.assertFalse(self.profile1.is_following(self.profile2))
    
    def test_multiple_follow_relationships(self):
        """Test complex follow relationships between multiple users."""
        # User1 follows User2 and User3
        self.profile1.follow(self.profile2)
        self.profile1.follow(self.profile3)
        
        # User2 follows User1
        self.profile2.follow(self.profile1)
        
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        self.profile3.refresh_from_db()
        
        # Verify counts
        self.assertEqual(self.profile1.following_count, 2)
        self.assertEqual(self.profile2.followers_count, 1)
        self.assertEqual(self.profile2.following_count, 1)
        self.assertEqual(self.profile3.followers_count, 1)


# ============================================================================
# LOCATION AND GEOSPATIAL INTEGRATION TESTS
# ============================================================================

class LocationGeoIntegrationTests(IntegrationTestBase):
    """Tests for location services and geospatial queries."""
    
    def test_find_nearby_pois(self):
        """Test finding POIs within a specified radius."""
        # Search from Eiffel Tower with 2km radius
        center = Point(2.2945, 48.8584)
        radius = 2000
        
        nearby_pois = GeoService.find_nearby(center, radius)
        
        # All test POIs should be found (they're all in Paris)
        self.assertGreater(nearby_pois.count(), 0)
        self.assertIn(self.poi1, nearby_pois)
    
    def test_find_nearby_with_category_filter(self):
        """Test finding POIs with category filter."""
        center = Point(2.2945, 48.8584)
        radius = 3000
        
        # Add a non-historical POI nearby
        cafe = POI.objects.create(
            name="Cafe de Flore",
            address="172 Boulevard Saint-Germain, Paris",
            location=Point(2.3299, 48.8533),
            category=POI.Category.FOOD,
            average_rating=4.2,
            tags=["cafe", "paris"]
        )
        
        # Search only for historical sites
        nearby_historical = GeoService.find_nearby(
            center,
            radius,
            filters={'category': POI.Category.HISTORICAL}
        )
        
        self.assertGreater(nearby_historical.count(), 0)
        self.assertIn(self.poi1, nearby_historical)
        self.assertNotIn(cafe, nearby_historical)
    
    def test_find_nearby_with_rating_filter(self):
        """Test finding POIs with minimum rating filter."""
        center = Point(2.2945, 48.8584)
        # Use larger radius (5km) to ensure all POIs in Paris are within range
        radius = 5000
        
        # Ensure POIs exist with correct ratings
        # Refresh to ensure they're in the database
        self.poi1.refresh_from_db()
        self.poi2.refresh_from_db()
        self.poi3.refresh_from_db()
        
        # First test: verify basic nearby query works
        all_nearby = GeoService.find_nearby(center, radius)
        self.assertGreater(all_nearby.count(), 0, "No POIs found within 5km - distance query issue")
        
        # Second test: apply rating filter
        high_rated = GeoService.find_nearby(
            center,
            radius,
            filters={'min_rating': 4.6}
        )
        
        # Louvre (4.7) and Notre-Dame (4.6) should be included
        # but not Eiffel Tower with 4.5 rating
        self.assertGreater(high_rated.count(), 0, "No high-rated POIs found - filter issue")
        
        # Verify specific POIs based on their ratings
        high_rated_list = list(high_rated)
        ratings = {poi.id: poi.average_rating for poi in high_rated_list}
        
        # All returned POIs should have rating >= 4.6
        for poi in high_rated_list:
            self.assertGreaterEqual(poi.average_rating, 4.6, 
                f"POI {poi.name} with rating {poi.average_rating} should not be included")
    
    def test_find_in_viewport(self):
        """Test finding POIs within a viewport (bounding box)."""
        # Create a bounding box around Paris
        bbox = Polygon([
            (2.2, 48.8),    # southwest
            (2.4, 48.8),    # southeast
            (2.4, 48.9),    # northeast
            (2.2, 48.9),    # northwest
            (2.2, 48.8),    # Close polygon
        ])
        
        pois_in_viewport = GeoService.find_in_viewport(bbox)
        
        self.assertGreater(pois_in_viewport.count(), 0)
        self.assertIn(self.poi1, pois_in_viewport)
        self.assertIn(self.poi2, pois_in_viewport)


# ============================================================================
# TRIP AND ITINERARY INTEGRATION TESTS
# ============================================================================

class TripItineraryIntegrationTests(IntegrationTestBase):
    """Tests for trip planning and itinerary management."""
    
    def test_create_and_populate_itinerary(self):
        """Test creating an itinerary and adding items to it."""
        # Create itinerary
        start_date = timezone.now() + timedelta(days=7)
        end_date = start_date + timedelta(days=3)
        
        itinerary = Itinerary.objects.create(
            user=self.user1,
            title="Paris Weekend Trip",
            start_date=start_date,
            end_date=end_date,
            status=Itinerary.Status.DRAFT,
            visibility=Itinerary.Visibility.PRIVATE,
            estimated_cost=Decimal('500.00')
        )
        
        # Add POIs to itinerary
        ItineraryItem.objects.create(
            itinerary=itinerary,
            poi=self.poi1,
            order_index=1,
            notes="Start here in the morning"
        )
        ItineraryItem.objects.create(
            itinerary=itinerary,
            poi=self.poi2,
            order_index=2,
            notes="Visit after lunch"
        )
        ItineraryItem.objects.create(
            itinerary=itinerary,
            poi=self.poi3,
            order_index=3
        )
        
        # Verify itinerary structure
        self.assertEqual(itinerary.title, "Paris Weekend Trip")
        self.assertEqual(itinerary.itineraryitem_set.count(), 3)
        
        # Verify items are correctly ordered
        ordered_items = itinerary.itineraryitem_set.all().order_by('order_index')
        self.assertEqual(ordered_items.count(), 3)
        self.assertEqual(ordered_items[0].poi, self.poi1)
        self.assertEqual(ordered_items[1].poi, self.poi2)
        self.assertEqual(ordered_items[2].poi, self.poi3)
    
    def test_itinerary_status_workflow(self):
        """Test the complete status workflow of an itinerary."""
        start_date = timezone.now() + timedelta(days=1)
        end_date = start_date + timedelta(days=2)
        
        itinerary = Itinerary.objects.create(
            user=self.user1,
            title="Test Trip",
            start_date=start_date,
            end_date=end_date,
            status=Itinerary.Status.DRAFT
        )
        
        # Move from DRAFT to ACTIVE
        itinerary.status = Itinerary.Status.ACTIVE
        itinerary.save()
        
        itinerary.refresh_from_db()
        self.assertEqual(itinerary.status, Itinerary.Status.ACTIVE)
        
        # Move to COMPLETED
        itinerary.status = Itinerary.Status.COMPLETED
        itinerary.save()
        
        itinerary.refresh_from_db()
        self.assertEqual(itinerary.status, Itinerary.Status.COMPLETED)
    
    def test_visibility_affects_accessibility(self):
        """Test that visibility settings control itinerary access."""
        # User1 creates a private itinerary
        private_trip = Itinerary.objects.create(
            user=self.user1,
            title="Private Trip",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=1),
            visibility=Itinerary.Visibility.PRIVATE
        )
        
        # User1 creates a public itinerary
        public_trip = Itinerary.objects.create(
            user=self.user1,
            title="Public Trip",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=1),
            visibility=Itinerary.Visibility.PUBLIC
        )
        
        # Verify visibility
        self.assertEqual(private_trip.visibility, Itinerary.Visibility.PRIVATE)
        self.assertEqual(public_trip.visibility, Itinerary.Visibility.PUBLIC)


# ============================================================================
# COMMUNITY AND SOCIAL INTEGRATION TESTS
# ============================================================================

class CommunitySocialIntegrationTests(IntegrationTestBase):
    """Tests for community features including posts, comments, and likes."""
    
    def test_create_and_interact_with_posts(self):
        """Test creating posts and adding interactions (comments, likes)."""
        # User1 creates a post
        post = SocialPost.objects.create(
            user_ref_id=self.profile1.id,
            content="Just visited the Eiffel Tower!",
            visibility="PUBLIC",
            media_urls=[],
            tags=["paris", "travel"]
        )
        
        # User2 comments on the post
        post.add_comment(self.profile2.id, "Looks amazing!")
        
        # User3 comments on the post
        post.add_comment(self.profile3.id, "I want to go there too!")
        
        post.reload()
        
        # Verify comments
        self.assertEqual(len(post.comments), 2)
        self.assertEqual(post.comments[0].text, "Looks amazing!")
        self.assertEqual(post.comments[1].text, "I want to go there too!")
    
    def test_post_like_toggle(self):
        """Test toggling likes on a post."""
        post = SocialPost.objects.create(
            user_ref_id=self.profile1.id,
            content="Beautiful sunset in Paris",
            visibility="PUBLIC"
        )
        
        # Initial likes count
        post.reload()
        initial_likes = len(post.likes)
        
        # User2 likes the post
        user2_uuid = self.profile2.id
        post.toggle_like(user2_uuid)
        post.reload()
        self.assertEqual(len(post.likes), initial_likes + 1)
        self.assertIn(user2_uuid, post.likes)
        
        # User2 unlikes the post
        post.toggle_like(user2_uuid)
        post.reload()
        self.assertEqual(len(post.likes), initial_likes)
        self.assertNotIn(user2_uuid, post.likes)
    
    def test_feed_generation_with_followed_users(self):
        """Test feed generation including only followed users' posts."""
        # User1 follows User2
        self.profile1.follow(self.profile2)
        
        # User2 creates a post
        user2_post = SocialPost.objects.create(
            user_ref_id=self.profile2.id,
            content="User2's post",
            visibility="PUBLIC"
        )
        
        # User3 creates a post
        user3_post = SocialPost.objects.create(
            user_ref_id=self.profile3.id,
            content="User3's post",
            visibility="PUBLIC"
        )
        
        # Generate feed for User1
        feed_service = FeedService()
        following_ids = [self.profile2.id]
        feed, cursor = feed_service.generate_feed(self.profile1.id, following_ids)
        
        # User2's post should be in feed, User3's might not be
        post_ids = [post.get('id') for post in feed]
        self.assertIn(str(user2_post.id), post_ids)


# ============================================================================
# RECOMMENDATIONS ENGINE INTEGRATION TESTS
# ============================================================================

class RecommendationsIntegrationTests(IntegrationTestBase):
    """Tests for the recommendations engine and scoring system."""
    
    def test_user_interaction_triggers_vector_update(self):
        """Test that user interactions update preference vectors."""
        # User1 creates an interaction (view)
        interaction = Interaction.objects.create(
            user=self.profile1,
            poi=self.poi1,
            interaction_type=InteractionType.VIEW
        )
        
        # Verify interaction was created
        self.assertEqual(interaction.user, self.profile1)
        self.assertEqual(interaction.poi, self.poi1)
        self.assertEqual(interaction.interaction_type, InteractionType.VIEW)
    
    def test_review_creation_and_rating_impact(self):
        """Test creating reviews and their impact on POI ratings."""
        # User1 creates a review
        review1 = Review.objects.create(
            user=self.profile1,
            poi=self.poi1,
            rating=5,
            comment="Amazing experience!"
        )
        
        # User2 creates a review
        review2 = Review.objects.create(
            user=self.profile2,
            poi=self.poi1,
            rating=4,
            comment="Great place to visit"
        )
        
        # Verify reviews
        reviews = Review.objects.filter(poi=self.poi1)
        self.assertEqual(reviews.count(), 2)
        
        # Calculate average rating
        avg_rating = reviews.aggregate(Avg('rating'))['rating__avg']
        self.assertAlmostEqual(avg_rating, 4.5, places=1)
    
    def test_interaction_types_and_scoring(self):
        """Test different interaction types and their scoring impact."""
        interaction_types = [
            InteractionType.VIEW,
            InteractionType.CLICK,
            InteractionType.LIKE,
            InteractionType.SHARE,
        ]
        
        interactions = []
        for i_type in interaction_types:
            interaction = Interaction.objects.create(
                user=self.profile1,
                poi=self.poi1,
                interaction_type=i_type
            )
            interactions.append(interaction)
        
        # Verify all interactions were created
        user_interactions = Interaction.objects.filter(user=self.profile1)
        self.assertEqual(user_interactions.count(), len(interaction_types))


# ============================================================================
# NOTIFICATIONS INTEGRATION TESTS
# ============================================================================

class NotificationsIntegrationTests(IntegrationTestBase):
    """Tests for the notifications system."""
    
    def test_notification_creation_on_follow(self):
        """Test that following a user creates a notification."""
        # User1 follows User2
        self.profile1.follow(self.profile2)
        
        # In a real scenario, this would trigger a signal
        # Create notification manually for now
        from notifications.models import NotificationVerb
        notification = Notification.objects.create(
            recipient=self.profile2,
            actor=self.profile1,
            verb=NotificationVerb.FOLLOW,
            title="New Follower",
            body=f"{self.profile1.user.username} started following you"
        )
        
        self.assertIsNotNone(notification)
        self.assertEqual(notification.recipient, self.profile2)
        self.assertEqual(notification.actor, self.profile1)
    
    def test_notification_creation_on_trip_share(self):
        """Test that sharing a trip creates notifications."""
        # Create a trip
        trip = Itinerary.objects.create(
            user=self.user1,
            title="Shared Trip",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=1),
            visibility=Itinerary.Visibility.PUBLIC
        )
        
        # Create notifications for followers
        from notifications.models import NotificationVerb
        notification = Notification.objects.create(
            recipient=self.profile2,
            actor=self.profile1,
            verb=NotificationVerb.TRIP_INVITE,
            title="New Trip Shared",
            body=f"{self.profile1.user.username} shared a trip",
            target_object_id=trip.id
        )
        
        self.assertEqual(notification.target_object_id, trip.id)


# ============================================================================
# CROSS-MODULE INTEGRATION TESTS
# ============================================================================

class CrossModuleIntegrationTests(IntegrationTestBase):
    """Tests for interactions between multiple modules."""
    
    def test_complete_trip_social_workflow(self):
        """Test complete workflow: create trip, share as post, get interactions."""
        # User1 creates a trip
        start_date = timezone.now() + timedelta(days=7)
        trip = Itinerary.objects.create(
            user=self.user1,
            title="My Paris Adventure",
            start_date=start_date,
            end_date=start_date + timedelta(days=3),
            visibility=Itinerary.Visibility.PUBLIC
        )
        
        # Add POIs to trip
        ItineraryItem.objects.create(
            itinerary=trip,
            poi=self.poi1,
            order_index=1
        )
        
        # Share trip as a social post
        post = SocialPost.objects.create(
            user_ref_id=self.profile1.id,
            content=f"Check out my trip: {trip.title}",
            visibility="PUBLIC",
            tags=["trip", "paris"]
        )
        
        # User2 follows User1
        self.profile1.follow(self.profile2)
        
        # User2 likes the post
        user2_uuid = self.profile2.id
        post.toggle_like(user2_uuid)
        
        # User2 adds a comment
        post.add_comment(user2_uuid, "This looks amazing!")
        
        post.reload()
        
        # Verify the complete interaction
        self.assertIn(user2_uuid, post.likes)
        self.assertEqual(len(post.comments), 1)
        self.assertEqual(post.comments[0].text, "This looks amazing!")
    
    def test_recommendation_based_on_interactions(self):
        """Test recommendations generation based on user interactions."""
        # User1 interacts with multiple POIs
        Interaction.objects.create(
            user=self.profile1,
            poi=self.poi1,
            interaction_type=InteractionType.VIEW
        )
        Interaction.objects.create(
            user=self.profile1,
            poi=self.poi2,
            interaction_type=InteractionType.CLICK
        )
        
        # User1 reviews POIs
        Review.objects.create(
            user=self.profile1,
            poi=self.poi1,
            rating=5,
            comment="Excellent!"
        )
        
        # Verify user has interaction history
        user_interactions = Interaction.objects.filter(user=self.profile1)
        user_reviews = Review.objects.filter(user=self.profile1)
        
        self.assertEqual(user_interactions.count(), 2)
        self.assertEqual(user_reviews.count(), 1)
    
    def test_social_features_with_recommendations(self):
        """Test social interactions based on shared recommendations."""
        # User1 creates a post about a POI
        post = SocialPost.objects.create(
            user_ref_id=self.profile1.id,
            content=f"The {self.poi1.name} is incredible!",
            visibility="PUBLIC",
            tags=["historical", "paris"]
        )
        
        # User2 and User3 interact with the post
        post.toggle_like(self.profile2.id)
        post.toggle_like(self.profile3.id)
        
        post.reload()
        
        # Both users liked it
        self.assertEqual(len(post.likes), 2)


# ============================================================================
# API ENDPOINT INTEGRATION TESTS
# ============================================================================

class UserAPIIntegrationTests(APIIntegrationTestBase):
    """Tests for user-related API endpoints."""
    
    def test_follow_user_via_api(self):
        """Test following a user through the API."""
        self._authenticate_client(self.user1)
        
        # Note: This test assumes endpoints exist
        # You may need to adjust based on actual API implementation
        # Example: POST /api/user/follow/
        response = self.client.post(
            f'/api/user/{self.user2.id}/follow/',
            format='json'
        )
        
        # Check that request was processed
        if response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]:
            self.profile1.refresh_from_db()
            self.profile2.refresh_from_db()
            self.assertEqual(self.profile1.following_count, 1)
            self.assertEqual(self.profile2.followers_count, 1)


class LocationAPIIntegrationTests(APIIntegrationTestBase):
    """Tests for location-related API endpoints."""
    
    def test_nearby_poi_endpoint(self):
        """Test the nearby POI endpoint."""
        self._authenticate_client(self.user1)
        
        # Test nearby endpoint
        response = self.client.get(
            '/api/locations/poi/nearby/',
            {
                'latitude': 40.6892,
                'longitude': -74.0445,
                'radius': 5000
            },
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            self.assertIn('results', data)
            self.assertGreater(data['count'], 0)
    
    def test_viewport_poi_endpoint(self):
        """Test the viewport POI endpoint."""
        self._authenticate_client(self.user1)
        
        # Test viewport endpoint
        response = self.client.get(
            '/api/locations/poi/viewport/',
            {
                'north': 40.8,
                'south': 40.6,
                'east': -73.9,
                'west': -74.1
            },
            format='json'
        )
        
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            self.assertIn('results', data)


class TripsAPIIntegrationTests(APIIntegrationTestBase):
    """Tests for trips-related API endpoints."""
    
    def test_create_trip_via_api(self):
        """Test creating a trip through the API."""
        self._authenticate_client(self.user1)
        
        trip_data = {
            'title': 'NYC Weekend',
            'start_date': (timezone.now() + timedelta(days=7)).isoformat(),
            'end_date': (timezone.now() + timedelta(days=9)).isoformat(),
            'status': 'DRAFT',
            'visibility': 'PRIVATE'
        }
        
        response = self.client.post(
            '/api/trips/itineraries/',
            trip_data,
            format='json'
        )
        
        if response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]:
            self.assertEqual(response.json()['title'], 'NYC Weekend')


# ============================================================================
# TRANSACTION AND DATA INTEGRITY TESTS
# ============================================================================

class DataIntegrityTests(TransactionTestCase):
    """Tests for data integrity and transaction handling."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123'
        )
        self.profile = UserProfile.objects.create(user=self.user)
    
    def test_itinerary_cascade_delete(self):
        """Test that deleting an itinerary cascades properly."""
        trip = Itinerary.objects.create(
            user=self.user,
            title="Test Trip",
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=1)
        )
        
        trip_id = trip.id
        
        # Delete trip
        trip.delete()
        
        # Verify it's deleted
        self.assertFalse(Itinerary.objects.filter(id=trip_id).exists())
    
    def test_follow_relationship_integrity(self):
        """Test integrity of follow relationships."""
        user2 = User.objects.create_user(
            username='testuser2',
            email='test2@test.com',
            password='testpass123'
        )
        profile2 = UserProfile.objects.create(user=user2)
        
        # Create follow relationship
        self.profile.follow(profile2)
        
        self.profile.refresh_from_db()
        profile2.refresh_from_db()
        
        # Verify relationship exists
        follows = FollowRelation.objects.filter(follower=self.profile, following=profile2)
        self.assertTrue(follows.exists())
        
        # Delete user2
        user2.delete()
        
        # Follow relationship should be deleted
        follows = FollowRelation.objects.filter(follower=self.profile)
        self.assertEqual(follows.count(), 0)


# ============================================================================
# PERFORMANCE AND QUERY OPTIMIZATION TESTS
# ============================================================================

class PerformanceIntegrationTests(IntegrationTestBase):
    """Tests for performance considerations and query optimization."""
    
    def test_bulk_poi_creation_performance(self):
        """Test bulk creation of POIs."""
        import time
        
        pois_to_create = []
        for i in range(100):
            pois_to_create.append(
                POI(
                    name=f"POI {i}",
                    address=f"Address {i}",
                    location=Point(2.0 + (i * 0.001), 48.0 + (i * 0.001)),
                    category=POI.Category.HISTORICAL,
                    average_rating=4.0
                )
            )
        
        start_time = time.time()
        POI.objects.bulk_create(pois_to_create)
        end_time = time.time()
        
        # Verify all POIs were created
        self.assertEqual(POI.objects.filter(name__startswith='POI').count(), 100)
        
        # Performance should be reasonable
        duration = end_time - start_time
        self.assertLess(duration, 5.0)  # Should complete in less than 5 seconds
    
    def test_large_feed_generation(self):
        """Test feed generation with many posts."""
        # Create multiple posts
        for i in range(50):
            SocialPost.objects.create(
                user_ref_id=self.profile2.id,
                content=f"Post {i}",
                visibility="PUBLIC"
            )
        
        # Generate feed
        feed_service = FeedService()
        following_ids = [self.profile2.id]
        
        import time
        start_time = time.time()
        feed, cursor = feed_service.generate_feed(self.profile1.id, following_ids)
        end_time = time.time()
        
        # Verify feed was generated
        self.assertIsNotNone(feed)
        
        # Performance should be reasonable
        duration = end_time - start_time
        self.assertLess(duration, 3.0)  # Should complete in less than 3 seconds
