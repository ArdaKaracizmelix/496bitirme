# Trips App Documentation

## Overview

The `trips` app implements the core trip/itinerary management functionality for the platform. It allows users to plan, organize, and share travel itineraries with specific routes and points of interest (POIs).

## Architecture

### Models

#### Itinerary (Entity/Database Model)
The primary entity representing a planned trip. It stores metadata about the trip and maintains relationships with POIs.

**Attributes:**
- `id` (UUID) - Primary key, auto-generated unique identifier
- `user` (ForeignKey<User>) - Reference to the trip owner
- `title` (String) - User-defined name for the trip
- `start_date` (DateTime) - Scheduled beginning of the trip
- `end_date` (DateTime) - Scheduled end of the trip
- `stops` (ManyToManyField<POI>) - Collection of places to visit (through ItineraryItem)
- `status` (Enum) - DRAFT, ACTIVE, COMPLETED, ARCHIVED
- `visibility` (Enum) - PRIVATE (default), PUBLIC (shared on feed)
- `estimated_cost` (Decimal) - Cached total cost based on POI metadata
- `created_at` (DateTime) - Auto-generated timestamp
- `updated_at` (DateTime) - Auto-updated timestamp

**Methods:**
- `get_total_duration()` → Integer - Sums dwell times + transit times between stops
- `clone(new_user: User)` → Itinerary - Creates a copy of a public itinerary for another user
- `generate_share_link()` → String - Creates a unique, signed URL for sharing

#### ItineraryItem (Through Model)
An intermediate table that links an Itinerary to a POI, storing the specific context of that visit.

**Attributes:**
- `itinerary` (ForeignKey) - Reference to parent trip
- `poi` (ForeignKey) - Reference to the location being visited
- `order_index` (Integer) - Sequence number (0, 1, 2...) in the route
- `arrival_time` (Time) - Scheduled arrival time at this stop
- `notes` (String) - User's personal notes about the stop
- `created_at` (DateTime) - Auto-generated timestamp
- `updated_at` (DateTime) - Auto-updated timestamp

### Services

#### RouteOptimizer (Domain Service)
A domain service that solves the Traveling Salesman Problem (TSP) to find the optimal route for a set of stops.

**Components:**
- `TransportMode` (Enum) - DRIVING, WALKING, CYCLING, TRANSIT
- `DistanceMatrixAPI` (Abstract Base Class) - Client interface for distance matrix services
- `GoogleDistanceMatrixClient` - Google Maps Distance Matrix API client
- `RouteOptimizer` - Main optimization service

**Methods:**
- `optimize_route(stops: List<POI>, mode: TransportMode)` → List<POI> - Orchestrator method
  - Builds a Distance Matrix for all selected points
  - Runs TSP algorithm to find the shortest cycle/path
  - Returns the reordered list
- `_build_distance_matrix(locations: List<Point>)` → Matrix<Float> - Constructs N x N matrix
- `_solve_tsp(matrix: Matrix)` → List<Index> - Executes optimization logic (nearest neighbor)
- `validate_constraints(stops: List<POI>)` → Boolean - Checks if route is feasible

## API Endpoints

### Itinerary Endpoints

#### List All Itineraries
```
GET /api/trips/itineraries/
```
- Returns public itineraries and user's own itineraries
- Uses lightweight `ItineraryListSerializer`

#### Get User's Itineraries
```
GET /api/trips/itineraries/my_itineraries/
```
- Returns only itineraries belonging to the authenticated user

#### Get Public Itineraries
```
GET /api/trips/itineraries/public_itineraries/
```
- Returns all public itineraries

#### Create Itinerary
```
POST /api/trips/itineraries/
```
- Requires authentication
- Automatically sets user to authenticated user
- Request body:
  ```json
  {
    "title": "Paris Trip",
    "start_date": "2024-03-01T10:00:00Z",
    "end_date": "2024-03-10T18:00:00Z",
    "status": "DRAFT",
    "visibility": "PRIVATE",
    "estimated_cost": "2500.50"
  }
  ```

#### Retrieve Itinerary
```
GET /api/trips/itineraries/{id}/
```
- Returns full itinerary with all stops and metadata

#### Update Itinerary
```
PUT /api/trips/itineraries/{id}/
PATCH /api/trips/itineraries/{id}/
```
- Only owner can update
- Can update any field except `id`, `user`, `created_at`, `updated_at`

#### Delete Itinerary
```
DELETE /api/trips/itineraries/{id}/
```
- Only owner can delete

#### Clone Itinerary
```
POST /api/trips/itineraries/{id}/clone/
```
- Creates a copy of a public itinerary for the current user
- Returns 400 if itinerary is not public

#### Generate Share Link
```
GET /api/trips/itineraries/{id}/generate_share_link/
```
- Returns a signed shareable link
- Only works for public itineraries

### ItineraryItem Endpoints

#### List Items
```
GET /api/trips/itinerary-items/
```
- Returns all items for itineraries user has access to

#### Create Item
```
POST /api/trips/itinerary-items/
```
- Requires authentication and ownership of parent itinerary
- Request body:
  ```json
  {
    "itinerary": "uuid-of-itinerary",
    "poi_id": "uuid-of-poi",
    "order_index": 0,
    "arrival_time": "14:30:00",
    "notes": "Don't forget the camera"
  }
  ```

#### Update Item
```
PUT /api/trips/itinerary-items/{id}/
PATCH /api/trips/itinerary-items/{id}/
```
- Only owner of parent itinerary can update

#### Delete Item
```
DELETE /api/trips/itinerary-items/{id}/
```
- Only owner of parent itinerary can delete

## Permissions

- **List/Retrieve**: AllowAny for public itineraries, IsAuthenticated for user-specific
- **Create/Update/Delete**: IsAuthenticated, with ownership checks
- Users can only edit/delete their own itineraries
- Only public itineraries can be cloned or shared

## Database Indexes

Itinerary:
- (user, created_at)
- (status)
- (visibility)

ItineraryItem:
- (itinerary, order_index)

## Admin Interface

Both `Itinerary` and `ItineraryItem` are registered in the Django admin with:
- Custom list displays with relevant fields
- Filtering by status, visibility, dates
- Search functionality
- Readonly fields (id, timestamps)
- Organized fieldsets

## Integration with Other Apps

- **User App**: ForeignKey relationship with `settings.AUTH_USER_MODEL`
- **Locations App**: ManyToMany relationship with POI through ItineraryItem

## Setup Instructions

### Using Docker (Recommended)

```bash
# Build and start containers
docker compose up -d

# Run migrations (automatic)
docker compose exec backend python manage.py migrate

# Create superuser
docker compose exec backend python manage.py createsuperuser
```

### Manual Setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run migrations
python backend/manage.py makemigrations trips
python backend/manage.py migrate

# Create superuser
python backend/manage.py createsuperuser

# Run server
python backend/manage.py runserver
```

## Testing

Run tests with:
```bash
docker compose exec backend python manage.py test trips
```

Or manually:
```bash
python backend/manage.py test trips
```

## Future Enhancements

1. **Advanced TSP Algorithms**: Implement more sophisticated algorithms (genetic algorithms, simulated annealing)
2. **Real-time Integration**: Integrate with real Google/Mapbox Distance Matrix APIs
3. **Travel Time Caching**: Cache distance matrices to reduce API calls
4. **Route Constraints**: Add support for time windows, vehicle capacity, etc.
5. **Cost Estimation**: Implement real cost calculation based on POI pricing
6. **Weather Integration**: Suggest itinerary adjustments based on weather
7. **Recommendations**: Suggest POIs based on user preferences
