# Media & Storage Module

The **Media & Storage Module** is a Django application that abstracts file handling logic, ensuring the application server remains stateless and performs efficiently by offloading heavy media operations.

## Overview

This module provides two core utility classes:

1. **StorageService** - Adapter wrapping AWS S3 (boto3) for file operations
2. **ImageProcessor** - CPU-bound utility using Pillow for image optimization

## Architecture

### Core Components

#### StorageService
A facade pattern implementation that wraps AWS S3 operations:
- **File Upload**: Generates UUIDs, uploads with public ACL, returns S3 URL
- **File Deletion**: Parses S3 URLs, issues delete commands
- **Presigned URLs**: Generates temporary URLs for direct frontend-to-S3 uploads
- **Existence Checks**: Verifies file availability before processing

**Attributes:**
- `bucket_name`: S3 bucket name
- `region`: AWS region (e.g., 'us-east-1')
- `s3_client`: Authenticated boto3 S3 client
- `cdn_domain`: Optional CloudFront domain for content delivery

**Methods:**
- `upload_file(file_obj, path)` → String: Uploads file and returns public URL
- `delete_file(file_url)` → Boolean: Deletes file from S3
- `generate_presigned_url(filename)` → String: Creates temporary upload URL
- `check_existence(file_url)` → Boolean: Verifies file exists in bucket

#### ImageProcessor
CPU-bound utility class using Pillow for image operations (typically run in Celery tasks):
- **Optimization**: Resizes, compresses, converts to JPEG/WebP
- **Thumbnails**: Creates small versions for UI
- **Validation**: Checks magic bytes to prevent malicious uploads
- **Metadata Removal**: Strips EXIF data for user privacy

**Attributes:**
- `MAX_DIMENSION`: (4096, 4096) - Maximum image resolution
- `COMPRESSION_QUALITY`: 80 - JPEG quality setting
- `ALLOWED_FORMATS`: ['jpg', 'jpeg', 'png', 'webp']

**Methods:**
- `optimize(image)` → ContentFile: Compresses and resizes for web
- `create_thumbnail(image, size)` → ContentFile: Generates small preview
- `validate_image(file)` → Boolean: Verifies file is real image
- `strip_metadata(image)` → Image: Removes EXIF data

## API Endpoints

### 1. Upload Single Image
**POST** `/api/media/images`

Uploads and optimizes a single image.

**Request:**
```multipart/form-data
file: <image_file>
optimize: true (optional, default: true)
```

**Response:**
```json
{
  "url": "https://bucket.s3.region.amazonaws.com/posts/uuid.jpg",
  "filename": "example.jpg",
  "file_size": 45230,
  "content_type": "image/jpeg"
}
```

### 2. Batch Upload Images
**POST** `/api/media/batch`

Uploads multiple images (max 10) with error handling per file.

**Request:**
```multipart/form-data
files: <image_file1>, <image_file2>, ..., <image_fileN>
```

**Response:**
```json
{
  "uploaded": [
    {
      "url": "https://bucket.s3.region.amazonaws.com/posts/uuid1.jpg",
      "filename": "photo1.jpg",
      "file_size": 45230,
      "content_type": "image/jpeg"
    }
  ],
  "errors": [
    {
      "filename": "bad_file.txt",
      "error": "Not a valid image"
    }
  ],
  "total_uploaded": 1
}
```

### 3. Generate Presigned URL
**POST** `/api/media/presigned-url`

Creates a temporary URL for direct frontend-to-S3 uploads (useful for large files).

**Request:**
```json
{
  "filename": "largefile.mp4",
  "expiration": 3600
}
```

**Response:**
```json
{
  "url": "https://s3.amazonaws.com/bucket?X-Amz-Signature=...",
  "filename": "largefile.mp4",
  "expiration": 3600
}
```

### 4. Check File Existence
**POST** `/api/media/check-existence`

Verifies if a file exists in S3.

**Request:**
```json
{
  "file_url": "https://bucket.s3.region.amazonaws.com/posts/uuid.jpg"
}
```

**Response:**
```json
{
  "exists": true,
  "url": "https://bucket.s3.region.amazonaws.com/posts/uuid.jpg"
}
```

### 5. Delete File
**POST** `/api/media/delete`

Removes a file from S3 (used when posts are deleted).

**Request:**
```json
{
  "file_url": "https://bucket.s3.region.amazonaws.com/posts/uuid.jpg"
}
```

**Response:**
```json
{
  "message": "File deleted successfully",
  "url": "https://bucket.s3.region.amazonaws.com/posts/uuid.jpg"
}
```

## Configuration

### Environment Variables

Add to `.env`:
```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_S3_REGION_NAME=us-east-1
AWS_STORAGE_BUCKET_NAME=excursa-uploads
AWS_CDN_DOMAIN=cdn.example.com  # Optional CloudFront domain
```

### Django Settings

The app is registered in `INSTALLED_APPS`:
```python
INSTALLED_APPS = [
    ...
    'media',
]
```

## Integration with Other Apps

### Community App
The **Community App** uses this module for social post media:
```python
# In community/views.py
url = storage_service.upload_file(image, path='posts/')
# Stores URL in SocialPost.media_urls field
```

### Other Apps
Any app needing file operations can use:
```python
from media.storage_service import StorageService
from media.image_processor import ImageProcessor

# Upload image
storage = StorageService()
url = storage.upload_file(image_file, path='avatars/')

# Optimize image
optimized = ImageProcessor.optimize(image_file)
```

## Best Practices

1. **Always validate uploads** - Use `ImageProcessor.validate_image()` before processing
2. **Strip metadata** - Call `strip_metadata()` before uploading to protect user privacy
3. **Optimize images** - Reduce bandwidth by calling `optimize()` for web delivery
4. **Use presigned URLs** - For large files, generate presigned URLs to bypass backend
5. **Error handling** - Wrap storage operations in try-except, log failures
6. **CDN configuration** - Use CloudFront for faster image delivery
7. **Cleanup** - Delete S3 files when posts are deleted

## Dependencies

- boto3 >= 1.26.0
- Pillow >= 9.0.0
- djangorestframework >= 3.14.0

## Testing

Run tests with:
```bash
python manage.py test media
```

Test coverage includes:
- S3 upload/delete operations
- Image validation and processing
- Presigned URL generation
- File existence checks
