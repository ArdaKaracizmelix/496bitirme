"""
Service classes for task_queue app.
Includes EmailService for SMTP communication and template rendering.
"""
import smtplib
import logging
import io
from typing import Tuple
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from django.template.loader import render_to_string
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db.models import Count


logger = logging.getLogger(__name__)


class EmailService:
    """
    Utility Service for constructing email messages and communicating with SMTP server.
    Handles email rendering and dispatch.
    """
    
    def __init__(self):
        self.smtp_host = getattr(settings, 'EMAIL_HOST', 'smtp.gmail.com')
        self.sender_email = getattr(settings, 'EMAIL_HOST_USER', 'noreply@excursa.com')
        self.port = getattr(settings, 'EMAIL_PORT', 587)
        self.email_password = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
        self.use_tls = getattr(settings, 'EMAIL_USE_TLS', True)
    
    def render_template(self, template_name: str, context: dict) -> str:
        """
        Loads an HTML file (Django Template) and fills in dynamic variables.
        
        Args:
            template_name: Name of the template file (with or without .html extension)
            context: Dictionary of context variables to render in the template
            
        Returns:
            Rendered HTML string
        """
        if not template_name.endswith('.html'):
            template_name = f"{template_name}.html"
        
        try:
            html_content = render_to_string(template_name, context)
            logger.info(f"Template {template_name} rendered successfully")
            return html_content
        except Exception as e:
            logger.error(f"Failed to render template {template_name}: {e}")
            raise
    
    def send(self, recipient: str, subject: str, html_body: str, max_retries: int = 3) -> bool:
        """
        Establishes an SMTP connection and sends the MIME message.
        Retries up to 3 times on connection failure.
        
        Args:
            recipient: Email address of the recipient
            subject: Subject line of the email
            html_body: HTML content of the email body
            max_retries: Maximum number of retry attempts
            
        Returns:
            True if email was sent successfully, False otherwise
        """
        for attempt in range(max_retries):
            try:
                # Create message
                msg = MIMEMultipart('alternative')
                msg['Subject'] = subject
                msg['From'] = self.sender_email
                msg['To'] = recipient
                
                # Attach HTML content
                msg.attach(MIMEText(html_body, 'html'))
                
                # Connect to SMTP server and send
                if self.use_tls:
                    server = smtplib.SMTP(self.smtp_host, self.port)
                    server.starttls()
                else:
                    server = smtplib.SMTP_SSL(self.smtp_host, self.port)
                
                server.login(self.sender_email, self.email_password)
                server.send_message(msg)
                server.quit()
                
                logger.info(f"Email sent successfully to {recipient}")
                return True
                
            except (smtplib.SMTPException, ConnectionError) as e:
                logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt == max_retries - 1:
                    logger.error(f"Failed to send email to {recipient} after {max_retries} attempts")
                    return False
                continue
        
        return False


class ExternalSyncService:
    """
    Service for synchronizing external data from third-party APIs.
    Currently focuses on Google Maps API integration for POI discovery.
    """
    
    def __init__(self):
        self.google_api_key = getattr(settings, 'GOOGLE_PLACES_API_KEY', None)
        self.foursquare_api_key = getattr(settings, 'FOURSQUARE_API_KEY', None)
    
    def sync_nearby_places(self, latitude: float, longitude: float, radius: int = 1000) -> Tuple[int, list]:
        """
        Fetches new places from Google Maps API for a specific region
        and updates the PostGIS database.
        
        Args:
            latitude: Latitude coordinate
            longitude: Longitude coordinate
            radius: Search radius in meters (default 1000)
            
        Returns:
            Tuple of (count_updated, list_of_new_pois)
        """
        if not self.google_api_key:
            logger.error("Google Places API key not configured")
            return 0, []
        
        try:
            import requests
            from locations.models import POI
            from django.contrib.gis.geos import Point
            
            url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
            params = {
                'location': f"{latitude},{longitude}",
                'radius': radius,
                'key': self.google_api_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data['status'] != 'OK':
                logger.warning(f"Google API error: {data.get('status')}")
                return 0, []
            
            new_pois = []
            created_count = 0
            
            for place in data.get('results', []):
                try:
                    location = Point(
                        place['geometry']['location']['lng'],
                        place['geometry']['location']['lat']
                    )
                    
                    poi, created = POI.objects.get_or_create(
                        google_place_id=place['place_id'],
                        defaults={
                            'name': place['name'],
                            'location': location,
                            'category': place.get('types', ['other'])[0],
                            'average_rating': place.get('rating', 0.0),
                            'review_count': place.get('user_ratings_total', 0),
                        }
                    )
                    
                    if created:
                        new_pois.append(poi)
                        created_count += 1
                    
                except Exception as e:
                    logger.error(f"Error processing place {place['name']}: {e}")
                    continue
            
            logger.info(f"Synced {created_count} new POIs from Google Maps API")
            return created_count, new_pois
            
        except Exception as e:
            logger.error(f"Error syncing external data: {e}")
            return 0, []


class TrendAnalyzerService:
    """
    Service for analyzing trends in user interactions.
    Aggregates interaction logs and updates trending scores.
    """
    
    def __init__(self):
        self.redis_client = None
        try:
            import redis
            redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
            self.redis_client = redis.from_url(redis_url)
        except ImportError:
            logger.warning("Redis not available. Trend analysis will be limited.")
    
    def calculate_trends(self, hours: int = 24, top_k: int = 100) -> dict:
        """
        Aggregates interaction logs (clicks, likes) from the last N hours.
        Updates the "Trending" score in Redis for top K POIs.
        Clears old cache keys.
        
        Args:
            hours: Number of hours to aggregate (default 24)
            top_k: Number of top POIs to update (default 100)
            
        Returns:
            Dictionary with trend statistics
        """
        try:
            from datetime import timedelta
            from django.utils import timezone
            from recommendations.models import Interaction, InteractionType
            from locations.models import POI
            
            # Calculate time window
            cutoff_time = timezone.now() - timedelta(hours=hours)
            
            # Aggregate interactions by POI
            interactions = Interaction.objects.filter(
                timestamp__gte=cutoff_time,
                interaction_type__in=[InteractionType.CLICK, InteractionType.LIKE]
            ).values('poi').annotate(count=Count('id')).order_by('-count')[:top_k]
            
            trend_updates = {}
            
            # Update Redis with trending scores
            if self.redis_client:
                for item in interactions:
                    poi_id = str(item['poi'])
                    score = item['count']
                    cache_key = f"trending:poi:{poi_id}"
                    self.redis_client.set(cache_key, score, ex=3600*hours)
                    trend_updates[poi_id] = score
            
            # Clean up old cache keys
            self._cleanup_old_cache()
            
            logger.info(f"Calculated trends for {len(interactions)} POIs")
            return {
                'pois_updated': len(interactions),
                'top_trends': trend_updates
            }
            
        except Exception as e:
            logger.error(f"Error calculating trends: {e}")
            return {'error': str(e)}
    
    def _cleanup_old_cache(self):
        """Clean up old Redis cache keys"""
        if not self.redis_client:
            return
        
        try:
            # Get all trending keys and remove expired ones
            keys = self.redis_client.keys('trending:*')
            for key in keys:
                ttl = self.redis_client.ttl(key)
                if ttl == -2:  # Key does not exist
                    self.redis_client.delete(key)
        except Exception as e:
            logger.warning(f"Error during cache cleanup: {e}")


class ImageCompressionService:
    """
    Service for image compression and optimization.
    Downloads from S3, compresses, and re-uploads.
    """
    
    def compress_image(self, image_url: str, output_quality: int = 80) -> str:
        """
        Downloads the raw image from a URL/S3.
        Uses Pillow library to resize and compress (JPEG at specified quality).
        Re-uploads to S3 and returns the new URL.
        
        Args:
            image_url: URL to the image (local or S3)
            output_quality: JPEG quality level (1-100, default 80)
            
        Returns:
            URL of the compressed image
        """
        import requests
        from PIL import Image
        
        try:
            # Download image
            response = requests.get(image_url, timeout=10)
            response.raise_for_status()
            
            # Open image
            img = Image.open(io.BytesIO(response.content))
            
            # Convert to RGB if needed (for PNG with transparency)
            if img.mode in ('RGBA', 'LA', 'P'):
                rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = rgb_img
            
            # Compress and save
            compressed_io = io.BytesIO()
            img.save(compressed_io, format='JPEG', quality=output_quality, optimize=True)
            compressed_io.seek(0)
            
            # Upload to S3 (placeholder implementation)
            new_url = self._upload_to_s3(compressed_io, image_url)
            
            logger.info(f"Image compressed successfully: {image_url}")
            return new_url
            
        except Exception as e:
            logger.error(f"Error compressing image from {image_url}: {e}")
            return image_url  # Return original URL on failure
    
    def _upload_to_s3(self, file_object: io.BytesIO, original_url: str) -> str:
        """
        Placeholder for S3 upload logic.
        In production, use boto3 to upload to AWS S3.
        
        Args:
            file_object: BytesIO object containing the compressed image
            original_url: Original image URL for reference
            
        Returns:
            URL of the uploaded image
        """
        try:
            import boto3
            from django.conf import settings
            
            s3_client = boto3.client(
                's3',
                aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
                aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None),
                region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1')
            )
            
            # Generate S3 key from original URL
            import uuid
            s3_key = f"avatars/compressed_{uuid.uuid4()}.jpg"
            bucket_name = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', 'excursa')
            
            # Upload
            s3_client.upload_fileobj(
                file_object,
                bucket_name,
                s3_key,
                ExtraArgs={'ContentType': 'image/jpeg'}
            )
            
            # Generate URL
            url = f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
            return url
            
        except Exception as e:
            logger.error(f"Error uploading to S3: {e}")
            return original_url
