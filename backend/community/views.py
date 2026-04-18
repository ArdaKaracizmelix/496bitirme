"""
API views for community app endpoints.
Handles social post CRUD, feed generation, comments, and likes.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from mongoengine.queryset.visitor import Q
from .models import SocialPost
from .serializers import (
    PostDTO, SocialPostCreateSerializer, SocialPostUpdateSerializer,
    AddCommentSerializer, FeedSerializer
)
from .services import FeedService
from notifications.services import NotificationService
import uuid


class SocialPostViewSet(viewsets.ViewSet):
    """
    ViewSet for SocialPost CRUD operations and interactions.
    Uses mongoengine backend for MongoDB document storage.
    """
    
    permission_classes = [AllowAny]
    service = FeedService()

    def _viewer_profile_id(self, request):
        if request.user.is_authenticated:
            return request.user.profile.id
        return None
    
    def list(self, request):
        """List recent public posts with pagination."""
        limit = int(request.query_params.get('limit', 10))
        skip = int(request.query_params.get('skip', 0))
        
        posts = SocialPost.get_recent_posts(limit=limit + 1, skip=skip)  # Get one more to determine next page
        post_list = list(posts)
        
        has_next = len(post_list) > limit
        if has_next:
            post_list = post_list[:limit]
        
        serializer = PostDTO(
            [self.service._post_to_dto(p, current_user_id=self._viewer_profile_id(request)) for p in post_list],
            many=True
        )
        
        # Generate next page cursor
        next_cursor = None
        if has_next and len(post_list) > 0:
            next_cursor = skip + limit
        
        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
            'nextPageCursor': next_cursor
        })
    
    def create(self, request):
        """Create a new social post."""
        serializer = SocialPostCreateSerializer(
            data=request.data,
            context={'user_id': request.user.profile.id if request.user.is_authenticated else None}
        )
        
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        if serializer.is_valid():
            post = serializer.save()
            response = PostDTO(self.service._post_to_dto(post, current_user_id=self._viewer_profile_id(request)))
            return Response(response.data, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a specific post by ID."""
        try:
            post = SocialPost.objects(id=pk).first()
            if not post:
                return Response(
                    {'error': 'Post not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = PostDTO(self.service._post_to_dto(post, current_user_id=self._viewer_profile_id(request)))
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def update(self, request, pk=None):
        """Update a post (only content, media, tags, visibility)."""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            post = SocialPost.objects(id=pk).first()
            if not post:
                return Response(
                    {'error': 'Post not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Verify ownership
            if post.user_ref_id != request.user.profile.id:
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            serializer = SocialPostUpdateSerializer(data=request.data)
            if serializer.is_valid():
                # Update fields
                if 'content' in serializer.validated_data:
                    post.content = serializer.validated_data['content']
                if 'media_urls' in serializer.validated_data:
                    post.media_urls = serializer.validated_data['media_urls']
                if 'location' in serializer.validated_data:
                    post.location = serializer.validated_data['location']
                if 'tags' in serializer.validated_data:
                    post.tags = serializer.validated_data['tags']
                if 'route_data' in serializer.validated_data:
                    post.route_data = serializer.validated_data['route_data'] or {}
                if 'visibility' in serializer.validated_data:
                    post.visibility = serializer.validated_data['visibility']
                
                post.save()
                response = PostDTO(self.service._post_to_dto(post, current_user_id=self._viewer_profile_id(request)))
                return Response(response.data)
            
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    def destroy(self, request, pk=None):
        """Delete a post (soft delete - only by owner)."""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        success = self.service.delete_post(pk, request.user.profile.id)
        
        if not success:
            return Response(
                {'error': 'Post not found or permission denied'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        return Response(
            {'success': True, 'message': 'Post deleted'},
            status=status.HTTP_204_NO_CONTENT
        )
    
    @action(detail=False, methods=['get'])
    def feed(self, request):
        """
        Generate home feed for authenticated user.
        Aggregates posts from followed users and injects trending posts.
        """
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        user_profile = request.user.profile
        
        # Get list of users this profile is following from the explicit relation table.
        # This avoids any ambiguity in many-to-many resolution and is safer for visibility checks.
        from user.models import FollowRelation
        following_ids = list(
            FollowRelation.objects.filter(follower=user_profile).values_list('following_id', flat=True)
        )
        
        # Add self to get own posts too
        following_ids.append(user_profile.id)
        
        cursor = request.query_params.get('cursor')
        
        posts, next_cursor = self.service.generate_feed(
            user_profile.id,
            following_ids,
            cursor
        )
        
        response = {
            'posts': posts,
            'next_cursor': next_cursor
        }
        return Response(response)
    
    @action(detail=False, methods=['get'])
    def explore(self, request):
        """
        Get discover/explore feed filtered by interest tag.
        Returns trending posts by virality score.
        """
        interest = request.query_params.get('interest', 'popular')
        limit = int(request.query_params.get('limit', 10))
        
        posts = self.service.get_explore_feed(
            interest,
            limit,
            current_user_id=self._viewer_profile_id(request)
        )
        
        serializer = PostDTO(posts, many=True)
        return Response({
            'interest': interest,
            'count': len(serializer.data),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def trending(self, request):
        """
        Get trending posts ranked by virality score.
        """
        limit = int(request.query_params.get('limit', 10))
        
        posts = self.service.get_trending_posts(
            limit,
            current_user_id=self._viewer_profile_id(request)
        )
        
        serializer = PostDTO(posts, many=True)
        return Response({
            'count': len(serializer.data),
            'results': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search posts by query string.
        Searches in content and tags.
        """
        query = request.query_params.get('q', '')
        limit = int(request.query_params.get('limit', 10))
        skip = int(request.query_params.get('skip', 0))
        
        if not query:
            return Response({
                'results': [],
                'count': 0
            })
        
        try:
            # Search in content or tags (case-insensitive)
            posts = SocialPost.objects(
                visibility=SocialPost.Visibility.PUBLIC
            ).filter(
                Q(content__icontains=query) | Q(tags__icontains=query.lower())
            ).order_by('-created_at').skip(skip).limit(limit)
            
            serializer = PostDTO(
                [self.service._post_to_dto(p, current_user_id=self._viewer_profile_id(request)) for p in posts],
                many=True
            )
            return Response({
                'query': query,
                'count': len(serializer.data),
                'results': serializer.data
            })
        except Exception as e:
            return Response({
                'error': str(e),
                'results': [],
                'count': 0
            })
    
    
    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        """Add a comment to a post."""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            post = SocialPost.objects(id=pk).first()
            if not post:
                return Response(
                    {'error': 'Post not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = AddCommentSerializer(data=request.data)
            if serializer.is_valid():
                post.add_comment(request.user.profile.id, serializer.validated_data['text'])
                comment = post.comments[-1] if post.comments else None
                NotificationService.notify_post_comment(post, comment, request.user.profile)
                response = PostDTO(self.service._post_to_dto(post, current_user_id=self._viewer_profile_id(request)))
                return Response(response.data)
            
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def toggle_like(self, request, pk=None):
        """Toggle a like on a post."""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        try:
            post = SocialPost.objects(id=pk).first()
            if not post:
                return Response(
                    {'error': 'Post not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            liked = post.toggle_like(request.user.profile.id)
            if liked:
                NotificationService.notify_post_like(post, request.user.profile)
            
            return Response({
                'liked': liked,
                'post': self.service._post_to_dto(post, current_user_id=self._viewer_profile_id(request))
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def comments(self, request, pk=None):
        """Get comments for a post."""
        limit = int(request.query_params.get('limit', 20))
        skip = int(request.query_params.get('skip', 0))
        
        try:
            post = SocialPost.objects(id=pk).first()
            if not post:
                return Response(
                    {'error': 'Post not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Get comments with pagination
            comments = post.comments[skip:skip + limit]
            
            return Response({
                'total_count': len(post.comments),
                'count': len(comments),
                'results': [
                    self.service._comment_to_dto(c) for c in comments
                ]
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def toggle_save(self, request, pk=None):
        """Toggle save/bookmark on a post."""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            post = SocialPost.objects(id=pk).first()
            if not post:
                return Response(
                    {'error': 'Post not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            saved = post.toggle_save(request.user.profile.id)
            if saved:
                NotificationService.notify_post_save(post, request.user.profile)

            return Response({
                'saved': saved,
                'post': self.service._post_to_dto(post, current_user_id=self._viewer_profile_id(request))
            })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'])
    def saved(self, request):
        """List posts saved by the authenticated user."""
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        limit = int(request.query_params.get('limit', 10))
        skip = int(request.query_params.get('skip', 0))

        posts = SocialPost.objects(
            saved_by=request.user.profile.id,
            visibility__in=['PUBLIC', 'FOLLOWERS']
        ).order_by('-created_at').skip(skip).limit(limit + 1)
        post_list = list(posts)

        has_next = len(post_list) > limit
        if has_next:
            post_list = post_list[:limit]

        serializer = PostDTO(
            [self.service._post_to_dto(p, current_user_id=self._viewer_profile_id(request)) for p in post_list],
            many=True
        )

        next_cursor = skip + limit if has_next else None
        return Response({
            'count': len(serializer.data),
            'results': serializer.data,
            'nextPageCursor': next_cursor
        })


class UserPostsView(APIView):
    """API endpoint for retrieving all posts by a specific user."""
    
    permission_classes = [AllowAny]
    service = FeedService()

    def _viewer_profile_id(self, request):
        if request.user.is_authenticated:
            return request.user.profile.id
        return None
    
    def get(self, request, user_id):
        """Get all public posts by a user."""
        limit = int(request.query_params.get('limit', 10))
        skip = int(request.query_params.get('skip', 0))
        
        try:
            posts = SocialPost.objects(
                user_ref_id=uuid.UUID(user_id),
                visibility='PUBLIC'
            ).order_by('-created_at').skip(skip).limit(limit)
            
            serializer = PostDTO(
                [self.service._post_to_dto(p, current_user_id=self._viewer_profile_id(request)) for p in posts],
                many=True
            )
            
            return Response({
                'user_id': user_id,
                'count': len(serializer.data),
                'results': serializer.data
            })
        except ValueError:
            return Response(
                {'error': 'Invalid user_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
