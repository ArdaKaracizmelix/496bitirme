"""
StorageService - Utility class for AWS S3 file operations.

This module provides an abstraction layer for S3 operations, allowing the
application to remain agnostic to the underlying cloud storage implementation.
It handles file uploads, deletions, and presigned URL generation.
"""
import os
import uuid
from typing import Optional
import boto3
from botocore.exceptions import ClientError
from django.core.files.uploadedfile import InMemoryUploadedFile


class StorageService:
    """
    Adapter/Utility class that wraps the AWS SDK (boto3) for S3 operations.
    
    This class provides a clean interface for file operations on AWS S3,
    including upload, delete, and presigned URL generation. It handles
    authentication via IAM credentials and maintains a connection to S3.
    """
    
    def __init__(
        self,
        bucket_name: str = None,
        region: str = None,
        aws_access_key_id: str = None,
        aws_secret_access_key: str = None,
        cdn_domain: str = None
    ):
        """
        Initialize the StorageService with AWS credentials and bucket details.
        
        Args:
            bucket_name (str): The name of the S3 bucket
            region (str): AWS Region (e.g., 'us-east-1')
            aws_access_key_id (str): AWS Access Key ID (from environment if not provided)
            aws_secret_access_key (str): AWS Secret Access Key (from environment if not provided)
            cdn_domain (str): Optional CloudFront domain for faster image delivery
        """
        self.bucket_name = bucket_name or os.getenv('AWS_STORAGE_BUCKET_NAME', 'excursa-uploads')
        self.region = region or os.getenv('AWS_S3_REGION_NAME', 'us-east-1')
        
        # Create S3 client with boto3
        self.s3_client = boto3.client(
            's3',
            region_name=self.region,
            aws_access_key_id=aws_access_key_id or os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=aws_secret_access_key or os.getenv('AWS_SECRET_ACCESS_KEY')
        )
        
        # Optional CloudFront domain for serving images faster
        self.cdn_domain = cdn_domain or os.getenv('AWS_CDN_DOMAIN')
    
    def upload_file(self, file_obj: InMemoryUploadedFile, path: str = '') -> str:
        """
        Upload a file to S3 with public-read ACL.
        
        This method:
        1. Generates a unique filename (UUID) to avoid conflicts
        2. Uploads the file stream to S3 with public-read ACL
        3. Returns the full public URL for the uploaded file
        
        Args:
            file_obj (InMemoryUploadedFile): The file to upload
            path (str): Optional path prefix (e.g., 'posts/', 'avatars/')
            
        Returns:
            str: The full public URL to the uploaded file
            
        Raises:
            ClientError: If S3 upload fails
        """
        try:
            # Generate unique filename with UUID
            file_ext = os.path.splitext(file_obj.name)[1]
            unique_filename = f"{uuid.uuid4()}{file_ext}"
            
            # Construct the full S3 key
            s3_key = f"{path}{unique_filename}" if path else unique_filename
            
            # Upload file to S3 with public-read ACL
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                s3_key,
                ExtraArgs={
                    'ContentType': file_obj.content_type
                }
            )
            
            # Generate URL - use CDN domain if configured, otherwise direct S3 URL
            if self.cdn_domain:
                url = f"https://{self.cdn_domain}/{s3_key}"
            else:
                url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            
            return url
        
        except ClientError as e:
            raise ClientError(
                {'Error': {'Code': str(e), 'Message': f'Failed to upload file: {str(e)}'}},
                'PutObject'
            )
    
    def delete_file(self, file_url: str) -> bool:
        """
        Delete a file from S3 by parsing the URL and issuing a delete command.
        
        This method:
        1. Parses the S3 URL to extract the object key
        2. Issues a delete command to S3
        3. Returns success/failure status
        
        Args:
            file_url (str): The full URL of the file to delete
            
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        try:
            # Parse the S3 key from the URL
            s3_key = self._extract_key_from_url(file_url)
            
            if not s3_key:
                return False
            
            # Delete the object from S3
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            return True
        
        except ClientError as e:
            return False
    
    def generate_presigned_url(self, filename: str, expiration: int = 3600) -> str:
        """
        Generate a temporary presigned URL allowing direct upload from the frontend.
        
        This is useful for large file uploads, allowing the frontend to upload
        directly to S3 without going through the backend, reducing server load.
        
        Args:
            filename (str): The desired filename for the upload
            expiration (int): URL expiration time in seconds (default: 1 hour)
            
        Returns:
            str: A presigned URL for direct S3 upload
            
        Raises:
            ClientError: If presigned URL generation fails
        """
        try:
            # Generate unique key for the file
            file_ext = os.path.splitext(filename)[1]
            unique_filename = f"{uuid.uuid4()}{file_ext}"
            
            # Generate presigned POST URL
            response = self.s3_client.generate_presigned_post(
                self.bucket_name,
                unique_filename,
                ExpiresIn=expiration,
                Conditions=[
                    ['content-length-range', 0, 100 * 1024 * 1024],  # Max 100MB
                    ['starts-with', '$Content-Type', 'image/']
                ]
            )
            
            return response['url']
        
        except ClientError as e:
            raise ClientError(
                {'Error': {'Code': str(e), 'Message': f'Failed to generate presigned URL: {str(e)}'}},
                'GeneratePresignedPost'
            )
    
    def check_existence(self, file_url: str) -> bool:
        """
        Verify if a file actually exists in the S3 bucket.
        
        This is useful for data integrity checks before processing or
        displaying images to ensure the file hasn't been deleted.
        
        Args:
            file_url (str): The full URL of the file to check
            
        Returns:
            bool: True if file exists, False otherwise
        """
        try:
            s3_key = self._extract_key_from_url(file_url)
            
            if not s3_key:
                return False
            
            # Try to get the object metadata
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            return True
        
        except self.s3_client.exceptions.NoSuchKey:
            return False
        except ClientError:
            return False
    
    def _extract_key_from_url(self, url: str) -> Optional[str]:
        """
        Extract the S3 object key from a file URL.
        
        Handles both CDN and direct S3 URLs.
        
        Args:
            url (str): The file URL
            
        Returns:
            Optional[str]: The S3 object key, or None if parsing fails
        """
        try:
            # Handle CDN domain URLs
            if self.cdn_domain and self.cdn_domain in url:
                # Format: https://cdn.domain/key
                return url.split(f"{self.cdn_domain}/", 1)[1]
            
            # Handle direct S3 URLs
            # Format: https://bucket-name.s3.region.amazonaws.com/key
            if '.s3.' in url and '.amazonaws.com/' in url:
                return url.split('.amazonaws.com/', 1)[1]
            
            # Handle path-style S3 URLs
            # Format: https://s3.region.amazonaws.com/bucket-name/key
            if 's3.' in url and '.amazonaws.com/' in url:
                parts = url.split('.amazonaws.com/', 1)
                if len(parts) == 2:
                    path_parts = parts[1].split('/', 1)
                    if len(path_parts) == 2:
                        return path_parts[1]
            
            return None
        
        except Exception:
            return None
