"""
DRF Serializers for SocialPost model and related data.
Handles conversion between API requests/responses and MongoDB documents.
"""
from rest_framework import serializers
from .models import SocialPost, EmbeddedComment
import uuid


class EmbeddedCommentSerializer(serializers.Serializer):
    """Serializer for embedded comment objects."""
    user_id = serializers.UUIDField()
    text = serializers.CharField(max_length=500)
    timestamp = serializers.DateTimeField(read_only=True)


class PostDTO(serializers.Serializer):
    """
    Data Transfer Object for SocialPost.
    Used for API responses with computed fields like virality score.
    """
    id = serializers.CharField(read_only=True)
    user_ref_id = serializers.UUIDField()
    content = serializers.CharField(max_length=5000)
    media_urls = serializers.ListField(
        child=serializers.URLField(),
        required=False,
        default=list
    )
    location = serializers.CharField(required=False, allow_null=True)
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.IntegerField(read_only=True)
    comments = EmbeddedCommentSerializer(many=True, read_only=True)
    tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list
    )
    created_at = serializers.DateTimeField(read_only=True)
    visibility = serializers.ChoiceField(
        choices=['PUBLIC', 'FOLLOWERS', 'PRIVATE'],
        default='PUBLIC'
    )
    virality_score = serializers.FloatField(read_only=True)


class SocialPostCreateSerializer(serializers.Serializer):
    """Serializer for creating a new social post."""
    content = serializers.CharField(max_length=5000)
    media_urls = serializers.ListField(
        child=serializers.URLField(),
        required=False,
        default=list
    )
    location = serializers.CharField(required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list
    )
    visibility = serializers.ChoiceField(
        choices=['PUBLIC', 'FOLLOWERS', 'PRIVATE'],
        default='PUBLIC'
    )
    
    def create(self, validated_data):
        """Create a new SocialPost document."""
        post = SocialPost(
            content=validated_data['content'],
            media_urls=validated_data.get('media_urls', []),
            location=validated_data.get('location'),
            tags=validated_data.get('tags', []),
            visibility=validated_data['visibility'],
            user_ref_id=self.context['user_id']  # From request context
        )
        post.save()
        return post


class SocialPostUpdateSerializer(serializers.Serializer):
    """Serializer for updating a social post."""
    content = serializers.CharField(max_length=5000, required=False)
    media_urls = serializers.ListField(
        child=serializers.URLField(),
        required=False
    )
    location = serializers.CharField(required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.CharField(),
        required=False
    )
    visibility = serializers.ChoiceField(
        choices=['PUBLIC', 'FOLLOWERS', 'PRIVATE'],
        required=False
    )


class AddCommentSerializer(serializers.Serializer):
    """Serializer for adding a comment to a post."""
    text = serializers.CharField(max_length=500)


class ToggleLikeSerializer(serializers.Serializer):
    """Serializer for toggling a like on a post."""
    liked = serializers.BooleanField(read_only=True)


class CommentListSerializer(serializers.Serializer):
    """Serializer for listing comments of a post."""
    user_id = serializers.UUIDField()
    text = serializers.CharField()
    timestamp = serializers.DateTimeField()


class FeedSerializer(serializers.Serializer):
    """Serializer for feed response with pagination cursor."""
    posts = PostDTO(many=True)
    next_cursor = serializers.CharField(allow_null=True, required=False)
