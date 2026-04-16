"""
API views for media upload, processing, and management.
Provides endpoints for file uploads, image optimization, and storage operations.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from django.http import JsonResponse
from .storage_service import StorageService
from .image_processor import ImageProcessor
from .serializers import (
    ImageUploadSerializer, FileUploadSerializer, MultipleFileUploadSerializer,
    FileUploadResponseSerializer, PresignedUrlSerializer, PresignedUrlResponseSerializer,
    FileExistenceCheckSerializer, FileExistenceResponseSerializer
)
import logging

logger = logging.getLogger(__name__)


class MediaUploadViewSet(viewsets.ViewSet):
    """
    ViewSet for media upload operations.
    Provides endpoints for uploading images and files with optional processing.
    """
    permission_classes = [AllowAny]
    storage_service = None
    
    def get_storage_service(self):
        """Get or initialize StorageService instance."""
        if not self.storage_service:
            self.storage_service = StorageService()
        return self.storage_service
    
    @action(detail=False, methods=['post'], url_path='images')
    def upload_image(self, request):
        """
        Upload and optimize a single image.
        
        The image is:
        1. Validated for authenticity (magic bytes check)
        2. Metadata stripped for privacy (EXIF removal)
        3. Optimized (resized, compressed) if optimize=true
        4. Uploaded to S3 with public-read ACL
        
        Expected multipart form data:
        - file: The image file
        - optimize: Whether to optimize (default: true)
        """
        serializer = ImageUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            image_file = serializer.validated_data['file']
            optimize = serializer.validated_data.get('optimize', True)
            
            # Strip metadata for privacy
            cleaned_image = ImageProcessor.strip_metadata(image_file)
            
            # Optimize if requested
            if optimize:
                cleaned_image = ImageProcessor.optimize(cleaned_image)
            
            # Upload to S3
            storage = self.get_storage_service()
            url = storage.upload_file(cleaned_image, path='posts/')
            if url.startswith('/'):
                url = request.build_absolute_uri(url)
            
            response_data = {
                'url': url,
                'filename': cleaned_image.name,
                'file_size': cleaned_image.size,
                'content_type': cleaned_image.content_type
            }
            
            response_serializer = FileUploadResponseSerializer(response_data)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.error(f"Image upload failed: {str(e)}")
            return Response(
                {'error': f'Image upload failed: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'], url_path='batch')
    def upload_batch(self, request):
        """
        Upload multiple images at once.
        
        Useful for posts with multiple photos. Each image is processed
        independently and uploaded.
        
        Expected multipart form data:
        - files: Multiple image files (max 10)
        """
        serializer = MultipleFileUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            files = serializer.validated_data['files']
            uploaded_urls = []
            errors = []
            
            storage = self.get_storage_service()
            
            for file in files:
                try:
                    # Validate image
                    if not ImageProcessor.validate_image(file):
                        errors.append({
                            'filename': file.name,
                            'error': 'Not a valid image'
                        })
                        continue
                    
                    # Strip metadata and optimize
                    file.seek(0)
                    cleaned = ImageProcessor.strip_metadata(file)
                    optimized = ImageProcessor.optimize(cleaned)
                    
                    # Upload
                    url = storage.upload_file(optimized, path='posts/')
                    uploaded_urls.append({
                        'url': url,
                        'filename': file.name,
                        'file_size': optimized.size,
                        'content_type': optimized.content_type
                    })
                
                except Exception as e:
                    errors.append({
                        'filename': file.name,
                        'error': str(e)
                    })
            
            return Response({
                'uploaded': uploaded_urls,
                'errors': errors,
                'total_uploaded': len(uploaded_urls)
            }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.error(f"Batch upload failed: {str(e)}")
            return Response(
                {'error': f'Batch upload failed: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'], url_path='presigned-url')
    def generate_presigned_url(self, request):
        """
        Generate a presigned URL for direct frontend-to-S3 upload.
        
        This endpoint returns a temporary URL that allows the frontend to upload
        files directly to S3 without going through the backend, useful for large files.
        
        Request body:
        - filename: The desired filename
        - expiration: URL validity in seconds (default: 3600, max: 86400)
        """
        serializer = PresignedUrlSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            filename = serializer.validated_data['filename']
            expiration = serializer.validated_data.get('expiration', 3600)
            
            storage = self.get_storage_service()
            url = storage.generate_presigned_url(filename, expiration)
            
            response_data = {
                'url': url,
                'filename': filename,
                'expiration': expiration
            }
            
            response_serializer = PresignedUrlResponseSerializer(response_data)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        
        except Exception as e:
            logger.error(f"Presigned URL generation failed: {str(e)}")
            return Response(
                {'error': f'Failed to generate presigned URL: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'], url_path='check-existence')
    def check_file_existence(self, request):
        """
        Check if a file exists in S3.
        
        Useful for data integrity checks before processing or displaying content.
        
        Request body:
        - file_url: The URL of the file to check
        """
        serializer = FileExistenceCheckSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            file_url = serializer.validated_data['file_url']
            
            storage = self.get_storage_service()
            exists = storage.check_existence(file_url)
            
            response_data = {
                'exists': exists,
                'url': file_url
            }
            
            response_serializer = FileExistenceResponseSerializer(response_data)
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        
        except Exception as e:
            logger.error(f"Existence check failed: {str(e)}")
            return Response(
                {'error': f'Failed to check file existence: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'], url_path='delete')
    def delete_file(self, request):
        """
        Delete a file from S3.
        
        Used when users delete posts or update their content.
        
        Request body:
        - file_url: The URL of the file to delete
        """
        serializer = FileExistenceCheckSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            file_url = serializer.validated_data['file_url']
            
            storage = self.get_storage_service()
            success = storage.delete_file(file_url)
            
            if success:
                return Response(
                    {'message': 'File deleted successfully', 'url': file_url},
                    status=status.HTTP_200_OK
                )
            else:
                return Response(
                    {'error': 'Failed to delete file'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        except Exception as e:
            logger.error(f"File deletion failed: {str(e)}")
            return Response(
                {'error': f'Failed to delete file: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
