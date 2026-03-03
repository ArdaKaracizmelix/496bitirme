"""
Celery task integration for media processing.

This module demonstrates how to use the media app's services with Celery
for asynchronous image processing, useful for high-volume uploads.
"""
from celery import shared_task
from django.core.files.uploadedfile import InMemoryUploadedFile
from .storage_service import StorageService
from .image_processor import ImageProcessor
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_and_upload_image_task(self, image_data: bytes, filename: str, path: str = 'posts/'):
    """
    Asynchronous task to process and upload an image.
    
    Workflow:
    1. Receives image data and filename
    2. Creates an InMemoryUploadedFile
    3. Validates, cleans metadata and optimizes the image
    4. Uploads to S3
    5. Returns the public URL
    
    Args:
        image_data: Raw bytes of the image
        filename: Original filename
        path: S3 path prefix (default: 'posts/')
        
    Returns:
        Dictionary with 'url', 'filename', and 'file_size'
    """
    try:
        from io import BytesIO
        
        # Create InMemoryUploadedFile from bytes
        image_file = InMemoryUploadedFile(
            BytesIO(image_data),
            'ImageField',
            filename,
            'image/jpeg',
            len(image_data),
            None
        )
        
        # Validate image
        if not ImageProcessor.validate_image(image_file):
            raise ValueError('Invalid image file')
        
        # Process image
        image_file.seek(0)
        cleaned = ImageProcessor.strip_metadata(image_file)
        optimized = ImageProcessor.optimize(cleaned)
        
        # Upload to S3
        storage = StorageService()
        url = storage.upload_file(optimized, path=path)
        
        result = {
            'url': url,
            'filename': optimized.name,
            'file_size': optimized.size,
            'status': 'success'
        }
        
        logger.info(f"Image processed and uploaded: {url}")
        return result
    
    except Exception as exc:
        logger.error(f"Error processing image {filename}: {str(exc)}")
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def delete_image_task(self, file_url: str):
    """
    Asynchronous task to delete an image from S3.
    
    Useful for cleanup operations when posts are deleted.
    
    Args:
        file_url: Full URL of the file to delete
        
    Returns:
        Dictionary with 'success' status and 'url'
    """
    try:
        storage = StorageService()
        success = storage.delete_file(file_url)
        
        result = {
            'url': file_url,
            'success': success,
            'status': 'deleted' if success else 'failed'
        }
        
        logger.info(f"Image deletion task completed: {file_url}")
        return result
    
    except Exception as exc:
        logger.error(f"Error deleting image {file_url}: {str(exc)}")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def verify_image_integrity_task(self, file_url: str):
    """
    Asynchronous task to verify image integrity in S3.
    
    Useful for periodic checks to ensure media integrity.
    
    Args:
        file_url: Full URL of the file to verify
        
    Returns:
        Dictionary with 'exists' status and 'url'
    """
    try:
        storage = StorageService()
        exists = storage.check_existence(file_url)
        
        result = {
            'url': file_url,
            'exists': exists,
            'status': 'verified'
        }
        
        if not exists:
            logger.warning(f"Image integrity check failed: {file_url} not found in S3")
        
        return result
    
    except Exception as exc:
        logger.error(f"Error verifying image integrity {file_url}: {str(exc)}")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
