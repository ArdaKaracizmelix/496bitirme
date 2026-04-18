"""
Push notification service using Firebase Cloud Messaging (FCM).
Handles device token management and message dispatching.
"""
import logging
from typing import List, Optional
from django.db import transaction

from .models import DeviceToken, Notification, NotificationCategory, NotificationVerb
from user.models import UserProfile

logger = logging.getLogger(__name__)


def _profile_display_name(profile: Optional[UserProfile]) -> str:
    if not profile:
        return "Excursa"
    full_name = f"{profile.user.first_name} {profile.user.last_name}".strip()
    return full_name or profile.user.username or "Gezgin"


def _post_owner(post) -> Optional[UserProfile]:
    try:
        return UserProfile.objects.select_related("user").filter(id=post.user_ref_id).first()
    except Exception:
        return None


def _post_ref(post) -> str:
    return str(getattr(post, "id", "") or "")


def _is_route_post(post) -> bool:
    route_data = getattr(post, "route_data", None)
    tags = getattr(post, "tags", None) or []
    return bool(route_data) or "trip-share" in tags or "route" in tags


class NotificationService:
    """
    Domain service for creating in-app notifications.

    Views and domain actions call this service instead of building notification
    records inline, so future push dispatch or aggregation can be added here.
    """

    @classmethod
    def create_notification(
        cls,
        *,
        recipient: UserProfile,
        verb: str,
        title: str,
        body: str,
        actor: Optional[UserProfile] = None,
        category: str = NotificationCategory.ACTIVITY,
        target_object_id=None,
        target_object_ref: str = "",
        data: Optional[dict] = None,
        dedupe_key: str = "",
    ) -> Optional[Notification]:
        if not recipient:
            return None
        if actor and str(actor.id) == str(recipient.id):
            return None

        payload = data or {}
        defaults = {
            "recipient": recipient,
            "actor": actor,
            "verb": verb,
            "category": category,
            "title": title,
            "body": body,
            "target_object_id": target_object_id,
            "target_object_ref": str(target_object_ref or ""),
            "data": payload,
            "is_read": False,
        }

        with transaction.atomic():
            if dedupe_key:
                notification, _created = Notification.objects.update_or_create(
                    recipient=recipient,
                    dedupe_key=dedupe_key,
                    defaults=defaults,
                )
                return notification

            return Notification.objects.create(**defaults)

    @classmethod
    def notify_post_like(cls, post, actor: UserProfile):
        owner = _post_owner(post)
        ref = _post_ref(post)
        if not owner or not ref:
            return None

        actor_name = _profile_display_name(actor)
        is_route = _is_route_post(post)
        verb = NotificationVerb.ROUTE_LIKE if is_route else NotificationVerb.POST_LIKE
        category = NotificationCategory.ROUTES if is_route else NotificationCategory.ACTIVITY
        title = f"{actor_name} liked your route" if is_route else f"{actor_name} liked your post"
        body = "Your shared route is getting attention." if is_route else "Someone reacted to your travel moment."

        return cls.create_notification(
            recipient=owner,
            actor=actor,
            verb=verb,
            category=category,
            title=title,
            body=body,
            target_object_ref=ref,
            dedupe_key=f"{verb}:{owner.id}:{actor.id}:{ref}",
            data={
                "screen": "PostDetail",
                "post_id": ref,
                "type": "route_like" if is_route else "post_like",
            },
        )

    @classmethod
    def notify_post_comment(cls, post, comment, actor: UserProfile):
        owner = _post_owner(post)
        ref = _post_ref(post)
        if not owner or not ref:
            return None

        actor_name = _profile_display_name(actor)
        is_route = _is_route_post(post)
        verb = NotificationVerb.ROUTE_COMMENT if is_route else NotificationVerb.POST_COMMENT
        category = NotificationCategory.ROUTES if is_route else NotificationCategory.ACTIVITY
        title = f"{actor_name} commented on your route" if is_route else f"{actor_name} commented on your post"
        comment_text = str(getattr(comment, "text", "") or "").strip()
        body = comment_text[:140] if comment_text else "Open the conversation to see the new comment."

        return cls.create_notification(
            recipient=owner,
            actor=actor,
            verb=verb,
            category=category,
            title=title,
            body=body,
            target_object_ref=ref,
            dedupe_key=f"{verb}:{owner.id}:{actor.id}:{ref}:{getattr(comment, 'timestamp', '')}",
            data={
                "screen": "PostDetail",
                "post_id": ref,
                "type": "route_comment" if is_route else "post_comment",
            },
        )

    @classmethod
    def notify_post_save(cls, post, actor: UserProfile):
        owner = _post_owner(post)
        ref = _post_ref(post)
        if not owner or not ref:
            return None

        actor_name = _profile_display_name(actor)
        is_route = _is_route_post(post)
        verb = NotificationVerb.ROUTE_SAVE if is_route else NotificationVerb.POST_SAVE
        category = NotificationCategory.ROUTES if is_route else NotificationCategory.ACTIVITY
        title = f"{actor_name} saved your route" if is_route else f"{actor_name} saved your post"
        body = "Your route is useful enough to revisit later." if is_route else "Your post was saved for later."

        return cls.create_notification(
            recipient=owner,
            actor=actor,
            verb=verb,
            category=category,
            title=title,
            body=body,
            target_object_ref=ref,
            dedupe_key=f"{verb}:{owner.id}:{actor.id}:{ref}",
            data={
                "screen": "PostDetail",
                "post_id": ref,
                "type": "route_save" if is_route else "post_save",
            },
        )

    @classmethod
    def notify_follow(cls, follower: UserProfile, followed: UserProfile):
        follower_name = _profile_display_name(follower)
        return cls.create_notification(
            recipient=followed,
            actor=follower,
            verb=NotificationVerb.FOLLOW,
            category=NotificationCategory.ACTIVITY,
            title=f"{follower_name} started following you",
            body="You have a new travel companion on Excursa.",
            target_object_id=follower.id,
            target_object_ref=str(follower.id),
            dedupe_key=f"{NotificationVerb.FOLLOW}:{followed.id}:{follower.id}",
            data={
                "screen": "UserProfile",
                "profile_id": str(follower.id),
                "type": "follow",
            },
        )

    @classmethod
    def notify_welcome(cls, profile: UserProfile):
        return cls.create_notification(
            recipient=profile,
            actor=None,
            verb=NotificationVerb.WELCOME,
            category=NotificationCategory.SYSTEM,
            title="Welcome to Excursa",
            body="Your account is verified. Pick your interests, follow travelers, and start building routes.",
            dedupe_key=f"{NotificationVerb.WELCOME}:{profile.id}",
            data={
                "screen": "InterestSelection",
                "type": "welcome",
            },
        )

# Firebase Admin SDK import 
try:
    import firebase_admin
    from firebase_admin import credentials, messaging
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("Firebase Admin SDK not installed. Push notifications disabled.")


class PushService:
    """
    Wrapper class for Firebase Cloud Messaging (FCM) Admin SDK.
    Handles the logic of finding user's active device tokens and dispatching messages.
    """
    
    def __init__(self, credentials_path: Optional[str] = None):
        """
        Initialize the PushService with Firebase Admin SDK.
        
        Args:
            credentials_path: Path to Firebase service account JSON file.
                            If not provided, uses default credential discovery.
        """
        self.fcm_client = None
        
        if FIREBASE_AVAILABLE:
            try:
                if credentials_path:
                    cred = credentials.Certificate(credentials_path)
                    self.fcm_client = firebase_admin.initialize_app(cred)
                else:
                    # Uses default credentials from environment
                    if not firebase_admin._apps:
                        cred = credentials.ApplicationDefault()
                        self.fcm_client = firebase_admin.initialize_app(cred)
                    else:
                        self.fcm_client = firebase_admin.get_app()
                logger.info("Firebase Admin SDK initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize Firebase Admin SDK: {str(e)}")
                self.fcm_client = None
    
    def register_device(self, user, token: str, platform: str) -> bool:
        """
        Saves or updates a DeviceToken record in the database when a user logs in.
        
        Args:
            user: User instance (Django User model)
            token: FCM device token string
            platform: Device platform (iOS, ANDROID, WEB)
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            with transaction.atomic():
                device_token, created = DeviceToken.objects.update_or_create(
                    token=token,
                    defaults={
                        'user': user,
                        'platform': platform,
                        'is_active': True
                    }
                )
                action = "created" if created else "updated"
                logger.info(f"Device token {action} for user {user.username}")
                return True
        except Exception as e:
            logger.error(f"Error registering device token: {str(e)}")
            return False
    
    def send_to_user(self, user_id, title: str, body: str, data: dict = None) -> int:
        """
        Sends a push notification to a specific user via all their active devices.
        
        Steps:
        1. Queries DeviceToken table for all active tokens belonging to user_id
        2. Sends a multicast message via FCM
        3. Returns the number of successful deliveries
        
        Args:
            user_id: UUID or ID of the recipient user
            title: Notification title/header
            body: Notification body/content
            data: Optional dictionary with additional data payload
        
        Returns:
            int: Number of successfully delivered messages
        """
        if not self.fcm_client:
            logger.warning("FCM client not initialized. Cannot send notification.")
            return 0
        
        try:
            # Get all active device tokens for the user
            device_tokens = DeviceToken.objects.filter(
                user_id=user_id,
                is_active=True
            ).values_list('token', flat=True)
            
            if not device_tokens:
                logger.warning(f"No active device tokens found for user {user_id}")
                return 0
            
            token_list = list(device_tokens)
            data = data or {}
            
            # Create multicast message
            message = messaging.MulticastMessage(
                notification=messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data,
                tokens=token_list
            )
            
            # Send to all devices
            response = messaging.send_multicast(message)
            
            # Process failures
            if response.failure_count > 0:
                failed_tokens = []
                for idx, resp in enumerate(response.responses):
                    if not resp.success:
                        failed_tokens.append(token_list[idx])
                
                # Clean up invalid tokens
                if failed_tokens:
                    self.cleanup_invalid_tokens(failed_tokens)
            
            logger.info(
                f"Sent notification to user {user_id}: "
                f"{response.success_count} succeeded, {response.failure_count} failed"
            )
            return response.success_count
            
        except Exception as e:
            logger.error(f"Error sending notification to user {user_id}: {str(e)}")
            return 0
    
    def cleanup_invalid_tokens(self, failures: List[str]) -> None:
        """
        Removes invalid device tokens from the database when FCM returns an error.
        
        Args:
            failures: List of token strings that failed to deliver
        """
        if not failures:
            return
        
        try:
            with transaction.atomic():
                deleted_count, _ = DeviceToken.objects.filter(
                    token__in=failures
                ).delete()
                logger.info(f"Cleaned up {deleted_count} invalid device tokens")
        except Exception as e:
            logger.error(f"Error cleaning up invalid tokens: {str(e)}")
    
    def send_broadcast(self, topic: str, message: str) -> bool:
        """
        Sends a message to all users subscribed to a specific topic.
        
        Args:
            topic: Firebase topic name (e.g., 'announcements', 'promotions')
            message: Message content to send
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.fcm_client:
            logger.warning("FCM client not initialized. Cannot send broadcast.")
            return False
        
        try:
            fcm_message = messaging.Message(
                notification=messaging.Notification(
                    title="Announcement",
                    body=message
                ),
                topic=topic
            )
            
            response = messaging.send(fcm_message)
            logger.info(f"Broadcast sent to topic '{topic}'. Message ID: {response}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending broadcast to topic '{topic}': {str(e)}")
            return False
    
    def subscribe_to_topic(self, tokens: List[str], topic: str) -> bool:
        """
        Subscribes device tokens to a Firebase topic.
        
        Args:
            tokens: List of device tokens to subscribe
            topic: Topic name to subscribe to
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.fcm_client:
            logger.warning("FCM client not initialized. Cannot subscribe to topic.")
            return False
        
        try:
            response = messaging.subscribe_to_topic(tokens, topic)
            logger.info(f"Subscribed {len(tokens)} devices to topic '{topic}'")
            return True
        except Exception as e:
            logger.error(f"Error subscribing to topic '{topic}': {str(e)}")
            return False
    
    def unsubscribe_from_topic(self, tokens: List[str], topic: str) -> bool:
        """
        Unsubscribes device tokens from a Firebase topic.
        
        Args:
            tokens: List of device tokens to unsubscribe
            topic: Topic name to unsubscribe from
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self.fcm_client:
            logger.warning("FCM client not initialized. Cannot unsubscribe from topic.")
            return False
        
        try:
            response = messaging.unsubscribe_from_topic(tokens, topic)
            logger.info(f"Unsubscribed {len(tokens)} devices from topic '{topic}'")
            return True
        except Exception as e:
            logger.error(f"Error unsubscribing from topic '{topic}': {str(e)}")
            return False


# Global instance for easy access
_push_service = None


def get_push_service(credentials_path: Optional[str] = None) -> PushService:
    """
    Get or create a global PushService instance.
    
    Args:
        credentials_path: Optional path to Firebase credentials file
    
    Returns:
        PushService: The push service instance
    """
    global _push_service
    if _push_service is None:
        _push_service = PushService(credentials_path)
    return _push_service
