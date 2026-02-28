"""
MongoDB models for the community app using mongoengine.
"""
from mongoengine import (
    Document, StringField, ListField, ReferenceField,
    EmbeddedDocument, EmbeddedDocumentField, DateTimeField,
    UUIDField, URLField, ObjectIdField
)
from datetime import datetime, time
from django.utils import timezone
import uuid


class EmbeddedComment(EmbeddedDocument):
    """Nested comment object embedded within SocialPost for fast retrieval."""
    user_id = UUIDField(required=True)
    text = StringField(required=True, max_length=500)
    timestamp = DateTimeField(default=timezone.now)


class SocialPost(Document):
    """
    MongoDB document model for user-generated social media posts.
    Embeds related data (comments, likes) for optimized read performance
    in "News Feed" use case.
    """
    
    class Visibility(str):
        PUBLIC = "PUBLIC"
        FOLLOWERS = "FOLLOWERS"
        PRIVATE = "PRIVATE"
    
    # Foreign reference to the PostgreSQL User table
    user_ref_id = UUIDField(required=True)
    
    # Post content
    content = StringField(required=True, max_length=5000)
    
    # Array of S3 URLs pointing to photos or videos
    media_urls = ListField(URLField(), default=list)
    
    # Location reference (as an embedded document or dict)
    location = StringField(null=True, blank=True)
    
    # Array of User IDs who liked the post
    likes = ListField(UUIDField(), default=list)
    
    # Nested array of comment objects for fast retrieval without joins
    comments = ListField(EmbeddedDocumentField(EmbeddedComment), default=list)
    
    # Timestamp for sorting the feed (created_at)
    created_at = DateTimeField(default=timezone.now, db_field='created_at')
    
    # Visibility enum: PUBLIC, FOLLOWERS, PRIVATE
    visibility = StringField(
        choices=[Visibility.PUBLIC, Visibility.FOLLOWERS, Visibility.PRIVATE],
        default=Visibility.PUBLIC
    )
    
    # Tags for categorization and filtering
    tags = ListField(StringField(), default=list)
    
    meta = {
        'collection': 'social_posts',
        'indexes': [
            'user_ref_id',
            '-created_at',
            'tags',
            'visibility'
        ]
    }
    
    def add_comment(self, user_id: uuid.UUID, text: str) -> None:
        """
        Appends a new comment object (user_id, text, timestamp) to the comments array.
        
        Args:
            user_id: UUID of the user posting the comment
            text: Comment text content
        """
        comment = EmbeddedComment(user_id=user_id, text=text)
        self.comments.append(comment)
        self.save()
    
    def toggle_like(self, user_id: uuid.UUID) -> bool:
        """
        Checks if user_id exists in likes array. If yes, removes it; if no, adds it.
        Returns the new state (True if liked, False if unliked).
        
        Args:
            user_id: UUID of the user toggling the like
            
        Returns:
            bool: True if post is now liked by user, False if unliked
        """
        if user_id in self.likes:
            self.likes.remove(user_id)
            self.save()
            return False
        else:
            self.likes.append(user_id)
            self.save()
            return True
    
    @classmethod
    def get_recent_posts(cls, limit: int = 10, skip: int = 0):
        """
        Returns a paginated list of public posts sorted by created_at descending.
        
        Args:
            limit: Number of posts to load per request (page size)
            skip: Number of posts to skip for pagination
            
        Returns:
            QuerySet: Paginated cursor of public posts
        """
        return cls.objects(visibility=cls.Visibility.PUBLIC).order_by('-created_at').skip(skip).limit(limit)
