## Locations App - Geospatial Core

The locations app implements the geo-spatial domain with three main components:

### 1. **POI Model** (Point of Interest)
Entity representing a physical location with geospatial data stored in PostGIS.

**Key Features:**
- UUID primary key with auto-generation
- PostGIS PointField for spatial queries (SRID=4326)
- Category enumeration (HISTORICAL, NATURE, FOOD, ENTERTAINMENT)
- Cached average_rating for performance
- External ID for third-party data sync
- JSON metadata and tags for flexible storage
- Timestamp tracking (created_at, updated_at)

**Methods:**
- `save()` - Validates coordinates and triggers cache invalidation
- `distance_to(target_point)` - Calculate geodesic distance using PostGIS ST_Distance
- `get_lat_lon()` - Returns coordinates in tuple format (lat, lon)

### 2. **GeoService** (Domain Service)
Encapsulates all spatial business logic, isolating database queries behind a clean API.

**Methods:**
- `find_nearby(center: Point, radius_m: int, filters: Dict)` - PostGIS ST_DWithin query with optional category/rating filters
- `find_in_viewport(bbox: Polygon)` - Retrieve POIs within bounding box (map screen)
- `get_cluster_aggregates(bbox: Polygon, zoom: int)` - Grid-based clustering for performance optimization
- `encode_geohash(lat: float, lon: float, precision: int)` - Generate geohash for Redis caching
- `is_location_valid(lat: float, lon: float)` - Validate coordinate bounds

### 3. **ExternalSyncService** (Integration Service)
Adapter between internal POI model and third-party data providers (Google Places, Foursquare).

**Attributes:**
- `GOOGLE_API_KEY` - Google Places API credential
- `FSQ_API_KEY` - Foursquare API credential  
- `rate_limiter` - RateLimiter instance for quota management

**Methods:**
- `fetch_and_sync(lat: float, lon: float)` - Fetches from external APIs and syncs POIs, returns count of new records
- `upsert_poi(data: ExternalPlaceDTO)` - Upsert logic: updates if external_id exists, creates new otherwise
- `refresh_metadata(poi: POI)` - Updates volatile data (ratings, descriptions) if data is stale (>7 days)
- `map_category(external_cat: str)` - Normalizes external category strings to internal enums

### API Endpoints

#### POI CRUD Operations
- `GET /api/locations/pois/` - List all POIs
- `POST /api/locations/pois/` - Create new POI
- `GET /api/locations/pois/{id}/` - Retrieve specific POI
- `PUT /api/locations/pois/{id}/` - Update POI
- `DELETE /api/locations/pois/{id}/` - Delete POI

#### Spatial Queries
- `GET /api/locations/pois/nearby/?latitude=X&longitude=Y&radius=Z&category=FOOD&min_rating=4.0`
  Find POIs within radius with optional filters

- `GET /api/locations/pois/viewport/?north=N&south=S&east=E&west=W`
  Get POIs within map viewport (bounding box)

- `GET /api/locations/pois/clusters/?north=N&south=S&east=E&west=W&zoom=Z`
  Get clustered POIs at specific zoom level for performance optimization

- `GET /api/locations/pois/{id}/distance/?latitude=X&longitude=Y`
  Calculate distance from POI to target location (returns meters and km)

#### Admin Operations (Staff Only)
- `POST /api/locations/pois/sync_external/`
  Trigger external data sync for location
  ```json
  {"latitude": X, "longitude": Y}
  ```
  Returns: Count of new POIs added

- `POST /api/locations/pois/{id}/refresh_metadata/`
  Refresh metadata for specific POI from external source
  Returns: Success status

### Database Schema
```
locations_poi
├── id (UUID) - Primary Key
├── name (String)
├── address (String)
├── location (PointField, SRID=4326)
├── category (String, choices)
├── average_rating (Float, default: 0.0)
├── external_id (String, unique, nullable)
├── metadata (JSON)
├── tags (JSON Array)
├── created_at (DateTime)
├── updated_at (DateTime)
└── Indexes: external_id, category
```

### Dependencies
- `django-gis` - GIS database support
- `Geohash` - Geohash encoding for spatial caching
- `requests` - HTTP client for external API calls
- `psycopg` - PostgreSQL adapter with PostGIS support

### Configuration
The app requires:
1. PostgreSQL database with PostGIS extension enabled
2. Django settings configured with PostGIS backend:
   ```python
   DATABASES = {
       'default': {
           'ENGINE': 'django.contrib.gis.db.backends.postgis',
           ...
       }
   }
   INSTALLED_APPS = [
       'django.contrib.gis',
       'locations',
       ...
   ]
   ```

### Migration
Create initial migration:
```bash
python manage.py makemigrations locations
python manage.py migrate locations
```

### Rate Limiting
External API calls are rate-limited to prevent exceeding third-party quota limits. Configure in `ExternalSyncService`:
```python
rate_limiter = RateLimiter(calls_per_minute=60)
```
