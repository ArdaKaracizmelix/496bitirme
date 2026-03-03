"""
Models for media app.

Note: The media app primarily uses utility services (StorageService, ImageProcessor)
and does not require Django models since it doesn't store state except through S3.
URLs are stored in other apps (e.g., community.SocialPost.media_urls).
"""
# No models needed - this app provides utility services only
