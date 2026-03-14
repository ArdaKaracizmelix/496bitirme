"""
Test fixtures and factories for generating test data.

This module provides reusable test data generators and fixtures
to support consistent and maintainable integration tests.
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.gis.geos import Point
from django.utils import timezone

from user.models import UserProfile
from locations.models import POI
from trips.models import Itinerary, ItineraryItem
from community.models import SocialPost
from recommendations.models import Interaction, Review, InteractionType

User = get_user_model()


class UserFactory:
    """Factory for creating test users and profiles."""
    
    _counter = 0
    
    @classmethod
    def create_user(cls, username=None, email=None, password='testpass123'):
        """Create a test user with optional profile."""
        if username is None:
            cls._counter += 1
            username = f'testuser{cls._counter}'
        
        if email is None:
            email = f'{username}@test.com'
        
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password
        )
        
        # Create associated profile
        profile = UserProfile.objects.create(user=user)
        
        return user, profile
    
    @classmethod
    def create_users(cls, count=3):
        """Create multiple test users."""
        return [cls.create_user() for _ in range(count)]
    
    @classmethod
    def create_with_followers(cls, follower_count=3):
        """Create a user with followers."""
        user, profile = cls.create_user()
        
        followers = []
        for _ in range(follower_count):
            follower_user, follower_profile = cls.create_user()
            follower_profile.follow(profile)
            followers.append(follower_profile)
        
        return user, profile, followers


class POIFactory:
    """Factory for creating test Points of Interest."""
    
    # Real locations for testing
    LOCATIONS = [
        {
            'name': 'Eiffel Tower',
            'address': '5 Avenue Anatole France, 75007 Paris',
            'location': Point(2.2945, 48.8584),
            'category': POI.Category.HISTORICAL,
            'rating': 4.5,
            'tags': ['historic', 'paris', 'iconic']
        },
        {
            'name': 'Louvre Museum',
            'address': 'Rue de Rivoli, 75004 Paris',
            'location': Point(2.3355, 48.8606),
            'category': POI.Category.HISTORICAL,
            'rating': 4.7,
            'tags': ['museum', 'art', 'paris']
        },
        {
            'name': 'Notre-Dame Cathedral',
            'address': '6 Parvis Notre-Dame, 75004 Paris',
            'location': Point(2.3522, 48.8530),
            'category': POI.Category.HISTORICAL,
            'rating': 4.6,
            'tags': ['historic', 'cathedral', 'paris']
        },
        {
            'name': 'Central Park',
            'address': 'Central Park, New York, NY',
            'location': Point(-73.9680, 40.7829),
            'category': POI.Category.NATURE,
            'rating': 4.7,
            'tags': ['park', 'nature', 'new york']
        },
        {
            'name': 'Statue of Liberty',
            'address': 'Liberty Island, New York, NY',
            'location': Point(-74.0445, 40.6892),
            'category': POI.Category.HISTORICAL,
            'rating': 4.6,
            'tags': ['iconic', 'new york', 'monument']
        },
    ]
    
    _counter = 0
    
    @classmethod
    def create_poi(
        cls,
        name=None,
        address=None,
        location=None,
        category=POI.Category.HISTORICAL,
        rating=4.0,
        tags=None
    ):
        """Create a test POI."""
        if tags is None:
            tags = []
        
        if name is None:
            cls._counter += 1
            name = f'POI {cls._counter}'
        
        if address is None:
            address = f'Address for {name}'
        
        if location is None:
            location = Point(-74.0 + (cls._counter * 0.01), 40.7 + (cls._counter * 0.01))
        
        return POI.objects.create(
            name=name,
            address=address,
            location=location,
            category=category,
            average_rating=rating,
            tags=tags
        )
    
    @classmethod
    def create_from_template(cls, index=0):
        """Create a POI from the predefined locations."""
        template = cls.LOCATIONS[index % len(cls.LOCATIONS)]
        return POI.objects.create(
            name=template['name'],
            address=template['address'],
            location=template['location'],
            category=template['category'],
            average_rating=template['rating'],
            tags=template['tags']
        )
    
    @classmethod
    def create_pois(cls, count=3):
        """Create multiple POIs."""
        return [cls.create_from_template(i) for i in range(count)]
    
    @classmethod
    def create_nearby_pois(cls, center_location, count=5, radius_km=1):
        """Create POIs near a center location."""
        pois = []
        for i in range(count):
            # Distribute POIs in a circle around the center
            import math
            angle = (2 * math.pi * i) / count
            offset = 0.01 * radius_km
            
            lat = center_location.y + (offset * math.sin(angle))
            lon = center_location.x + (offset * math.cos(angle))
            
            poi = cls.create_poi(
                name=f'Nearby POI {i+1}',
                location=Point(lon, lat)
            )
            pois.append(poi)
        
        return pois


class ItineraryFactory:
    """Factory for creating test itineraries."""
    
    _counter = 0
    
    @classmethod
    def create_itinerary(
        cls,
        user=None,
        title=None,
        start_date=None,
        end_date=None,
        status=Itinerary.Status.DRAFT,
        visibility=Itinerary.Visibility.PRIVATE,
        estimated_cost=Decimal('0.00')
    ):
        """Create a test itinerary."""
        if user is None:
            user, _ = UserFactory.create_user()
        
        if title is None:
            cls._counter += 1
            title = f'Test Trip {cls._counter}'
        
        if start_date is None:
            start_date = timezone.now() + timedelta(days=7)
        
        if end_date is None:
            end_date = start_date + timedelta(days=3)
        
        return Itinerary.objects.create(
            user=user,
            title=title,
            start_date=start_date,
            end_date=end_date,
            status=status,
            visibility=visibility,
            estimated_cost=estimated_cost
        )
    
    @classmethod
    def create_with_items(cls, poi_count=3, user=None):
        """Create an itinerary with POI items."""
        itinerary = cls.create_itinerary(user=user)
        
        pois = POIFactory.create_pois(poi_count)
        
        for i, poi in enumerate(pois):
            day = (i // 2) + 1
            order = (i % 2) + 1
            
            ItineraryItem.objects.create(
                itinerary=itinerary,
                poi=poi,
                day_number=day,
                order=order
            )
        
        return itinerary


class SocialPostFactory:
    """Factory for creating test social posts."""
    
    _counter = 0
    
    @classmethod
    def create_post(
        cls,
        user=None,
        content=None,
        visibility='PUBLIC',
        tags=None
    ):
        """Create a test social post."""
        if tags is None:
            tags = []
        
        if user is None:
            user, _ = UserFactory.create_user()
        elif isinstance(user, tuple):
            # If user is a tuple from factory, extract the user
            user = user[0]
        
        if content is None:
            cls._counter += 1
            content = f'Test post {cls._counter}'
        
        return SocialPost.objects.create(
            user_ref_id=user.id,
            content=content,
            visibility=visibility,
            tags=tags
        )
    
    @classmethod
    def create_posts(cls, count=3, user=None):
        """Create multiple posts."""
        return [cls.create_post(user=user) for _ in range(count)]


class InteractionFactory:
    """Factory for creating test interactions."""
    
    _counter = 0
    
    @classmethod
    def create_interaction(
        cls,
        user=None,
        poi=None,
        interaction_type=InteractionType.VIEW
    ):
        """Create a test interaction."""
        if user is None:
            user, _ = UserFactory.create_user()
        elif isinstance(user, tuple):
            user = user[0]
        
        if poi is None:
            poi = POIFactory.create_poi()
        
        return Interaction.objects.create(
            user=user,
            poi=poi,
            interaction_type=interaction_type
        )
    
    @classmethod
    def create_interaction_sequence(cls, user=None, poi_count=3):
        """Create a sequence of interactions for a user."""
        if user is None:
            user, _ = UserFactory.create_user()
        elif isinstance(user, tuple):
            user = user[0]
        
        interaction_types = [
            InteractionType.VIEW,
            InteractionType.CLICK,
            InteractionType.BOOKMARK,
        ]
        
        pois = POIFactory.create_pois(poi_count)
        interactions = []
        
        for i, poi in enumerate(pois):
            interaction_type = interaction_types[i % len(interaction_types)]
            interaction = cls.create_interaction(
                user=user,
                poi=poi,
                interaction_type=interaction_type
            )
            interactions.append(interaction)
        
        return interactions


class ReviewFactory:
    """Factory for creating test reviews."""
    
    _counter = 0
    
    @classmethod
    def create_review(
        cls,
        user=None,
        poi=None,
        rating=5,
        text=None
    ):
        """Create a test review."""
        if user is None:
            user, _ = UserFactory.create_user()
        elif isinstance(user, tuple):
            user = user[0]
        
        if poi is None:
            poi = POIFactory.create_poi()
        
        if text is None:
            cls._counter += 1
            text = f'Great place! Review {cls._counter}'
        
        return Review.objects.create(
            user=user,
            poi=poi,
            rating=rating,
            text=text
        )
    
    @classmethod
    def create_reviews(cls, count=3, user=None, poi=None):
        """Create multiple reviews for a POI."""
        if poi is None:
            poi = POIFactory.create_poi()
        
        reviews = []
        for i in range(count):
            if user is None:
                test_user, _ = UserFactory.create_user()
            else:
                test_user = user
            
            rating = 3 + (i % 3)  # Ratings 3-5
            review = cls.create_review(
                user=test_user,
                poi=poi,
                rating=rating,
                text=f'Review {i+1} for {poi.name}'
            )
            reviews.append(review)
        
        return reviews


class ScenarioFactory:
    """Factory for creating complex test scenarios."""
    
    @staticmethod
    def create_social_network(user_count=5, follow_percentage=0.6):
        """
        Create a network of users with follow relationships.
        
        Args:
            user_count: Number of users to create
            follow_percentage: Probability that one user follows another
        
        Returns:
            List of user tuples
        """
        import random
        
        users = [UserFactory.create_user() for _ in range(user_count)]
        
        # Create random follow relationships
        for i, (user1, profile1) in enumerate(users):
            for j, (user2, profile2) in enumerate(users):
                if i != j and random.random() < follow_percentage:
                    profile1.follow(profile2)
        
        return users
    
    @staticmethod
    def create_trip_scenario():
        """Create a complete trip planning scenario."""
        user, profile = UserFactory.create_user()
        
        # Create itinerary
        itinerary = ItineraryFactory.create_itinerary(user=user)
        
        # Create and add POIs
        pois = POIFactory.create_pois(5)
        
        for i, poi in enumerate(pois):
            ItineraryItem.objects.create(
                itinerary=itinerary,
                poi=poi,
                day_number=(i // 2) + 1,
                order=(i % 2) + 1,
                notes=f'Visit {poi.name}'
            )
        
        return user, profile, itinerary
    
    @staticmethod
    def create_community_scenario():
        """Create a community activity scenario."""
        # Create users
        user1, profile1 = UserFactory.create_user()
        user2, profile2 = UserFactory.create_user()
        user3, profile3 = UserFactory.create_user()
        
        # Create follow relationships
        profile2.follow(profile1)
        profile3.follow(profile1)
        
        # Create posts
        post1 = SocialPostFactory.create_post(user=user1, content="Check out Paris!")
        post2 = SocialPostFactory.create_post(user=user1, content="Amazing trip!")
        
        # Add interactions
        post1.toggle_like(user2.id)
        post1.toggle_like(user3.id)
        post1.add_comment(user2.id, "Looks awesome!")
        
        post2.toggle_like(user3.id)
        
        return [
            (user1, profile1),
            (user2, profile2),
            (user3, profile3),
        ], [post1, post2]
    
    @staticmethod
    def create_recommendation_scenario():
        """Create a scenario for testing recommendations."""
        user, profile = UserFactory.create_user()
        
        # Create POIs with different categories
        pois = {
            'historical': POIFactory.create_poi(category=POI.Category.HISTORICAL),
            'nature': POIFactory.create_poi(category=POI.Category.NATURE),
            'food': POIFactory.create_poi(category=POI.Category.FOOD),
            'entertainment': POIFactory.create_poi(category=POI.Category.ENTERTAINMENT),
        }
        
        # Create interaction history
        interactions = []
        for poi in pois.values():
            interaction = InteractionFactory.create_interaction(
                user=user,
                poi=poi,
                interaction_type=InteractionType.VIEW
            )
            interactions.append(interaction)
        
        # Create reviews
        reviews = []
        for poi in list(pois.values())[:2]:
            review = ReviewFactory.create_review(user=user, poi=poi, rating=5)
            reviews.append(review)
        
        return user, profile, pois, interactions, reviews
