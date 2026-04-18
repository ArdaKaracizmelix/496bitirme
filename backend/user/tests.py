from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APITestCase
from .models import UserProfile, FollowRelation
from .services import generate_email_verification_token
from community.models import SocialPost

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

    def test_followers_list_endpoint(self):
        """Test followers list API endpoint."""
        self.profile1.follow(self.profile2)
        url = reverse('followers', args=[self.profile2.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.profile1.id))

    def test_following_list_endpoint(self):
        """Test following list API endpoint."""
        self.profile1.follow(self.profile2)
        url = reverse('following', args=[self.profile1.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.profile2.id))

    def test_me_endpoint_returns_live_follow_counts(self):
        """Me endpoint should return counts computed from follow relations."""
        self.profile1.follow(self.profile2)
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()

        # Corrupt denormalized counters intentionally.
        self.profile1.following_count = 99
        self.profile1.followers_count = 77
        self.profile1.save(update_fields=['following_count', 'followers_count'])

        response = self.client.get(reverse('me'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['following_count'], 1)
        self.assertEqual(response.data['followers_count'], 0)

    def test_delete_me_deletes_account_and_social_data(self):
        """Deleting /user/me/ removes user account and related social content."""
        follower_user = User.objects.create_user(username='api_user3', password='password123')
        follower_profile = UserProfile.objects.create(user=follower_user)

        # follower_profile -> profile1 and profile1 -> profile2
        follower_profile.follow(self.profile1)
        self.profile1.follow(self.profile2)
        follower_profile.refresh_from_db()
        self.profile1.refresh_from_db()
        self.profile2.refresh_from_db()
        self.assertEqual(follower_profile.following_count, 1)
        self.assertEqual(self.profile2.followers_count, 1)

        owned_post = SocialPost(
            user_ref_id=self.profile1.id,
            content="Owned post",
            visibility="PUBLIC",
        )
        owned_post.save()

        other_post = SocialPost(
            user_ref_id=self.profile2.id,
            content="Other post",
            visibility="PUBLIC",
            likes=[self.profile1.id],
            saved_by=[self.profile1.id],
        )
        other_post.add_comment(self.profile1.id, "test")
        other_post.save()

        try:
            url = reverse('me')
            response = self.client.delete(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

            self.assertFalse(User.objects.filter(id=self.user1.id).exists())
            self.assertFalse(UserProfile.objects.filter(id=self.profile1.id).exists())
            self.assertFalse(SocialPost.objects(id=owned_post.id).first())

            refreshed_other = SocialPost.objects(id=other_post.id).first()
            self.assertIsNotNone(refreshed_other)
            self.assertNotIn(self.profile1.id, refreshed_other.likes)
            self.assertNotIn(self.profile1.id, refreshed_other.saved_by)
            self.assertFalse(any(c.user_id == self.profile1.id for c in refreshed_other.comments))

            follower_profile.refresh_from_db()
            self.profile2.refresh_from_db()
            self.assertEqual(follower_profile.following_count, 0)
            self.assertEqual(self.profile2.followers_count, 0)
        finally:
            SocialPost.objects(id__in=[owned_post.id, other_post.id]).delete()


class EmailVerificationAuthTests(APITestCase):
    @patch("user.services.EmailService.send", return_value=True)
    @patch("user.services.EmailService.render_template", return_value="<html>ok</html>")
    def test_register_creates_inactive_user(self, _mock_render, _mock_send):
        response = self.client.post(
            reverse("register"),
            {
                "full_name": "Test User",
                "email": "verifyme@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="verifyme@example.com")
        self.assertFalse(user.is_active)
        self.assertTrue(response.data["requires_verification"])
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_login_unverified_user_is_rejected(self):
        User.objects.create_user(
            username="novalid@example.com",
            email="novalid@example.com",
            password="StrongPass1",
            is_active=False,
        )

        response = self.client.post(
            reverse("login"),
            {"email": "novalid@example.com", "password": "StrongPass1"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["detail"], "Please verify your email before logging in")

    def test_verify_email_activates_account(self):
        user = User.objects.create_user(
            username="inactive@example.com",
            email="inactive@example.com",
            password="StrongPass1",
            is_active=False,
        )
        profile = UserProfile.objects.create(user=user, is_verified=False)
        token = generate_email_verification_token(user)

        response = self.client.get(reverse("verify_email"), {"token": token})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        profile.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(profile.is_verified)
