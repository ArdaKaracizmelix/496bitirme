# Community App Documentation

## Overview
The **Community App** is a Django application that implements a social media posting and feed system for the Excursa platform. It uses MongoDB (via mongoengine) for NoSQL document storage of social posts and integrates with the existing PostgreSQL user system.

## Architecture

### Data Models
- **SocialPost**: MongoDB document model storing user-generated posts with embedded comments and likes
- **EmbeddedComment**: Nested MongoDB document for comments within posts

### Services
- **FeedService**: Domain service for feed generation, trending content, and feed algorithms

## API Endpoints

### Post Management
- **POST** `/api/community/posts/` - Create a new post
- **GET** `/api/community/posts/` - List recent public posts
- **GET** `/api/community/posts/{id}/` - Retrieve a specific post
- **PATCH** `/api/community/posts/{id}/` - Update a post (owner only)
- **DELETE** `/api/community/posts/{id}/` - Delete a post (owner only)

### Feed Endpoints
- **GET** `/api/community/posts/feed/` - Get home feed for authenticated user
  - Aggregates posts from followed users
  - Injects trending posts every 5th item
  - Supports cursor-based pagination
  
- **GET** `/api/community/posts/explore/?interest=TAG` - Get discover feed
  - Returns popular posts filtered by interest tag
  - Ranked by virality score
  
- **GET** `/api/community/posts/trending/` - Get trending posts
  - Ranked by virality score from last 24 hours

### Interactions
- **POST** `/api/community/posts/{id}/add_comment/` - Add comment to post
- **POST** `/api/community/posts/{id}/toggle_like/` - Toggle like on post

### User Posts
- **GET** `/api/community/user/{user_id}/posts/` - Get all public posts by user

## Virality Score Formula
```
score = (Likes * 1.0) + (Comments * 2.0) / (HoursSincePosted + 2)^1.5
```

This formula gives higher scores to:
- Posts with more engagement (likes and comments)
- Recent posts (exponentially weighted)
- Comments have 2x weight compared to likes

## Database Integration

### PostgreSQL (Existing)
Used for:
- User authentication and profiles
- User follow relationships
- User preferences

### MongoDB (New)
Used for:
- Social posts storage
- Embedded comments (denormalized for fast reads)
- Likes (list of UUIDs)
- Tags for categorization

**Why MongoDB?**
- Embedded comments and likes optimize read performance for "News Feed" queries
- Denormalized data avoids expensive joins
- Flexible schema for future social features
- Horizontal scalability for high volume reads

## Configuration

### Environment Variables
```
# MongoDB
MONGO_DB_NAME=excursa_community
MONGO_HOST=mongo
MONGO_PORT=27017
MONGO_USER=admin
MONGO_PASSWORD=admin_pass
```

### Docker Setup
The `docker-compose.yml` includes a MongoDB service with:
- Health checks
- Persistent volumes
- Proper networking with backend service
- Same network as PostgreSQL and backend

## Integration with Existing Systems

### User System
- Posts reference user IDs via `user_ref_id` (UUID from PostgreSQL)
- Feed generation uses user's following list from PostgreSQL
- Comments and likes use UUIDs from PostgreSQL User table

### Recommendations System
- Feed service can integrate with recommendation engine
- Trending posts can contribute to user preference vectors
- Tags help with content classification

### Locations System
- Posts have `location` field for geospatial content
- Can enable location-based discovery in future

## Example API Usage

### Create a Post
```bash
curl -X POST http://localhost:8000/api/community/posts/ \
  -H "Content-Type: application/json" \
  -d {
    "content": "Amazing view at the beach!",
    "media_urls": ["https://s3.amazonaws.com/photo.jpg"],
    "location": "Miami Beach",
    "tags": ["beach", "travel"],
    "visibility": "PUBLIC"
  }
```

### Get Home Feed
```bash
curl http://localhost:8000/api/community/posts/feed/ \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Add Comment
```bash
curl -X POST http://localhost:8000/api/community/posts/{post_id}/add_comment/ \
  -H "Content-Type: application/json" \
  -d {"text": "Beautiful!"}
```

### Toggle Like
```bash
curl -X POST http://localhost:8000/api/community/posts/{post_id}/toggle_like/
```

## Future Enhancements
- Full-text search in posts
- Hashtag trending
- Location-based feed
- Direct messaging
- Post recommendations based on user preferences
- Real-time notifications
- Post sharing/reposting
- Analytics and insights
