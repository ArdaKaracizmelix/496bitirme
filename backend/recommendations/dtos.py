"""
Data Transfer Objects (DTOs) for context passing and results in the recommendation system.
"""
from dataclasses import dataclass, field
from typing import List, Optional
from uuid import UUID


@dataclass
class PointDTO:
    """Represents a geographic point (latitude, longitude)"""
    latitude: float
    longitude: float


@dataclass
class ContextDTO:
    """
    Context information passed to the recommendation engine.
    Contains user location, time and other contextual data.
    """
    user_location: PointDTO
    time_of_day: Optional[str] = None  # 'morning', 'afternoon', 'evening', 'night'
    is_open_only: bool = True  # Filter only open locations
    radius_meters: float = 5000.0  # Search radius in meters
    max_results: int = 10  # Number of recommendations to return


@dataclass
class ScoredPOI:
    """
    POI with its computed recommendation score.
    Returned by ScoringService.generate_recommendations().
    """
    poi_id: UUID
    poi_name: str
    latitude: float
    longitude: float
    category: str
    average_rating: float
    final_score: float
    
    # Breakdown of score components
    similarity_score: float = 0.0
    distance_score: float = 0.0
    rating_score: float = 0.0
    
    # Additional metadata
    distance_meters: Optional[float] = None
    tags: List[str] = field(default_factory=list)
    
    def __lt__(self, other):
        """For sorting recommendations by score (highest first)"""
        return self.final_score > other.final_score
