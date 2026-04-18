"""
Unit tests for community app models and services.
"""
import unittest
from datetime import datetime
from django.utils import timezone
import uuid
from community.models import SocialPost, EmbeddedComment
from community.services import FeedService
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse
from django.contrib.auth.models import User
from user.models import UserProfile, FollowRelation


class SocialPostTestCase(unittest.TestCase):
    """Test cases for SocialPost model."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.user_id = uuid.uuid4()
        self.post = SocialPost(
            user_ref_id=self.user_id,
            content="Test post",
            visibility="PUBLIC",
            media_urls=[],
            tags=[]
        )
        # Ensure post is saved so we have an ID for operations
        self.post.save()

    def tearDown(self):
        """Clean up database."""
        if self.post.pk:
            self.post.delete()
    
    def test_add_comment(self):
        """Test adding a comment to a post."""
        comment_user_id = uuid.uuid4()
        self.post.add_comment(comment_user_id, "Great post!")
        self.post.reload()
        self.assertEqual(len(self.post.comments), 1)
        self.assertEqual(self.post.comments[0].text, "Great post!")
    
    def test_toggle_like(self):
        """Test toggling like on a post."""
        user_id = uuid.uuid4()
        
        # First toggle - should like
        liked = self.post.toggle_like(user_id)
        self.assertTrue(liked)
        self.post.reload()
        self.assertIn(user_id, self.post.likes)
        
        # Second toggle - should unlike
        liked = self.post.toggle_like(user_id)
        self.assertFalse(liked)
        self.post.reload()
        self.assertNotIn(user_id, self.post.likes)

    def test_toggle_save(self):
        """Test toggling save on a post."""
        user_id = uuid.uuid4()

        # First toggle - should save
        saved = self.post.toggle_save(user_id)
        self.assertTrue(saved)
        self.post.reload()
        self.assertIn(user_id, self.post.saved_by)

        # Second toggle - should unsave
        saved = self.post.toggle_save(user_id)
        self.assertFalse(saved)
        self.post.reload()
        self.assertNotIn(user_id, self.post.saved_by)


class FeedServiceTestCase(unittest.TestCase):
    """Test cases for FeedService."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.service = FeedService()
        self.user_id = uuid.uuid4()
    
    def test_calculate_virality_score(self):
        """Test virality score calculation."""
        post = SocialPost(
            user_ref_id=self.user_id,
            content="Test",
            likes=[uuid.uuid4(), uuid.uuid4()],  # 2 likes
            comments=[
                EmbeddedComment(user_id=uuid.uuid4(), text="Test"),
                EmbeddedComment(user_id=uuid.uuid4(), text="Test2"),
            ],  # 2 comments
            created_at=timezone.now()
        )
        
        score = self.service.calculate_virality_score(post)
        # Score = (2 * 1.0) + (2 * 2.0) / (0 + 2)^1.5 ≈ 4.0 / 2.828...
        self.assertGreater(score, 0)
        self.assertLess(score, 5)


class CommunityAPITestCase(APITestCase):
    """Integration tests for Community API endpoints."""

    def setUp(self):
        self.user = User.objects.create_user(username='comm_tester', password='password')
        self.profile = UserProfile.objects.create(user=self.user)
        self.client.force_authenticate(user=self.user)
        self.created_post_ids = []

    def tearDown(self):
        # Clean up MongoDB posts created during tests
        if self.created_post_ids:
            SocialPost.objects(pk__in=self.created_post_ids).delete()
        # Fallback cleanup for any other posts by this user
        SocialPost.objects(user_ref_id=self.profile.id).delete()
        
        # Django handles SQL rollback for User/UserProfile automatically in APITestCase

    def test_create_post(self):
        """Test creating a new post via API."""
        url = reverse('socialpost-list')
        data = {
            'content': 'Test API Post',
            'visibility': 'PUBLIC',
            'tags': ['test']
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.created_post_ids.append(response.data['id'])
        
        # Verify in DB
        post = SocialPost.objects(pk=response.data['id']).first()
        self.assertIsNotNone(post)
        self.assertEqual(post.content, 'Test API Post')

    def test_get_feed(self):
        """Test retrieving the home feed."""
        # Create a post
        post = SocialPost(
            user_ref_id=self.profile.id,
            content="Feed Post",
            visibility="PUBLIC"
        )
        post.save()
        self.created_post_ids.append(str(post.id))
        
        url = reverse('socialpost-feed')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('posts', response.data)
        # Should see own post in feed (since we follow ourselves in the logic)
        self.assertGreater(len(response.data['posts']), 0)

    def test_feed_scope_following_only_returns_followed_users_posts(self):
        """Following scope should include only followed users' posts."""
        followed_user = User.objects.create_user(username='followed_user', password='password')
        followed_profile = UserProfile.objects.create(user=followed_user)
        not_followed_user = User.objects.create_user(username='not_followed_user', password='password')
        not_followed_profile = UserProfile.objects.create(user=not_followed_user)

        FollowRelation.objects.create(follower=self.profile, following=followed_profile)

        followed_post = SocialPost(
            user_ref_id=followed_profile.id,
            content="Followed post",
            visibility="PUBLIC"
        )
        followed_post.save()
        self.created_post_ids.append(str(followed_post.id))

        hidden_post = SocialPost(
            user_ref_id=not_followed_profile.id,
            content="Not followed post",
            visibility="PUBLIC"
        )
        hidden_post.save()
        self.created_post_ids.append(str(hidden_post.id))

        url = reverse('socialpost-feed')
        response = self.client.get(url, {'scope': 'following'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('posts', [])
        self.assertTrue(any(item.get('id') == str(followed_post.id) for item in results))
        self.assertFalse(any(item.get('id') == str(hidden_post.id) for item in results))

    def test_feed_scope_explore_returns_public_posts(self):
        """Explore scope should include public posts regardless of following relation."""
        other_user = User.objects.create_user(username='explore_other', password='password')
        other_profile = UserProfile.objects.create(user=other_user)

        public_post = SocialPost(
            user_ref_id=other_profile.id,
            content="Public explore post",
            visibility="PUBLIC"
        )
        public_post.save()
        self.created_post_ids.append(str(public_post.id))

        url = reverse('socialpost-feed')
        response = self.client.get(url, {'scope': 'explore'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('posts', [])
        self.assertTrue(any(item.get('id') == str(public_post.id) for item in results))

    def test_toggle_like_api(self):
        """Test liking a post via API."""
        post = SocialPost(
            user_ref_id=self.profile.id,
            content="Like Me",
            visibility="PUBLIC"
        )
        post.save()
        self.created_post_ids.append(str(post.id))
        
        url = reverse('socialpost-toggle-like', kwargs={'pk': str(post.id)})
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['liked'])
        
        post.reload()
        self.assertIn(self.profile.id, post.likes)

    def test_delete_post_permission(self):
        """Test that users cannot delete others' posts."""
        # Create another user
        other_user = User.objects.create_user(username='other', password='password')
        other_profile = UserProfile.objects.create(user=other_user)
        
        post = SocialPost(
            user_ref_id=other_profile.id,
            content="Other Post",
            visibility="PUBLIC"
        )
        post.save()
        
        try:
            # Try to delete with current user (comm_tester)
            url = reverse('socialpost-detail', kwargs={'pk': str(post.id)})
            response = self.client.delete(url)
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        finally:
            # Cleanup
            post.delete()

    def test_toggle_save_api_and_list_saved(self):
        """Test saving a post and listing saved posts via API."""
        post = SocialPost(
            user_ref_id=self.profile.id,
            content="Save Me",
            visibility="PUBLIC"
        )
        post.save()
        self.created_post_ids.append(str(post.id))

        toggle_url = reverse('socialpost-toggle-save', kwargs={'pk': str(post.id)})
        toggle_response = self.client.post(toggle_url)
        self.assertEqual(toggle_response.status_code, status.HTTP_200_OK)
        self.assertTrue(toggle_response.data['saved'])

        post.reload()
        self.assertIn(self.profile.id, post.saved_by)

        saved_url = reverse('socialpost-saved')
        saved_response = self.client.get(saved_url)
        self.assertEqual(saved_response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(saved_response.data.get('count', 0), 1)
        self.assertTrue(any(item.get('id') == str(post.id) for item in saved_response.data.get('results', [])))

if __name__ == '__main__':
    unittest.main()
