"""
DRF Serializers for media upload and processing.
Handles file validation and response formatting for file upload endpoints.
"""
from rest_framework import serializers
from .image_processor import ImageProcessor


class FileUploadSerializer(serializers.Serializer):
    """
    Serializer for single file uploads.
    Validates file type and basic properties.
    """
    file = serializers.FileField()
    
    def validate_file(self, file):
        """Validate the uploaded file."""
        # Check file size (max 100MB)
        max_size = 100 * 1024 * 1024  # 100MB
        if file.size > max_size:
            raise serializers.ValidationError('File size exceeds 100MB limit')
        
        return file


class ImageUploadSerializer(serializers.Serializer):
    """
    Serializer for image uploads with validation.
    Validates that the file is a real image.
    """
    file = serializers.ImageField()
    optimize = serializers.BooleanField(default=True, required=False)
    
    def validate_file(self, file):
        """Validate the uploaded image file."""
        # Check file size
        max_size = 100 * 1024 * 1024  # 100MB
        if file.size > max_size:
            raise serializers.ValidationError('File size exceeds 100MB limit')
        
        # Validate that it's a real image
        if not ImageProcessor.validate_image(file):
            raise serializers.ValidationError('File is not a valid image')
        
        return file


class MultipleFileUploadSerializer(serializers.Serializer):
    """
    Serializer for multiple file uploads.
    Handles batch file uploads for posts.
    """
    files = serializers.ListField(child=serializers.FileField())
    
    def validate_files(self, files):
        """Validate multiple files."""
        if len(files) > 10:
            raise serializers.ValidationError('Maximum 10 files allowed per upload')
        
        max_size = 100 * 1024 * 1024  # 100MB per file
        for file in files:
            if file.size > max_size:
                raise serializers.ValidationError(
                    f'File "{file.name}" exceeds 100MB limit'
                )
        
        return files


class FileUploadResponseSerializer(serializers.Serializer):
    """Response schema for successful file uploads."""
    url = serializers.URLField()
    filename = serializers.CharField()
    file_size = serializers.IntegerField()
    content_type = serializers.CharField()


class PresignedUrlSerializer(serializers.Serializer):
    """Request/Response for presigned URL generation."""
    filename = serializers.CharField(max_length=255)
    expiration = serializers.IntegerField(default=3600, min_value=300, max_value=86400)


class PresignedUrlResponseSerializer(serializers.Serializer):
    """Response schema for presigned URL."""
    url = serializers.URLField()
    filename = serializers.CharField()
    expiration = serializers.IntegerField()


class FileExistenceCheckSerializer(serializers.Serializer):
    """Request/Response for checking file existence."""
    file_url = serializers.URLField()


class FileExistenceResponseSerializer(serializers.Serializer):
    """Response schema for existence check."""
    exists = serializers.BooleanField()
    url = serializers.URLField()
