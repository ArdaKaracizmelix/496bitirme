# Notifications App

The notifications app handles push notifications and notification history for users. It integrates with Firebase Cloud Messaging (FCM) for real-time push delivery while maintaining a persistent notification history in the database.

## Architecture

### Models

#### `Notification`
A persistent record of an alert sent to a user. Allows users to view notification history in the app.

**Attributes:**
- `id`: UUID (Primary Key)
- `recipient`: ForeignKey to UserProfile (recipient of notification)
- `actor`: ForeignKey to UserProfile (user who triggered event, nullable for system messages)
- `verb`: Enum (LIKE, COMMENT, FOLLOW, TRIP_INVITE, SYSTEM_ALERT)
- `title`: String (header text)
- `body`: String (main content)
- `target_object_id`: UUID (related object ID for deep linking)
- `is_read`: Boolean (status flag)
- `data`: JSONField (extra payload for frontend navigation)
- `created_at`: DateTime
- `updated_at`: DateTime

**Methods:**
- `mark_as_read()`: Updates `is_read` to True and saves
- `get_deep_link()`: Generates mobile app schema URL based on verb and target_object_id

#### `DeviceToken`
Stores FCM device tokens for push notifications. Users can have multiple tokens across different devices.

**Attributes:**
- `id`: UUID (Primary Key)
- `user`: ForeignKey to Django User
- `token`: String (unique FCM device token)
- `platform`: Enum (iOS, ANDROID, WEB)
- `is_active`: Boolean (status flag)
- `created_at`: DateTime
- `updated_at`: DateTime

### Services

#### `PushService`
Wrapper class for Firebase Cloud Messaging (FCM) Admin SDK. Handles device token management and message dispatching.

**Methods:**
- `register_device(user, token, platform)`: Saves/updates DeviceToken record
- `send_to_user(user_id, title, body, data)`: Sends multicast message to all active user devices
- `cleanup_invalid_tokens(failures)`: Removes invalid tokens from database
- `send_broadcast(topic, message)`: Sends message to subscribed segment
- `subscribe_to_topic(tokens, topic)`: Subscribes device tokens to Firebase topic
- `unsubscribe_from_topic(tokens, topic)`: Unsubscribes device tokens from topic

## API Endpoints

### Notification Endpoints

#### List Notifications
```
GET /api/notifications/notifications/
```
Returns paginated list of notifications for the current user. Supports filtering:
- `is_read`: Filter by read status (true/false)
- `verb`: Filter by notification type (LIKE, COMMENT, FOLLOW, TRIP_INVITE, SYSTEM_ALERT)

**Response:**
```json
{
  "count": 42,
  "next": "http://api/notifications/notifications/?page=2",
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "recipient_id": "550e8400-e29b-41d4-a716-446655440001",
      "actor_id": "550e8400-e29b-41d4-a716-446655440002",
      "actor_name": "john_doe",
      "verb": "LIKE",
      "title": "New Like",
      "body": "john_doe liked your post",
      "target_object_id": "550e8400-e29b-41d4-a716-446655440003",
      "is_read": false,
      "data": {"type": "like"},
      "deep_link": "excursa://notification/like/550e8400-e29b-41d4-a716-446655440003",
      "created_at": "2024-03-01T10:30:00Z",
      "updated_at": "2024-03-01T10:30:00Z"
    }
  ]
}
```

#### Get Notification Detail
```
GET /api/notifications/notifications/{id}/
```

#### Mark Single Notification as Read
```
PATCH /api/notifications/notifications/{id}/mark-as-read/
```

#### Mark Single Notification as Unread
```
PATCH /api/notifications/notifications/{id}/mark-as-unread/
```

#### Mark All as Read
```
POST /api/notifications/notifications/mark-all-as-read/
```

#### Get Unread Count
```
GET /api/notifications/notifications/unread-count/
```

**Response:**
```json
{
  "unread_count": 5
}
```

#### Filter by Verb
```
GET /api/notifications/notifications/by-verb/?verb=LIKE
```

#### Bulk Update Notifications
```
POST /api/notifications/notifications/bulk-update/
```

**Request Body:**
```json
{
  "notification_ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ],
  "action": "mark_as_read"
}
```

Actions: `mark_as_read`, `mark_as_unread`, `delete`

#### Create Notification (Admin)
```
POST /api/notifications/notifications/
```

**Request Body:**
```json
{
  "recipient": "550e8400-e29b-41d4-a716-446655440001",
  "actor": "550e8400-e29b-41d4-a716-446655440002",
  "verb": "LIKE",
  "title": "New Like",
  "body": "Someone liked your post",
  "target_object_id": "550e8400-e29b-41d4-a716-446655440003",
  "data": {"type": "like"}
}
```

### Device Token Endpoints

#### List Device Tokens
```
GET /api/notifications/device-tokens/
```
Returns all device tokens for the current user.

#### Register Device Token
```
POST /api/notifications/device-tokens/register/
```

**Request Body:**
```json
{
  "token": "fcm_token_abc123xyz",
  "platform": "Android"
}
```

**Response:**
```json
{
  "message": "Device registered successfully",
  "device_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Get Active Tokens
```
GET /api/notifications/device-tokens/active/
```

#### Disable Token
```
POST /api/notifications/device-tokens/{id}/disable/
```

#### Enable Token
```
POST /api/notifications/device-tokens/{id}/enable/
```

#### Delete Token
```
DELETE /api/notifications/device-tokens/{id}/
```

## Integration Points

### User App Integration
- Notifications use `UserProfile` for recipient and actor relationships
- Device tokens reference Django's `User` model for authentication

### Potential Integration Points

#### Recommendations App
Can trigger notifications when:
- A user is recommended a new POI
- Trending recommendations appear
- Special alerts for newly discovered places

#### Trips App (Future)
Can trigger notifications for:
- Trip invitations (`TRIP_INVITE`)
- Trip updates and changes
- Trip completion confirmations

#### Community/Posts App (Future)
Can trigger notifications for:
- New likes on posts (`LIKE`)
- New comments on posts (`COMMENT`)
- Posts from followed users

#### Social Features
- Follow notifications (`FOLLOW`)
- System alerts (`SYSTEM_ALERT`)

## Usage Examples

### Sending a Notification to a User

```python
from notifications.models import Notification, NotificationVerb
from notifications.services import get_push_service
from user.models import UserProfile

# Create notification record
recipient = UserProfile.objects.get(id='...')
actor = UserProfile.objects.get(id='...')

notification = Notification.objects.create(
    recipient=recipient,
    actor=actor,
    verb=NotificationVerb.LIKE,
    title='New Like',
    body='john_doe liked your post',
    target_object_id='post_id_here',
    data={'type': 'like', 'post_id': '...'}
)

# Send push notification
push_service = get_push_service()
success_count = push_service.send_to_user(
    user_id=recipient.user.id,
    title=notification.title,
    body=notification.body,
    data=notification.data
)
```

### Registering a Device

```python
from notifications.services import get_push_service

push_service = get_push_service()
success = push_service.register_device(
    user=request.user,
    token='fcm_token_from_client',
    platform='Android'
)
```

### Broadcasting to a Topic

```python
push_service = get_push_service()
success = push_service.send_broadcast(
    topic='promotions',
    message='Special offer for you!'
)
```

## Firebase Setup (Production)

To enable real push notifications:

1. Create a Firebase project at https://console.firebase.google.com/
2. Download service account JSON file
3. Set `FIREBASE_CREDENTIALS_PATH` environment variable
4. Install Firebase Admin SDK:
   ```
   pip install firebase-admin
   ```

Without Firebase setup, the service will log warnings but won't send actual notifications (useful for development/testing).

## Notes

- Deep links use the `excursa://` schema for mobile app navigation
- Notifications are stored persistently for history tracking
- Multiple device tokens per user support multi-device scenarios
- Invalid tokens are automatically cleaned up when FCM returns errors
