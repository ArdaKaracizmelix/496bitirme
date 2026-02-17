from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from .models import UserProfile, FollowRelation

User = get_user_model()

class UserProfileTests(TestCase):
    def setUp(self):
        # Create two users for testing interactions
        self.user1 = User.objects.create_user(username='user1', password='password123')
        self.user2 = User.objects.create_user(username='user2', password='password123')
        
        # Create profiles manually (since no signal was provided in context to do it automatically)
        self.profile1 = UserProfile.objects.create(user=self.user1)
        self.profile2 = UserProfile.objects.create(user=self.user2)

    def test_follow_success(self):
        """Test that one user can successfully follow another."""
        self.profile1.follow(self.profile2)
        
        # Refresh from DB to get updated F() expression values
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        
        # Check counts
        self.assertEqual(self.profile1.following_count, 1)
        self.assertEqual(self.profile2.followers_count, 1)
        
        # Check relationship existence
        self.assertTrue(self.profile1.is_following(self.profile2))
        self.assertTrue(FollowRelation.objects.filter(follower=self.profile1, following=self.profile2).exists())

    def test_unfollow_success(self):
        """Test that one user can successfully unfollow another."""
        # Setup: profile1 follows profile2
        self.profile1.follow(self.profile2)
        
        # Action: unfollow
        self.profile1.unfollow(self.profile2)
        
        # Refresh from DB
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        
        # Check counts returned to 0
        self.assertEqual(self.profile1.following_count, 0)
        self.assertEqual(self.profile2.followers_count, 0)
        
        # Check relationship removed
        self.assertFalse(self.profile1.is_following(self.profile2))
        self.assertFalse(FollowRelation.objects.filter(follower=self.profile1, following=self.profile2).exists())

    def test_cannot_follow_self(self):
        """Test that a user cannot follow themselves."""
        self.profile1.follow(self.profile1)
        
        self.profile1.refresh_from_db()
        self.assertEqual(self.profile1.following_count, 0)

    def test_vector_updates(self):
        """Test that preference vectors are updated and retrieved correctly."""
        # Initial state should be empty
        self.assertEqual(self.profile1.get_feed_vector(), {})

        # Update with a new tag
        self.profile1.update_vector("history", 0.5)
        self.profile1.refresh_from_db()
        self.assertEqual(self.profile1.get_feed_vector(), {"history": 0.5})

        # Update existing tag (accumulate)
        self.profile1.update_vector("history", 0.3)
        self.profile1.refresh_from_db()
        
        vector = self.profile1.get_feed_vector()
        self.assertAlmostEqual(vector["history"], 0.8)

        # Add a second tag
        self.profile1.update_vector("art", 1.0)
        self.profile1.refresh_from_db()
        
        vector = self.profile1.get_feed_vector()
        self.assertAlmostEqual(vector["history"], 0.8)
        self.assertEqual(vector["art"], 1.0)

class UserAPITests(APITestCase):
    def setUp(self):
        # Create users and profiles for API testing
        self.user1 = User.objects.create_user(username='api_user1', password='password123')
        self.profile1 = UserProfile.objects.create(user=self.user1)
        
        self.user2 = User.objects.create_user(username='api_user2', password='password123')
        self.profile2 = UserProfile.objects.create(user=self.user2)
        
        # Authenticate as user1 for these tests
        self.client.force_authenticate(user=self.user1)

    def test_get_me(self):
        """Test retrieving the current user's profile via API."""
        url = reverse('me')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user1.username)

    def test_follow_endpoint(self):
        """Test the follow API endpoint."""
        url = reverse('follow', args=[self.profile2.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(self.profile1.is_following(self.profile2))

    def test_unfollow_endpoint(self):
        """Test the unfollow API endpoint."""
        # Ensure we are following first
        self.profile1.follow(self.profile2)
        
        url = reverse('unfollow', args=[self.profile2.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.profile1.is_following(self.profile2))
        self.assertFalse(self.profile1.is_following(self.profile1))

    def test_cannot_follow_already_followed(self):
        """Test that following the same user twice does not increment count or create duplicate relations."""
        self.profile1.follow(self.profile2)
        self.profile1.follow(self.profile2) # Attempt to follow again
        
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        
        # Counts should still be 1, not 2
        self.assertEqual(self.profile1.following_count, 1)
        self.assertEqual(self.profile2.followers_count, 1)
        self.assertEqual(FollowRelation.objects.count(), 1)

    def test_unfollow_not_following(self):
        """Test that unfollowing someone you don't follow does nothing."""
        self.profile1.unfollow(self.profile2)
        
        self.profile1.refresh_from_db()
        self.assertEqual(self.profile1.following_count, 0)
