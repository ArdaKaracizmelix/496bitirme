from django.test import TestCase
from django.contrib.auth.models import User
from django.db.utils import IntegrityError
from notifications.models import Notification, DeviceToken, NotificationVerb, DevicePlatform
from notifications.services import PushService
from user.models import UserProfile
import uuid


class NotificationModelTest(TestCase):
    """Test cases for Notification model"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        # Ensure profile exists to avoid RelatedObjectDoesNotExist
        UserProfile.objects.get_or_create(user=self.user)

        self.actor_user = User.objects.create_user(
            username='actor',
            email='actor@example.com',
            password='testpass123'
        )
        # Ensure profile exists
        UserProfile.objects.get_or_create(user=self.actor_user)

        self.recipient_profile = self.user.profile
        self.actor_profile = self.actor_user.profile
    
    def test_notification_creation(self):
        """Test creating a notification"""
        notification = Notification.objects.create(
            recipient=self.recipient_profile,
            actor=self.actor_profile,
            verb=NotificationVerb.LIKE,
            title='New Like',
            body='Someone liked your post',
            target_object_id=uuid.uuid4(),
            data={'type': 'like', 'post_id': '123'}
        )
        
        self.assertIsNotNone(notification.id)
        self.assertEqual(notification.verb, NotificationVerb.LIKE)
        self.assertFalse(notification.is_read)
        self.assertEqual(notification.data['post_id'], '123')
    
    def test_mark_as_read(self):
        """Test marking notification as read"""
        notification = Notification.objects.create(
            recipient=self.recipient_profile,
            actor=self.actor_profile,
            verb=NotificationVerb.COMMENT,
            title='New Comment',
            body='Someone commented on your post',
        )
        
        self.assertFalse(notification.is_read)
        notification.mark_as_read()
        
        # Refresh from database
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
    
    def test_system_notification_without_actor(self):
        """Test creating a system notification without an actor"""
        notification = Notification.objects.create(
            recipient=self.recipient_profile,
            actor=None,
            verb=NotificationVerb.SYSTEM_ALERT,
            title='System Alert',
            body='The system is under maintenance',
        )
        
        self.assertIsNone(notification.actor)
        self.assertEqual(notification.verb, NotificationVerb.SYSTEM_ALERT)
    
    def test_cascade_delete_recipient(self):
        """Test that deleting recipient deletes notifications"""
        Notification.objects.create(
            recipient=self.recipient_profile,
            actor=self.actor_profile,
            verb=NotificationVerb.FOLLOW,
            title='Follow',
            body='Follow body'
        )
        
        self.assertEqual(Notification.objects.count(), 1)
        self.user.delete() # Deletes User, cascades to Profile, cascades to Notification
        self.assertEqual(Notification.objects.count(), 0)

    def test_set_null_on_actor_delete(self):
        """Test that deleting actor sets actor field to NULL"""
        notification = Notification.objects.create(
            recipient=self.recipient_profile,
            actor=self.actor_profile,
            verb=NotificationVerb.FOLLOW,
            title='Follow',
            body='Follow body'
        )
        
        self.actor_user.delete() # Deletes User, cascades to Profile
        notification.refresh_from_db()
        self.assertIsNone(notification.actor)
        self.assertEqual(Notification.objects.count(), 1)

    def test_get_deep_link(self):
        """Test generating deep links"""
        target_id = uuid.uuid4()
        notification = Notification.objects.create(
            recipient=self.recipient_profile,
            actor=self.actor_profile,
            verb=NotificationVerb.TRIP_INVITE,
            title='Trip Invite',
            body='You are invited to a trip',
            target_object_id=target_id,
        )
        
        deep_link = notification.get_deep_link()
        self.assertIsNotNone(deep_link)
        self.assertIn('excursa://trip/', deep_link)
        self.assertIn(str(target_id), deep_link)
    
    def test_get_deep_link_without_target(self):
        """Test get_deep_link returns None without target_object_id"""
        notification = Notification.objects.create(
            recipient=self.recipient_profile,
            actor=self.actor_profile,
            verb=NotificationVerb.FOLLOW,
            title='New Follower',
            body='Someone followed you',
        )
        
        deep_link = notification.get_deep_link()
        self.assertIsNone(deep_link)


class DeviceTokenModelTest(TestCase):
    """Test cases for DeviceToken model"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='deviceuser',
            email='device@example.com',
            password='testpass123'
        )
    
    def test_device_token_creation(self):
        """Test creating a device token"""
        token = DeviceToken.objects.create(
            user=self.user,
            token='fcm_token_abc123xyz',
            platform=DevicePlatform.ANDROID
        )
        
        self.assertIsNotNone(token.id)
        self.assertEqual(token.user, self.user)
        self.assertTrue(token.is_active)
        self.assertEqual(token.platform, DevicePlatform.ANDROID)
    
    def test_unique_token_constraint(self):
        """Test that tokens must be unique"""
        token_string = 'unique_token_123'
        
        DeviceToken.objects.create(
            user=self.user,
            token=token_string,
            platform=DevicePlatform.iOS
        )
        
        # Trying to create another token with same string should fail
        with self.assertRaises(IntegrityError):
            DeviceToken.objects.create(
                user=self.user,
                token=token_string,
                platform=DevicePlatform.ANDROID
            )
    
    def test_multiple_tokens_per_user(self):
        """Test that a user can have multiple device tokens"""
        token1 = DeviceToken.objects.create(
            user=self.user,
            token='token_1',
            platform=DevicePlatform.ANDROID
        )
        token2 = DeviceToken.objects.create(
            user=self.user,
            token='token_2',
            platform=DevicePlatform.iOS
        )
        
        user_tokens = DeviceToken.objects.filter(user=self.user)
        self.assertEqual(user_tokens.count(), 2)

    def test_cascade_delete_user_tokens(self):
        """Test that deleting user deletes their tokens"""
        DeviceToken.objects.create(
            user=self.user,
            token='token_to_delete',
            platform=DevicePlatform.ANDROID
        )
        self.assertEqual(DeviceToken.objects.count(), 1)
        self.user.delete()
        self.assertEqual(DeviceToken.objects.count(), 0)

class PushServiceTest(TestCase):
    """Test cases for PushService"""
    
    def setUp(self):
        """Set up test data"""
        self.push_service = PushService()
        self.user = User.objects.create_user(
            username='pushuser',
            email='push@example.com',
            password='testpass123'
        )
    
    def test_push_service_initialization(self):
        """Test that PushService initializes without errors"""
        service = PushService()
        self.assertIsNotNone(service)
    
    def test_register_device_new(self):
        """Test registering a device token"""
        token_string = 'test_fcm_token_123'
        result = self.push_service.register_device(
            user=self.user,
            token=token_string,
            platform=DevicePlatform.ANDROID
        )
        
        self.assertTrue(result)
        
        # Verify token was saved
        device_token = DeviceToken.objects.get(token=token_string)
        self.assertEqual(device_token.user, self.user)
        self.assertEqual(device_token.platform, DevicePlatform.ANDROID)

    def test_register_device_existing_update(self):
        """Test registering an existing token updates it (e.g. user change or re-activation)"""
        token_string = 'existing_token'
        # Create initial token
        DeviceToken.objects.create(
            user=self.user,
            token=token_string,
            platform=DevicePlatform.ANDROID,
            is_active=False
        )
        
        # Register again
        result = self.push_service.register_device(
            user=self.user,
            token=token_string,
            platform=DevicePlatform.ANDROID
        )
        
        self.assertTrue(result)
        token = DeviceToken.objects.get(token=token_string)
        self.assertTrue(token.is_active)
    
    def test_cleanup_invalid_tokens(self):
        """Test cleaning up invalid tokens"""
        token1 = DeviceToken.objects.create(
            user=self.user,
            token='invalid_token_1',
            platform=DevicePlatform.ANDROID
        )
        token2 = DeviceToken.objects.create(
            user=self.user,
            token='invalid_token_2',
            platform=DevicePlatform.iOS
        )
        
        # Cleanup
        self.push_service.cleanup_invalid_tokens(['invalid_token_1', 'invalid_token_2'])
        
        # Both tokens should be deleted
        remaining_tokens = DeviceToken.objects.filter(user=self.user)
        self.assertEqual(remaining_tokens.count(), 0)
