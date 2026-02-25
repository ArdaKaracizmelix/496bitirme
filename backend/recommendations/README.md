# Recommendations Module

The Recommendations module is a sophisticated recommendation engine for discovering and ranking Points of Interest (POIs) based on user preferences, context, and community trends.

## Architecture

### Components

1. **ScoringService**: Algorithm Service for ranking locations
   - Implements Content Based Filtering (Cosine Similarity)
   - Implements Context Aware Filtering (Distance, Rating)
   - Uses weighted hybrid approach for final scoring

2. **TrendAnalyzer**: Background service for trend analysis
   - Discovers underrated locations (Cold Start problem)
   - Identifies trending places (high velocity)
   - Analyzes seasonal patterns
   - Manages POI blacklisting

## Models

### Interaction
Records user interactions with POIs for reinforcement learning.

**Types**: VIEW, LIKE, SHARE, VISIT, CLICK, CHECK_IN

### Review
User reviews for POIs containing ratings and comments.

### TrendingList
Cached trending POIs for specific geographic areas (geohash).

### BlacklistedPOI
Temporarily blacklisted POIs due to negative feedback.

### SeasonalMetadata
Seasonal patterns and metadata for POIs.

## API Endpoints

### 1. Generate Recommendations
**POST** `/api/recommendations/generate/`

Request:
```json
{
    "user_id": "uuid-string",
    "context": {
        "user_location": {
            "latitude": 40.7128,
            "longitude": -74.0060
        },
        "radius_meters": 5000,
        "max_results": 10,
        "is_open_only": true,
        "time_of_day": "afternoon"
    }
}
```

Response:
```json
{
    "recommendations": [
        {
            "poi_id": "uuid",
            "poi_name": "Central Park",
            "latitude": 40.7829,
            "longitude": -73.9654,
            "category": "NATURE",
            "average_rating": 4.8,
            "final_score": 0.85,
            "similarity_score": 0.92,
            "distance_score": 0.88,
            "rating_score": 0.96,
            "distance_meters": 1250.5,
            "tags": ["nature", "outdoor", "park"]
        }
    ]
}
```

### 2. Get Underrated Places
**GET** `/api/recommendations/underrated/?geohash=ezs42`

Returns hidden gems - high-rated POIs with few reviews.

### 3. Get Trending Places
**GET** `/api/recommendations/trending/?geohash=ezs42`

Returns POIs with high velocity (recent interactions).

### 4. Record Interaction
**POST** `/api/recommendations/interactions/`

Request:
```json
{
    "user": "user-uuid",
    "poi": "poi-uuid",
    "interaction_type": "LIKE"
}
```

### 5. Create Review
**POST** `/api/recommendations/reviews/`

Request:
```json
{
    "user": "user-uuid",
    "poi": "poi-uuid",
    "rating": 4.5,
    "comment": "Great place!",
    "is_verified_purchase": true
}
```

### 6. Blacklist POI
**POST** `/api/recommendations/blacklist/`

Request:
```json
{
    "poi_id": "uuid",
    "reason": "Negative feedback spike",
    "duration_hours": 24
}
```

### 7. Analyze Seasonal Trends
**POST** `/api/recommendations/analyze-seasonal-trends/`

Triggers batch analysis of seasonal patterns.

## Scoring Formula

The final recommendation score combines three components:

```
Score = (Similarity * Weight_Interest) + 
         (Norm(Rating) * Weight_Rating) + 
         (Decay(Distance) * Weight_Distance)
```

### Default Weights
- **Weight_Interest**: 0.5 (Content based - user preference match)
- **Weight_Rate**: 0.3 (Global quality - POI rating)
- **Weight_Distance**: 0.2 (Proximity - distance from user)

### Components

1. **Similarity Score**: Cosine similarity between user preference vector and POI tags
   - Range: 0.0 to 1.0
   - Based on user interaction history

2. **Rating Score**: Normalized average POI rating
   - Formula: `average_rating / 5.0`
   - Range: 0.0 to 1.0

3. **Distance Score**: Exponential decay function
   - Formula: `exp(-distance_meters / 1000)`
   - At 1000m: ~0.37
   - At 5000m: ~0.0067

## Reinforcement Learning

User preference vectors are updated automatically when interactions occur:

| Interaction Type | Weight Increment |
|------------------|-----------------|
| VIEW             | 0.1             |
| CLICK            | 0.2             |
| LIKE             | 0.3             |
| SHARE            | 0.4             |
| VISIT            | 0.5             |
| CHECK_IN         | 0.6             |

## Configuration

### ScoringService Settings

```python
from recommendations.scoring_service import ScoringService

# Custom weights
service = ScoringService(
    weight_interest=0.5,
    weight_distance=0.2,
    weight_rating=0.3
)
```

### TrendAnalyzer Settings

```python
from recommendations.trend_analyzer import TrendAnalyzer

analyzer = TrendAnalyzer(
    underrated_threshold=50,      # Max reviews to be "underrated"
    high_rating_floor=4.5,        # Min rating for "good"
    cache_ttl=3600                # Cache TTL in seconds
)
```

## Usage Examples

### Python

```python
from recommendations.scoring_service import ScoringService
from recommendations.dtos import ContextDTO, PointDTO
from user.models import UserProfile

# Get user
user = UserProfile.objects.get(id='user-uuid')

# Create scoring service
scoring_service = ScoringService()

# Create context
context = ContextDTO(
    user_location=PointDTO(latitude=40.7128, longitude=-74.0060),
    radius_meters=5000,
    max_results=10
)

# Generate recommendations
recommendations = scoring_service.generate_recommendations(user, context)

# Process results
for rec in recommendations:
    print(f"{rec.poi_name}: {rec.final_score}")
```

### Batch Operations

```python
from recommendations.trend_analyzer import TrendAnalyzer

analyzer = TrendAnalyzer()

# Analyze seasonal trends
analyzer.analyze_seasonal_trends()

# Cleanup expired blacklist entries
expired_count = analyzer.cleanup_expired_blacklist()
print(f"Removed {expired_count} expired entries")
```

## Database Schema

### Tables

- `recommendations_interaction`: User-POI interactions
- `recommendations_review`: POI reviews and ratings
- `recommendations_trending_list`: Cached trending lists by geohash
- `recommendations_blacklisted_poi`: Blacklisted POIs with expiration
- `recommendations_seasonal_metadata`: Seasonal statistics by POI

### Indexes

All models have optimized indexes for fast queries:

- Interactions: (user, timestamp), (poi, timestamp)
- Reviews: (poi, rating), (created_at)
- TrendingList: (geohash)
- BlacklistedPOI: (expires_at)

## Performance Considerations

1. **Vector Caching**: User preference vectors are stored in UserProfile.preferences_vector (JSONField)
   - Updated incrementally with each interaction
   - No heavy linear algebra - O(n) cosine similarity

2. **Trending Cache**: TrendingList stores pre-computed trending lists
   - TTL: 1 hour (configurable)
   - Regenerated on-demand if expired

3. **Spatial Indexing**: PostGIS R-Tree indexes on location field
   - O(log n) distance queries
   - Supports geospatial filtering

4. **Geohash Optimization**: Reduces large geographic areas to indexable strings
   - geohash2 library for encoding/decoding
   - Enables efficient geographic grouping

## Testing

Run unit tests:

```bash
python manage.py test recommendations
```

## Future Enhancements

1. **Collaborative Filtering**: Add user-user similarity recommendations
2. **ML Models**: Integrate pre-trained embedding models (Word2Vec, FastText)
3. **Real-time Trending**: Cache trending data in Redis with Celery tasks
4. **A/B Testing**: Framework for testing different scoring weights
5. **Personalization**: Advanced user segments and cohort-based scoring
6. **Cold Start Mitigation**: Content-based recommendations for new users
7. **Popularity Decay**: Time-based decay for trending scores

## Troubleshooting

### No Recommendations Returned

1. Check if POIs exist in the database
2. Verify user ID and context location are correct
3. Confirm radius is large enough
4. Check for blacklisted POIs in the area

### Low Similarity Scores

1. User preference vector may be empty (new user)
2. POI tags may not match user interests
3. Increase WEIGHT_DISTANCE to favor proximity over preference

### Slow Queries

1. Ensure database indexes are created
2. Check PostGIS spatial indexes
3. Reduce search radius for faster results
4. Consider pagination for large result sets
