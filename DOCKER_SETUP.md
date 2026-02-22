# Docker Setup Guide

## Prerequisites
- Docker & Docker Compose installed
- API keys for Google Places and Foursquare (optional)

## Setup Steps

### 1. Create Environment File
Copy the example file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your actual API keys:
```env
GOOGLE_PLACES_API_KEY=your_actual_google_key
FOURSQUARE_API_KEY=your_actual_foursquare_key
```

### 2. Build and Start Containers

```bash
docker compose up -d
```

This will:
- Create PostgreSQL database with PostGIS extension
- Build Django backend with GDAL/GIS support
- Run migrations automatically
- Start the development server on `http://localhost:8000`

### 3. Verify Installation

```bash
# Check services are running
docker compose ps

# View logs
docker compose logs -f backend

# Access Django shell
docker compose exec backend python manage.py shell
```

### 4. Create Superuser

```bash
docker compose exec backend python manage.py createsuperuser
```

Then visit: `http://localhost:8000/admin`

### 5. Run Tests

```bash
# All tests
docker compose exec backend python manage.py test

# Specific app tests
docker compose exec backend python manage.py test locations

# With coverage
docker compose exec backend coverage run --source='.' manage.py test
docker compose exec backend coverage report
```

## Common Commands

### Database
```bash
# Migrations
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate

# Access PostgreSQL directly
docker compose exec db psql -U excursa_user -d excursa
```

### Development
```bash
# Restart services
docker compose restart

# Clean rebuild (fresh database)
docker compose down -v
docker compose up -d

# View container logs
docker compose logs -f backend
docker compose logs -f db

# Stop services
docker compose stop
```

### Debugging
```bash
# Interactive bash in backend
docker compose exec backend bash

# Django shell
docker compose exec backend python manage.py shell

# Run specific migrations
docker compose exec backend python manage.py migrate locations
```

## Troubleshooting

### Database Connection Error
```bash
# Wait for PostgreSQL to be ready
docker compose exec backend python manage.py migrate --check

# Restart database service
docker compose restart db
```

### GDAL/PostGIS Import Errors
```bash
# Rebuild without cache
docker compose build --no-cache backend
docker compose up -d
```

### Permission Issues
```bash
# Run with proper permissions
docker compose exec backend python manage.py migrate --no-input
```

## File Structure

```
project/
├── .env                          # Actual secrets (DO NOT COMMIT)
├── .env.example                  # Template (commit this)
├── docker-compose.yml            # Container orchestration
├── backend/
│   ├── Dockerfile               # Backend image definition
│   ├── requirements.txt          # Python dependencies
│   └── locations/                # Geospatial app
└── frontend/
```

## Notes

- **API Keys**: Loaded from `.env` file via docker-compose.yml
- **Database**: Uses PostGIS 16 for geospatial queries
- **GDAL**: Installed in backend for PostGIS support
- **Health Check**: Database has health checks before starting backend
- **.env** is in `.gitignore` - never commit production keys!

## Production Considerations

For production deployment:
1. Set `DEBUG=False`
2. Use strong SECRET_KEY
3. Configure ALLOWED_HOSTS
4. Use environment-specific settings
5. Set up HTTPS/SSL
6. Use managed database service (AWS RDS, Azure Database, etc.)
7. Enable database backups
8. Monitor container logs
