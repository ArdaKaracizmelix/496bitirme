"""
ScoringService: The core algorithmic engine for the recommendation system.
Implements weighted hybrid approach using Content Based Filtering and Context Aware Filtering.
"""
import math
from typing import List, Dict, Optional, Tuple
from django.contrib.gis.geos import Point
from locations.models import POI
from user.models import UserProfile
from recommendations.dtos import ContextDTO, ScoredPOI, PointDTO
from recommendations.models import Interaction, InteractionType, BlacklistedPOI


class ScoringService:
    """
    Algorithm Service: Core recommendation engine that ranks locations using:
    1. Content Based Filtering (Cosine Similarity of vectors)
    2. Context Aware Filtering (Distance, Open Status)
    """
    
    # Default weights for the weighted scoring formula
    WEIGHT_INTEREST = 0.5  # Coefficient for interest vector match
    WEIGHT_DISTANCE = 0.2  # Coefficient for proximity score
    WEIGHT_RATING = 0.3   # Coefficient for global rating score
    
    # Vector dimension for embeddings
    vector_dimension = 100
    
    def __init__(self, weight_interest: float = 0.5, weight_distance: float = 0.2, weight_rating: float = 0.3):
        """Initialize scoring service with custom weights if provided"""
        self.WEIGHT_INTEREST = weight_interest
        self.WEIGHT_DISTANCE = weight_distance
        self.WEIGHT_RATING = weight_rating
        
        # Validate that weights sum to approximately 1.0
        total_weight = weight_interest + weight_distance + weight_rating
        if abs(total_weight - 1.0) > 0.01:
            print(f"Warning: Weights sum to {total_weight}, consider normalizing")
    
    def generate_recommendations(self, user: UserProfile, context: ContextDTO) -> List[ScoredPOI]:
        """
        Orchestrator method that generates top-k recommendations for a user.
        
        Steps:
        1. Fetch candidate POIs within context radius
        2. Compute scores for each candidate
        3. Filter blacklisted POIs
        4. Return top-k sorted by score
        
        Args:
            user: UserProfile instance
            context: ContextDTO with location, radius and filtering options
            
        Returns:
            List[ScoredPOI]: Top-k sorted results by score (highest first)
        """
        # Step 1: Convert context point to Django GIS Point
        user_point = Point(context.user_location.longitude, context.user_location.latitude, srid=4326)
        
        # Step 2: Query candidate POIs within radius
        from django.contrib.gis.db.models.functions import Distance as DistanceFunc
        from django.db.models import F
        
        candidate_pois = POI.objects.annotate(
            distance=DistanceFunc('location', user_point)
        ).filter(
            distance__lte=context.radius_meters
        ).exclude(
            blacklist_entry__isnull=False  # Exclude blacklisted POIs
        )
        
        if context.is_open_only and 'is_open' in POI._meta.get_fields():
            candidate_pois = candidate_pois.filter(is_open=True)
        
        # Step 3: Score each candidate POI
        scored_pois: List[ScoredPOI] = []
        for poi in candidate_pois:
            try:
                distance_meters = poi.distance.m if hasattr(poi, 'distance') else None
                final_score, sim_score, dist_score, rating_score = self.compute_score(
                    poi=poi,
                    user=user,
                    distance=distance_meters
                )
                
                scored_poi = ScoredPOI(
                    poi_id=poi.id,
                    poi_name=poi.name,
                    latitude=poi.location.y,
                    longitude=poi.location.x,
                    category=poi.category,
                    average_rating=poi.average_rating,
                    final_score=final_score,
                    similarity_score=sim_score,
                    distance_score=dist_score,
                    rating_score=rating_score,
                    distance_meters=distance_meters,
                    tags=poi.tags
                )
                scored_pois.append(scored_poi)
            except Exception as e:
                print(f"Error scoring POI {poi.id}: {str(e)}")
                continue
        
        # Step 4: Sort by score (highest first) and return top-k
        scored_pois.sort(key=lambda x: x.final_score, reverse=True)
        return scored_pois[:context.max_results]
    
    def calculate_similarity(self, user_vec: List[float], poi_vec: List[float]) -> float:
        """
        Computes Cosine Similarity between user preference vector and POI tag vector.
        
        Formula: cos(θ) = (A · B) / (||A|| * ||B||)
        
        Args:
            user_vec: User's preference embedding vector
            poi_vec: POI's tag embedding vector
            
        Returns:
            float: Cosine similarity score between 0.0 and 1.0
        """
        if not user_vec or not poi_vec:
            return 0.0
        
        # Ensure both vectors have the same dimension
        min_len = min(len(user_vec), len(poi_vec))
        user_vec = user_vec[:min_len]
        poi_vec = poi_vec[:min_len]
        
        # Calculate dot product
        dot_product = sum(u * p for u, p in zip(user_vec, poi_vec))
        
        # Calculate magnitudes
        user_magnitude = math.sqrt(sum(u ** 2 for u in user_vec))
        poi_magnitude = math.sqrt(sum(p ** 2 for p in poi_vec))
        
        # Avoid division by zero
        if user_magnitude == 0 or poi_magnitude == 0:
            return 0.0
        
        # Calculate cosine similarity
        similarity = dot_product / (user_magnitude * poi_magnitude)
        
        # Clamp to [0.0, 1.0]
        return max(0.0, min(1.0, similarity))
    
    def compute_score(self, poi: POI, user: UserProfile, distance: Optional[float]) -> Tuple[float, float, float, float]:
        """
        Calculates the final weighted score combining interest, distance, and rating.
        
        Formula:
        Score = (Similarity * W_I) + (Norm(Rating) * W_R) + (Decay(Distance) * W_D)
        
        Where:
        - Similarity: Cosine similarity between user vector and POI tags
        - Norm(Rating): Normalized rating (0.0 to 1.0)
        - Decay(Distance): Exponential decay function for distance
        
        Args:
            poi: POI instance
            user: UserProfile instance
            distance: Distance in meters from user to POI (optional)
            
        Returns:
            Tuple[float, float, float, float]: (final_score, similarity_score, distance_score, rating_score)
        """
        # 1. Calculate similarity score
        user_vector = self._get_user_vector(user)
        poi_vector = self._get_poi_vector(poi)
        similarity_score = self.calculate_similarity(user_vector, poi_vector)
        
        # 2. Calculate normalized rating score
        rating_score = poi.average_rating / 5.0 if poi.average_rating else 0.0
        
        # 3. Calculate distance decay score
        distance_score = self._calculate_distance_decay(distance) if distance else 1.0
        
        # 4. Calculate weighted final score
        final_score = (
            (similarity_score * self.WEIGHT_INTEREST) +
            (rating_score * self.WEIGHT_RATING) +
            (distance_score * self.WEIGHT_DISTANCE)
        )
        
        return final_score, similarity_score, distance_score, rating_score
    
    def update_user_vector(self, user_id: str, interaction: InteractionType) -> None:
        """
        Reinforcement Learning: Modifies user's preference vector based on recent interactions.
        Increases the weight of tags from the interacted POI in the user's preference vector.
        
        Args:
            user_id: UUID string of the user
            interaction: InteractionType (VIEW, LIKE, SHARE, VISIT, CLICK, CHECK_IN)
        """
        try:
            user_profile = UserProfile.objects.get(id=user_id)
        except UserProfile.DoesNotExist:
            print(f"User {user_id} not found")
            return
        
        # Get the most recent interaction
        recent_interactions = Interaction.objects.filter(
            user=user_profile,
            interaction_type=interaction
        ).order_by('-timestamp')[:1]
        
        if not recent_interactions:
            return
        
        recent_interaction = recent_interactions[0]
        poi_tags = recent_interaction.poi.tags
        
        if not poi_tags or not isinstance(poi_tags, list):
            return
        
        # Determine weight increment based on interaction type
        weight_map = {
            InteractionType.VIEW: 0.1,
            InteractionType.LIKE: 0.3,
            InteractionType.SHARE: 0.4,
            InteractionType.VISIT: 0.5,
            InteractionType.CLICK: 0.2,
            InteractionType.CHECK_IN: 0.6,
        }
        
        weight_increment = weight_map.get(interaction, 0.1)
        
        # Update the user's preference vector with POI tags
        for tag in poi_tags:
            user_profile.update_vector(tag, weight_increment)
    
    # Helper methods
    def _get_user_vector(self, user: UserProfile) -> List[float]:
        """
        Get or create user's preference vector.
        If preferences_vector is empty, returns a neutral vector.
        """
        if not user.preferences_vector:
            return [0.0] * self.vector_dimension
        
        # Convert dictionary of tags to vector
        # A simplified version
        vector = [0.0] * self.vector_dimension
        
        if isinstance(user.preferences_vector, dict):
            # Normalize tag weights
            max_weight = max(user.preferences_vector.values()) if user.preferences_vector else 1.0
            if max_weight == 0:
                max_weight = 1.0
            
            for i, (tag, weight) in enumerate(sorted(user.preferences_vector.items())):
                if i < self.vector_dimension:
                    vector[i] = weight / max_weight
        
        return vector
    
    def _get_poi_vector(self, poi: POI) -> List[float]:
        """
        Get POI's tag vector for similarity calculation.
        Converts tag list to numerical vector.
        """
        vector = [0.0] * self.vector_dimension
        
        if poi.tags and isinstance(poi.tags, list):
            # Simple approach: distribute tag weights across vector dimensions
            for i, tag in enumerate(poi.tags[:self.vector_dimension]):
                vector[i] = 1.0 / len(poi.tags)
        
        return vector
    
    def _calculate_distance_decay(self, distance_meters: float) -> float:
        """
        Calculate exponential decay function for distance.
        Closer POIs get higher scores.
        
        Formula: score = exp(-distance / 1000)
        This means at 1000m, the score is ~0.37, at 5000m it's effectively 0.
        """
        if not distance_meters or distance_meters < 0:
            return 1.0
        
        # Exponential decay with 1000m as the decay constant
        decay = math.exp(-distance_meters / 1000.0)
        return max(0.0, decay)
