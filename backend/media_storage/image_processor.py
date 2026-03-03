"""
ImageProcessor - Utility class for image processing and optimization.

This module provides image processing capabilities including compression,
resizing, format conversion and metadata removal. It leverages the Pillow
(PIL) library for CPU-bound image operations, typically executed via Celery tasks.
"""
import io
from typing import Tuple
from PIL import Image
from django.core.files.uploadedfile import InMemoryUploadedFile


class ImageProcessor:
    """
    CPU-bound utility class leveraging the Pillow (PIL) library.
    
    This class ensures all user-uploaded content is standardized, safe,
    and optimized for network transmission. Image processing typically
    runs inside a Celery Task.
    """
    
    # Maximum allowed image resolution (width, height)
    MAX_DIMENSION: Tuple[int, int] = (4096, 4096)
    
    # JPEG quality setting (1-100). Balance between visual fidelity and file size
    COMPRESSION_QUALITY: int = 80
    
    # Whitelist of allowed image formats
    ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp']
    
    @classmethod
    def optimize(cls, image: InMemoryUploadedFile) -> InMemoryUploadedFile:
        """
        Optimize an image for web delivery.
        
        This method:
        1. Opens the image stream from the InMemoryUploadedFile
        2. Converts format to JPEG or WebP for better compression
        3. Resizes if dimensions exceed MAX_DIMENSION (preserves aspect ratio)
        4. Saves with optimize=True and quality=80 for balanced file size
        5. Returns the processed file as an InMemoryUploadedFile
        
        Args:
            image (InMemoryUploadedFile): The uploaded image file
            
        Returns:
            InMemoryUploadedFile: The optimized image file ready for upload
            
        Raises:
            ValueError: If image format is not allowed or image is invalid
        """
        try:
            # Open the image from the uploaded file
            pil_image = Image.open(image)
            
            # Ensure image is in RGB mode (not RGBA, grayscale, etc.)
            if pil_image.mode in ('RGBA', 'LA', 'P'):
                rgb_image = Image.new('RGB', pil_image.size, (255, 255, 255))
                rgb_image.paste(pil_image, mask=pil_image.split()[-1] if pil_image.mode == 'RGBA' else None)
                pil_image = rgb_image
            elif pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            
            # Resize if necessary (preserve aspect ratio)
            if pil_image.width > cls.MAX_DIMENSION[0] or pil_image.height > cls.MAX_DIMENSION[1]:
                pil_image.thumbnail(cls.MAX_DIMENSION, Image.Resampling.LANCZOS)
            
            # Determine output format (prefer JPEG for compatibility)
            output_format = 'JPEG'
            file_extension = '.jpg'
            
            # Save to bytes buffer with optimization
            output_buffer = io.BytesIO()
            pil_image.save(
                output_buffer,
                format=output_format,
                optimize=True,
                quality=cls.COMPRESSION_QUALITY
            )
            output_buffer.seek(0)
            
            # Create InMemoryUploadedFile with the processed image
            processed_image = InMemoryUploadedFile(
                output_buffer,
                'ImageField',
                f"{image.name.split('.')[0]}{file_extension}",
                'image/jpeg',
                output_buffer.getbuffer().nbytes,
                None
            )
            
            return processed_image
        
        except Exception as e:
            raise ValueError(f"Failed to optimize image: {str(e)}")
    
    @classmethod
    def create_thumbnail(cls, image: InMemoryUploadedFile, size: Tuple[int, int]) -> InMemoryUploadedFile:
        """
        Generate a small thumbnail version of an image.
        
        This is useful for list views and map markers where full-resolution
        images aren't necessary, improving perceived performance.
        
        Args:
            image (InMemoryUploadedFile): The original image file
            size (Tuple[int, int]): Desired thumbnail dimensions (width, height)
            
        Returns:
            InMemoryUploadedFile: The thumbnail image file
            
        Raises:
            ValueError: If image cannot be processed
        """
        try:
            # Open the image
            pil_image = Image.open(image)
            
            # Ensure RGB mode
            if pil_image.mode != 'RGB':
                if pil_image.mode == 'RGBA':
                    rgb_image = Image.new('RGB', pil_image.size, (255, 255, 255))
                    rgb_image.paste(pil_image, mask=pil_image.split()[-1])
                    pil_image = rgb_image
                else:
                    pil_image = pil_image.convert('RGB')
            
            # Create thumbnail (preserves aspect ratio)
            pil_image.thumbnail(size, Image.Resampling.LANCZOS)
            
            # Save thumbnail
            output_buffer = io.BytesIO()
            pil_image.save(
                output_buffer,
                format='JPEG',
                optimize=True,
                quality=85
            )
            output_buffer.seek(0)
            
            # Create InMemoryUploadedFile
            thumbnail = InMemoryUploadedFile(
                output_buffer,
                'ImageField',
                f"thumb_{image.name.split('.')[0]}.jpg",
                'image/jpeg',
                output_buffer.getbuffer().nbytes,
                None
            )
            
            return thumbnail
        
        except Exception as e:
            raise ValueError(f"Failed to create thumbnail: {str(e)}")
    
    @classmethod
    def validate_image(cls, file: InMemoryUploadedFile) -> bool:
        """
        Security check: Validate that file is a real image using magic bytes.
        
        This prevents malicious scripts from being uploaded disguised as images.
        Reads the file header (magic bytes) to verify the actual file type.
        
        Args:
            file (InMemoryUploadedFile): The file to validate
            
        Returns:
            bool: True if file is a valid image, False otherwise
        """
        try:
            # Read the first few bytes (magic bytes) to verify file type
            file.seek(0)
            header = file.read(16)
            file.seek(0)
            
            # JPEG: FF D8 FF
            if header[:3] == b'\xff\xd8\xff':
                return True
            
            # PNG: 89 50 4E 47
            if header[:4] == b'\x89PNG':
                return True
            
            # GIF: 47 49 46
            if header[:3] == b'GIF':
                return True
            
            # WebP: RIFF ... WEBP
            if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
                return True
            
            return False
        
        except Exception:
            return False
    
    @classmethod
    def strip_metadata(cls, image: InMemoryUploadedFile) -> InMemoryUploadedFile:
        """
        Remove EXIF data and other metadata from an image for privacy.
        
        EXIF data can contain sensitive information like GPS coordinates,
        camera model, and timestamp. This method removes that information.
        
        Args:
            image (InMemoryUploadedFile): The image to strip metadata from
            
        Returns:
            InMemoryUploadedFile: The cleaned image without metadata
            
        Raises:
            ValueError: If image cannot be processed
        """
        try:
            # Open image
            pil_image = Image.open(image)
            
            # Ensure RGB mode
            if pil_image.mode != 'RGB':
                if pil_image.mode == 'RGBA':
                    rgb_image = Image.new('RGB', pil_image.size, (255, 255, 255))
                    rgb_image.paste(pil_image, mask=pil_image.split()[-1])
                    pil_image = rgb_image
                else:
                    pil_image = pil_image.convert('RGB')
            
            # Create new image without EXIF data
            # This creates a copy with no metadata
            data = list(pil_image.getdata())
            image_without_exif = Image.new(pil_image.mode, pil_image.size)
            image_without_exif.putdata(data)
            
            # Save to buffer
            output_buffer = io.BytesIO()
            image_without_exif.save(
                output_buffer,
                format='JPEG',
                optimize=True,
                quality=cls.COMPRESSION_QUALITY
            )
            output_buffer.seek(0)
            
            # Return as InMemoryUploadedFile
            cleaned_image = InMemoryUploadedFile(
                output_buffer,
                'ImageField',
                image.name,
                'image/jpeg',
                output_buffer.getbuffer().nbytes,
                None
            )
            
            return cleaned_image
        
        except Exception as e:
            raise ValueError(f"Failed to strip metadata: {str(e)}")
