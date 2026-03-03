# Task Queue App

The `task_queue` app is responsible for managing asynchronous operations and background tasks using Celery and Redis. It handles email sending, external data synchronization, trend calculation and image compression.

## Features

### 1. Email Service (`EmailService`)
Utility service for constructing and sending emails via SMTP.

**Attributes:**
- `smtp_host` - SMTP server address (default: smtp.gmail.com)
- `sender_email` - "From" email address
- `port` - SMTP port (default: 587 for TLS)

**Methods:**
- `send(recipient, subject, html_body)` - Sends email with MIME HTML content. Returns True on success.
- `render_template(template_name, context)` - Renders Django HTML template with context variables.

### 2. Celery Tasks

#### `send_email_task(user_id, template_id)`
Asynchronous task for sending emails.

**Workflow:**
1. Fetches the UserProfile from user_id
2. Renders HTML template with user context data
3. Calls EmailService.send() to dispatch via SMTP
4. Retries up to 3 times on connection failure with exponential backoff

**Parameters:**
- `user_id` (UUID) - User to send email to
- `template_id` (str) - Email template identifier (welcome, verification, password_reset, notification)

#### `sync_external_data_task(latitude, longitude)`
Periodic scheduled task for synchronizing external data.

**Workflow:**
1. Calls ExternalSyncService to fetch places from Google Maps API
2. Updates PostGIS database with new POI locations
3. Logs number of new/updated items

**Parameters:**
- `latitude` (float) - Region latitude coordinate
- `longitude` (float) - Region longitude coordinate

**Schedule:** Every 6 hours (configurable in settings)

#### `calculate_trends_task()`
Periodic scheduled task for calculating trending locations.

**Workflow:**
1. Aggregates interaction logs (CLICK, LIKE) from last 24 hours
2. Updates Redis "Trending" score for top 100 POIs
3. Clears old/expired cache keys

**Schedule:** Daily at midnight UTC (configurable in settings)

#### `compress_image_task(image_path)`
Asynchronous task for image optimization.

**Workflow:**
1. Downloads image from S3/URL
2. Resizes and compresses with Pillow (JPEG 80% quality)
3. Re-uploads to S3
4. Updates UserProfile avatar_url

**Parameters:**
- `image_path` (str) - URL or path to image

**Retries:** Up to 2 times on failure

### 3. Supporting Services

#### `ExternalSyncService`
Handles synchronization with third-party APIs (Google Maps, Foursquare).

- `sync_nearby_places(latitude, longitude, radius)` - Fetches nearby POIs and creates/updates in database

#### `TrendAnalyzerService`
Analyzes interaction trends and manages Redis caching.

- `calculate_trends(hours, top_k)` - Aggregates interactions and updates trending scores

#### `ImageCompressionService`
Optimizes image files for storage and delivery.

- `compress_image(image_url, output_quality)` - Downloads, compresses, and re-uploads image

## Configuration

### Settings Required

Add to `.env` file:

```env
# Celery & Redis
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
REDIS_URL=redis://localhost:6379/0

# Email (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=noreply@excursa.com

# AWS S3 (for image compression)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_REGION_NAME=us-east-1
AWS_STORAGE_BUCKET_NAME=excursa-uploads

# Google Places API
GOOGLE_PLACES_API_KEY=your-api-key
```

### Celery Beat Schedule

Tasks are configured to run on a schedule:

- **sync_external_data_task**: Every 6 hours
- **calculate_trends_task**: Daily at midnight UTC

Modify `CELERY_BEAT_SCHEDULE` in `settings.py` to adjust timing.

## Running Celery

### Development

```bash
# Terminal 1: Start Celery Worker
celery -A config worker -l info

# Terminal 2: Start Celery Beat (Scheduler)
celery -A config beat -l info
```

### Production

Use supervisord or systemd to manage Celery processes. See Docker setup for container deployment.

## Task Triggering

### Manual Task Trigger

```python
from task_queue.tasks import send_email_task

# Trigger immediately
send_email_task.delay(user_id='550e8400-e29b-41d4-a716-446655440000', template_id='welcome')

# Schedule for later
send_email_task.apply_async(
    args=('550e8400-e29b-41d4-a716-446655440000', 'welcome'),
    countdown=3600  # Run in 1 hour
)
```

### From Views/Services

```python
from task_queue.tasks import send_email_task

class UserViewSet(viewsets.ModelViewSet):
    def perform_create(self, serializer):
        user = serializer.save()
        # Send welcome email asynchronously
        send_email_task.delay(str(user.profile.id), 'welcome')
```

## Email Templates

Place HTML templates in `templates/emails/` directory:

- `welcome.html` - Welcome email for new users
- `verification.html` - Email verification link
- `password_reset.html` - Password reset instructions
- `notification.html` - Recommendation notifications

Example template (`welcome.html`):
```html
{% load i18n %}
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body>
    <h1>{% trans "Welcome to Excursa!" %}</h1>
    <p>{% trans "Hi" %} {{ user_name }},</p>
    <p>{% trans "We're excited to have you on board!" %}</p>
    <a href="https://excursa.com">{% trans "Visit Excursa" %}</a>
</body>
</html>
```

## Error Handling

- Tasks automatically retry on failure with exponential backoff
- Failed tasks are logged to Task Log model
- Email failures are retried up to 3 times
- Sync tasks fail gracefully and log errors without blocking the system

## Integration with Other Apps

### User App
- Listens for user registration events
- Sends welcome/verification emails

### Recommendations App
- Accesses Interaction model for trend analysis
- Updates trending scores in Redis cache

### Locations App
- Creates/updates POI objects from external APIs
- Updates PostGIS geospatial database

## Database Migrations

Run migrations after first setup:

```bash
python manage.py migrate task_queue
```

This creates the TaskLog table for task execution history tracking.

## Testing

Run tests with:

```bash
python manage.py test task_queue
```

## Security Considerations

1. **Email Credentials**: Store SMTP credentials in environment variables only
2. **API Keys**: Never commit API keys; use `.env` and `.gitignore`
3. **AWS Credentials**: Use IAM roles in production instead of hardcoded keys
4. **Redis Security**: Secure Redis instance in production (authentication, encryption)
5. **Task Privacy**: Avoid passing sensitive data in task arguments; use database IDs instead

## Performance Optimization

1. **Celery Pools**: Use `gevent` or `solo` pool for development; `prefork` for production
2. **Task Routing**: Route long tasks to dedicated workers for better distribution
3. **Result Backend**: Use Redis for faster result retrieval
4. **Compression**: Image compression runs asynchronously to avoid blocking requests
5. **Caching**: Trending scores cached in Redis with TTL to reduce database queries

## Troubleshooting

### No tasks are running
- Verify Redis is running: `redis-cli ping`
- Check Celery worker: `celery -A config inspect active`
- Review worker logs for errors

### Email not sending
- Verify SMTP credentials in `.env`
- Check firewall/network access to email host
- Review email logs for SMTP errors

### Memory issues with Celery
- Reduce `CELERYD_MAX_TASKS_PER_CHILD` for worker process recycling
- Monitor worker memory with `celery -A config inspect stats`
