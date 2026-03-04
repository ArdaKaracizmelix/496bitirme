# Core App Documentation

## Overview

The `core` app is the foundational module containing shared building blocks and abstract classes used across all other applications. It implements the DRY (Don't Repeat Yourself) principle by providing:

- **TimeStampedModel**: Abstract base class that automatically tracks creation and modification times with soft-delete functionality
- **GlobalExceptionHandler**: Centralized middleware for standardized error handling and response formatting
- **Custom Exceptions**: Type-safe exception classes for consistent error handling across the application

## Architecture

### Models

#### TimeStampedModel (Abstract Base Class)

A reusable abstract Django model that provides self-updating audit fields.

**Use Case:**
By inheriting from this class instead of `models.Model`, every entity in the system (Users, POIs, Trips, etc.) automatically gains tracking for creation and modification times without rewriting field definitions.

**Attributes:**
- `created_at` (DateTime) - Timestamp set automatically when the record is first created (auto_now_add=True). Used for sorting feeds and history.
- `updated_at` (DateTime) - Timestamp updated automatically every time the record is saved (auto_now=True).
- `is_deleted` (Boolean) - "Soft Delete" flag. Default is False. Allows data recovery and audit trails instead of permanent deletion.

**Methods:**
- `soft_delete()` → void - Sets is_deleted to True and saves the instance. Overrides the standard delete() method to prevent accidental data loss.
- `restore()` → void - Sets is_deleted to False, recovering a previously removed item.

**Benefits:**
- ✅ DRY principle: Don't repeat timestamp field definitions
- ✅ Consistency: All models follow the same audit pattern
- ✅ Safety: Soft deletes allow data recovery
- ✅ Auditability: Track when records were created/modified
- ✅ Filters: Pre-built database indexes for common queries

**Example Usage:**
```python
from core import TimeStampedModel

class User(TimeStampedModel):
    name = models.CharField(max_length=255)
    email = models.EmailField()
    
    # Automatically has: created_at, updated_at, is_deleted
    # Can use: user.soft_delete(), user.restore()
```

### Middleware

#### GlobalExceptionHandler

A centralized exception handling middleware that sits between the server and client.

**Responsibility:**
- Intercepts any unhandled errors (500 Internal Server Error)
- Catches custom API exceptions (400/401/404)
- Converts them into a standardized JSON format
- Prevents raw stack traces from leaking to the user
- Logs errors with context for monitoring and debugging

**How It Works:**

1. **Catches Exceptions**: Wraps the request-response cycle
2. **Maps Exception to Status Code**: Identifies exception type and assigns appropriate HTTP status
3. **Calls format_error_response**: Creates standardized error payload
4. **Logs Error**: Sends stack trace and request metadata to monitoring service

**Exception Mapping:**

| Exception Type | HTTP Code | Default Message |
|---|---|---|
| `Http404` | 404 | The requested resource was not found. |
| `PermissionDenied` | 403 | You do not have permission to perform this action. |
| `ValidationError` | 422 | Validation failed. |
| `APIException` subclasses | Varies | Varies by subclass |
| Unhandled Exception | 500 | An internal server error occurred. |

**Response Format:**

All error responses follow this JSON structure:

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Invalid request parameters.",
    "details": {}
  },
  "data": null
}
```

**Methods:**

- `process_exception(request, exception)` → HttpResponse - Middleware Hook
  - Identifies the exception type
  - Maps the exception to an HTTP Status Code
  - Calls format_error_response
  
- `format_error_response(code, message, details)` → JSONResponse - Constructs the standard error payload

- `log_error(exception, context)` → void - Sends the stack trace and request metadata to an external monitoring service for developer analysis

## Exception Classes

### APIException (Base Class)

Custom base exception for API errors that should be returned to clients.

```python
class APIException(Exception):
    status_code = 500
    default_detail = "An internal server error occurred."
```

### Exception Subclasses

- **BadRequestException** (400) - Invalid request parameters or malformed data
- **UnauthorizedException** (401) - Authentication required or failed
- **ForbiddenException** (403) - User lacks necessary permissions
- **NotFoundException** (404) - Requested resource does not exist
- **ConflictException** (409) - Request conflicts with current state
- **ValidationException** (422) - Validation failed
- **TooManyRequestsException** (429) - Rate limit exceeded
- **InternalServerException** (500) - Unexpected server error

**Usage Example:**

```python
from core import NotFoundException

def get_user(user_id):
    user = User.objects.filter(id=user_id).first()
    if not user:
        raise NotFoundException(detail=f"User with id {user_id} not found")
    return user
```

## Admin Interface

### TimeStampedModelAdmin (Base Admin Class)

Provides common admin functionality for all timestamped models.

**Features:**
- Read-only timestamp fields (created_at, updated_at)
- Filtering by deletion status and dates
- Admin actions for soft-delete and restore
- Visual indicators for record status

**Subclass Example:**

```python
from core import TimeStampedModelAdmin
from django.contrib import admin
from .models import Itinerary

@admin.register(Itinerary)
class ItineraryAdmin(TimeStampedModelAdmin):
    list_display = ['title', 'user', 'is_deleted_display', 'created_at']
    search_fields = ['title', 'user__username']
```

## Integration Points

### Used By:

- **User App**: UserProfile, FollowRelation
- **Trips App**: Itinerary, ItineraryItem
- **Locations App**: POI and other location models
- **Notifications App**: Notification models
- **Recommendations App**: Recommendation tracking
- **Media Storage App**: File and image records
- **Community App**: Social posts and interactions

### Export Structure:

The core app exports commonly used classes via `__init__.py`:

```python
from core import (
    TimeStampedModel,
    TimeStampedModelAdmin,
    APIException,
    BadRequestException,
    NotFoundException,
    # ... other exception classes
)
```

## Configuration

### Middleware Registration

The GlobalExceptionHandler is registered in `config/settings.py`:

```python
MIDDLEWARE = [
    # ... other middleware
    'core.middleware.GlobalExceptionHandler',
]
```

**Position:** Should be placed near the top of the middleware stack to catch all exceptions.

## Best Practices

### 1. Model Inheritance
Always inherit from TimeStampedModel instead of models.Model:

```python
# Good ✅
class POI(TimeStampedModel):
    name = models.CharField(max_length=255)

# Avoid ❌
class POI(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    name = models.CharField(max_length=255)
```

### 2. Exception Handling
Use specific exception types:

```python
# Good ✅
raise NotFoundException(detail=f"User {id} not found")
raise ValidationException(detail="Email already exists")

# Avoid ❌
raise ValueError("User not found")
raise Exception("Something went wrong")
```

### 3. Query Filtering
Respect soft deletes in queries:

```python
# Get only active records
active_users = User.objects.filter(is_deleted=False)

# Or use a custom manager (recommended)
class ActiveManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)

class User(TimeStampedModel):
    objects = ActiveManager()
```

### 4. Admin Actions
Use the soft-delete action instead of permanent deletion:

```
# In Django Admin:
1. Select records
2. Choose "Soft delete selected records"
3. Click "Go"
# Records are marked as deleted but data is preserved
```

## Testing

### Test TimeStampedModel

```python
def test_soft_delete(self):
    user = User.objects.create(name="John")
    user.soft_delete()
    assert user.is_deleted == True
    assert user.updated_at > user.created_at

def test_restore(self):
    user = User.objects.create(name="John")
    user.soft_delete()
    user.restore()
    assert user.is_deleted == False
```

### Test Exception Handler

```python
def test_not_found_exception(self):
    response = self.client.get('/api/users/invalid-id/')
    assert response.status_code == 404
    data = response.json()
    assert data['success'] == False
    assert data['error']['code'] == 404
```

## Future Enhancements

- [ ] Add custom manager for automatic soft-delete filtering
- [ ] Add audit logging for change tracking
- [ ] Implement field-level change history
- [ ] Add integration with monitoring services (Sentry, DataDog)
- [ ] Add request/response logging middleware
- [ ] Implement API rate limiting
