"""
Domain service for managing the user's Home Feed and recommended content.
Handles aggregation of followed users' posts and trending content.
"""
from typing import List, Optional
from datetime import datetime, timedelta
from django.utils import timezone
from .models import SocialPost
import uuid
import math


class FeedService:
    """
    Domain service responsible for curating the user's "Home Feed".
    Aggregates content from followed users and mixes in trending content
    based on popularity algorithms.
    """
    
    # Number of posts to load per request
    PAGE_SIZE = 20
    
    # Multiplier for engagement (Likes + Comments) when calculating rank
    TRENDING_WEIGHT = 1.5
    
    def __init__(self):
        pass
    
    def generate_feed(self, user_id: uuid.UUID, following_ids: List[uuid.UUID], cursor: Optional[str] = None) -> tuple[List[dict], Optional[str]]:
        """
        Generates a home feed for the user by:
        1. Fetching list of IDs the user follows (from PostgreSQL User table)
        2. Querying MongoDB for posts where user_ref_id IN following_list
        3. Injecting "Trending" posts every 5th item
        4. Returning hybrid list with pagination cursor
        
        Args:
            user_id: UUID of the user whose feed is being generated
            following_ids: List of UUIDs the user is following (from PostgreSQL)
            cursor: Optional pagination cursor (timestamp)
            
        Returns:
            Tuple of (list of PostDTOs, next_cursor for pagination)
        """
        # Parse cursor if provided (use created_at timestamp)
        skip = 0
        created_at_filter = None
        if cursor:
            try:
                created_at_filter = datetime.fromisoformat(cursor)
            except ValueError:
                pass
        
        # Query MongoDB for posts from followed users
        query = SocialPost.objects(user_ref_id__in=following_ids, visibility__in=['PUBLIC', 'FOLLOWERS'])
        
        if created_at_filter:
            query = query(created_at__lt=created_at_filter)
        
        # Order by created_at descending
        posts = query.order_by('-created_at').limit(self.PAGE_SIZE + 5)  # Extra for trending injection
        
        # Convert to DTOs
        feed_posts = []
        trending_posts = []
        post_count = 0
        
        for post in posts:
            post_dto = self._post_to_dto(post)
            feed_posts.append(post_dto)
            post_count += 1
        
        # Inject trending posts every 5th item
        final_feed = []
        for idx, post in enumerate(feed_posts):
            final_feed.append(post)
            
            # Every 5th post, try to inject a trending post
            if (idx + 1) % 5 == 0:
                trending = self.get_trending_posts(exclude_ids=[p['id'] for p in final_feed])
                if trending:
                    final_feed.append(trending[0])
        
        # Limit to PAGE_SIZE
        final_feed = final_feed[:self.PAGE_SIZE]
        
        # Generate next cursor
        next_cursor = None
        if len(feed_posts) >= self.PAGE_SIZE:
            last_post = final_feed[-1] if final_feed else None
            if last_post:
                next_cursor = last_post.get('created_at')
        
        return final_feed, next_cursor
    
    def calculate_virality_score(self, post: SocialPost) -> float:
        """
        Calculates virality/popularity score for ranking trending content.
        
        Formula: score = (Likes * 1.0) + (Comments * 2.0) / (HoursSincePosted + 2)^1.5
        
        Args:
            post: SocialPost document
            
        Returns:
            float: Virality score for ranking
        """
        likes = len(post.likes)
        comments = len(post.comments)
        
        hours_since_posted = (timezone.now() - post.created_at).total_seconds() / 3600
        
        numerator = (likes * 1.0) + (comments * 2.0)
        denominator = (hours_since_posted + 2) ** 1.5
        
        score = numerator / denominator
        return score
    
    def get_explore_feed(self, interest_tag: str, limit: int = 10) -> List[dict]:
        """
        Returns popular posts filtered by a specific interest tag for the Discover tab.
        Posts are ranked by virality score.
        
        Args:
            interest_tag: Tag to filter posts by (e.g., 'travel', 'food')
            limit: Number of posts to return
            
        Returns:
            List of top PostDTOs filtered by interest tag
        """
        # Query posts with the interest tag
        posts = SocialPost.objects(
            tags=interest_tag,
            visibility='PUBLIC'
        ).order_by('-created_at').limit(limit * 2)  # Get more to sort by score
        
        # Score and sort by virality
        scored_posts = []
        for post in posts:
            score = self.calculate_virality_score(post)
            dto = self._post_to_dto(post)
            scored_posts.append((score, dto))
        
        # Sort by score descending
        scored_posts.sort(key=lambda x: x[0], reverse=True)
        
        # Return just the DTOs, limited
        return [dto for _, dto in scored_posts[:limit]]
    
    def get_trending_posts(self, limit: int = 5, exclude_ids: Optional[List[str]] = None) -> List[dict]:
        """
        Returns trending posts ranked by virality score.
        Used for injecting into home feed every 5th item.
        
        Args:
            limit: Number of trending posts to return
            exclude_ids: List of post IDs to exclude
            
        Returns:
            List of top trending PostDTOs
        """
        exclude_ids = exclude_ids or []
        
        # Get recent posts from all public accounts
        recent_hours = 24
        cutoff_time = timezone.now() - timedelta(hours=recent_hours)
        
        posts = SocialPost.objects(
            created_at__gte=cutoff_time,
            visibility='PUBLIC',
            _id__nin=exclude_ids
        ).limit(100)  # Score all recent posts
        
        # Calculate virality scores
        scored_posts = []
        for post in posts:
            score = self.calculate_virality_score(post)
            dto = self._post_to_dto(post)
            scored_posts.append((score, dto))
        
        # Sort by score and return top ones
        scored_posts.sort(key=lambda x: x[0], reverse=True)
        return [dto for _, dto in scored_posts[:limit]]
    
    def delete_post(self, post_id: str, user_id: uuid.UUID) -> bool:
        """
        Deletes a post after verifying ownership.
        Performs a hard delete from the MongoDB collection.
        
        Args:
            post_id: ObjectId of the post to delete
            user_id: UUID of the user attempting to delete
            
        Returns:
            bool: True if deletion successful, False if not owned by user
        """
        try:
            post = SocialPost.objects(id=post_id).first()
            
            if not post:
                return False
            
            # Verify ownership
            if post.user_ref_id != user_id:
                return False
            
            # Hard delete
            post.delete()
            return True
        except Exception:
            return False
    
    def _post_to_dto(self, post: SocialPost) -> dict:
        """
        Converts a SocialPost document to a DTO dictionary for API responses.
        
        Args:
            post: SocialPost MongoDB document
            
        Returns:
            dict: Post data transfer object
        """
        return {
            'id': str(post.id),
            'user_ref_id': str(post.user_ref_id),
            'content': post.content,
            'media_urls': post.media_urls,
            'location': post.location,
            'likes_count': len(post.likes),
            'comments_count': len(post.comments),
            'comments': [
                {
                    'user_id': str(c.user_id),
                    'text': c.text,
                    'timestamp': c.timestamp.isoformat()
                } for c in post.comments
            ],
            'tags': post.tags,
            'created_at': post.created_at.isoformat(),
            'visibility': post.visibility,
            'virality_score': self.calculate_virality_score(post)
        }
