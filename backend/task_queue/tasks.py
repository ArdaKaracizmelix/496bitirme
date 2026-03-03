"""
Celery Tasks for task_queue app.
Defines asynchronous tasks for email sending, data synchronization, trend calculation and image compression.
"""
import logging
from uuid import UUID
from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from .services import EmailService, ExternalSyncService, TrendAnalyzerService, ImageCompressionService


logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_task(self, user_id: str, template_id: str):
    """
    Asynchronous task to send emails.
    
    Workflow:
    1. Fetches the User object from the user_id
    2. Renders the HTML template with context data
    3. Calls EmailService.send() to dispatch via SMTP
    4. Retries up to 3 times on connection failure
    
    Args:
        user_id: UUID of the user to send email to
        template_id: Identifier for the email template to use
    """
    try:
        from user.models import UserProfile
        
        # Fetch the user
        user_profile = UserProfile.objects.select_related('user').get(id=UUID(user_id))
        user = user_profile.user
        
        # Prepare context for template rendering
        context = {
            'user_name': user.get_full_name() or user.username,
            'user_email': user.email,
            'user_profile': user_profile,
        }
        
        # Render template
        email_service = EmailService()
        html_body = email_service.render_template(f'emails/{template_id}', context)
        
        # Get email subject based on template
        subject_map = {
            'welcome': 'Welcome to Excursa!',
            'verification': 'Verify Your Email',
            'password_reset': 'Reset Your Password',
            'notification': 'New Recommendation Available',
        }
        subject = subject_map.get(template_id, 'Message from Excursa')
        
        # Send email
        success = email_service.send(
            recipient=user.email,
            subject=subject,
            html_body=html_body
        )
        
        if not success:
            logger.error(f"Failed to send email to {user.email}")
            # Retry with exponential backoff
            raise self.retry(exc=Exception("Email send failed"), countdown=60 * (2 ** self.request.retries))
        
        logger.info(f"Email sent successfully to {user.email}")
        return {
            'status': 'success',
            'user_id': user_id,
            'template': template_id,
            'recipient': user.email
        }
        
    except UserProfile.DoesNotExist:
        logger.error(f"UserProfile not found: {user_id}")
        return {'status': 'error', 'message': 'User not found'}
    
    except Exception as exc:
        logger.error(f"Unexpected error in send_email_task: {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
        return {'status': 'error', 'message': str(exc)}


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def sync_external_data_task(self, latitude: float, longitude: float):
    """
    Scheduled Task (Beat):
    Periodically syncs external data from third-party APIs.
    
    Workflow:
    1. Calls ExternalSyncService to fetch new places from Google Maps API for a specific region
    2. Updates the PostGIS database with new POIs
    3. Logs the number of new/updated items
    
    Args:
        latitude: Latitude coordinate for the region
        longitude: Longitude coordinate for the region
    """
    try:
        external_sync_service = ExternalSyncService()
        
        logger.info(f"Starting external data sync for coordinates: {latitude}, {longitude}")
        
        # Sync nearby places
        count_updated, new_pois = external_sync_service.sync_nearby_places(
            latitude=latitude,
            longitude=longitude,
            radius=1000
        )
        
        logger.info(f"External sync completed: {count_updated} new POIs created")
        
        return {
            'status': 'success',
            'pois_created': count_updated,
            'latitude': latitude,
            'longitude': longitude
        }
        
    except Exception as exc:
        logger.error(f"Error in sync_external_data_task: {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=120 * (2 ** self.request.retries))
        return {'status': 'error', 'message': str(exc)}


@shared_task(bind=True, default_retry_delay=300)
def calculate_trends_task(self):
    """
    Periodic Task (Beat):
    Calculates trending locations based on recent user interactions.
    
    Workflow:
    1. Aggregates interaction logs (clicks, likes) from the last 24 hours
    2. Updates the "Trending" score in Redis for top 100 POIs
    3. Clears old cache keys
    """
    try:
        trend_analyzer = TrendAnalyzerService()
        
        logger.info("Starting trend calculation task")
        
        result = trend_analyzer.calculate_trends(
            hours=24,
            top_k=100
        )
        
        logger.info(f"Trend calculation completed: {result}")
        
        return {
            'status': 'success',
            'result': result
        }
        
    except Exception as exc:
        logger.error(f"Error in calculate_trends_task: {exc}")
        return {'status': 'error', 'message': str(exc)}


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def compress_image_task(self, image_path: str):
    """
    Asynchronous/Scheduled Task:
    Compresses and optimizes user profile images.
    
    Workflow:
    1. Downloads the raw image from S3
    2. Uses Pillow library to resize and compress (JPEG 80% quality)
    3. Re-uploads to S3 and updates the UserProfile avatar URL
    
    Args:
        image_path: URL or path to the image to compress
    """
    try:
        image_compression_service = ImageCompressionService()
        
        logger.info(f"Starting image compression for: {image_path}")
        
        # Compress image
        compressed_url = image_compression_service.compress_image(
            image_url=image_path,
            output_quality=80
        )
        
        logger.info(f"Image compressed successfully: {image_path} -> {compressed_url}")
        
        return {
            'status': 'success',
            'original_url': image_path,
            'compressed_url': compressed_url
        }
        
    except Exception as exc:
        logger.error(f"Error in compress_image_task: {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=300)
        return {'status': 'error', 'message': str(exc)}
