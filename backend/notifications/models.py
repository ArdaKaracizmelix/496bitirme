import uuid
from django.db import models
from django.contrib.auth.models import User
from user.models import UserProfile


class NotificationVerb(models.TextChoices):
    """Enumeration for notification types/actions"""
    LIKE = 'LIKE', 'Like'
    COMMENT = 'COMMENT', 'Comment'
    FOLLOW = 'FOLLOW', 'Follow'
    TRIP_INVITE = 'TRIP_INVITE', 'Trip Invite'
    SYSTEM_ALERT = 'SYSTEM_ALERT', 'System Alert'


class DevicePlatform(models.TextChoices):
    """Enumeration for device platforms"""
    iOS = 'iOS', 'iOS'
    ANDROID = 'ANDROID', 'Android'
    WEB = 'WEB', 'Web'


class Notification(models.Model):
    """
    A persistent record of an alert sent to a user. This allows users to view
    a "History" or "Activity" tab inside the app even if they missed the push 
    notification on their lock screen.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # The user who receives the notification
    recipient = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name='received_notifications'
    )
    
    # The user who triggered the event (nullable for system messages)
    actor = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='triggered_notifications'
    )
    
    # Type of action
    verb = models.CharField(
        max_length=20,
        choices=NotificationVerb.choices,
        help_text="Type of notification: LIKE, COMMENT, FOLLOW, TRIP_INVITE, SYSTEM_ALERT"
    )
    
    # Header text
    title = models.CharField(max_length=200)
    
    # Main content
    body = models.TextField()
    
    # The ID of the related object (Post ID, Trip ID, etc.) used for deep linking
    target_object_id = models.UUIDField(null=True, blank=True)
    
    # Status flag
    is_read = models.BooleanField(default=False)
    
    # Extra payload for frontend navigation
    data = models.JSONField(default=dict, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'notifications_notification'
        indexes = [
            models.Index(fields=['recipient', 'created_at']),
            models.Index(fields=['recipient', 'is_read']),
            models.Index(fields=['created_at']),
        ]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.verb} notification for {self.recipient.user.username}"
    
    def mark_as_read(self):
        """Updates is_read to True and saves the instance."""
        self.is_read = True
        self.save(update_fields=['is_read', 'updated_at'])
    
    def get_deep_link(self):
        """
        Constructs the mobile app schema URL based on the verb and target_object_id.
        Used for deep linking in mobile apps.
        """
        if not self.target_object_id:
            return None
        
        # Map verb to deep link schema
        deep_link_map = {
            NotificationVerb.LIKE: f'excursa://notification/like/{self.target_object_id}',
            NotificationVerb.COMMENT: f'excursa://notification/comment/{self.target_object_id}',
            NotificationVerb.FOLLOW: f'excursa://profile/{self.actor.id if self.actor else ""}',
            NotificationVerb.TRIP_INVITE: f'excursa://trip/{self.target_object_id}',
            NotificationVerb.SYSTEM_ALERT: f'excursa://alert/{self.target_object_id}',
        }
        
        return deep_link_map.get(self.verb)


class DeviceToken(models.Model):
    """
    Stores Firebase Cloud Messaging (FCM) device tokens for push notifications.
    One user can have multiple active tokens across different devices.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # The user who owns this device
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='device_tokens'
    )
    
    # FCM device token
    token = models.CharField(max_length=500, unique=True)
    
    # Device platform
    platform = models.CharField(
        max_length=20,
        choices=DevicePlatform.choices,
        default=DevicePlatform.ANDROID
    )
    
    # Whether the token is still valid
    is_active = models.BooleanField(default=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'notifications_device_token'
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['token']),
        ]
    
    def __str__(self):
        return f"Device token for {self.user.username} ({self.platform})"
