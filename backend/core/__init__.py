"""
Core app: Foundational building blocks and abstract classes used across all applications.

This module contains:
- TimeStampedModel: Abstract base class for models with automatic timestamp tracking and soft delete
- GlobalExceptionHandler: Middleware for centralized exception handling
- Custom exception classes: APIException and its subclasses for standardized error handling

These are designed following DRY (Don't Repeat Yourself) principles to ensure
code consistency and standardized error handling across the entire application.
"""

from .middleware import GlobalExceptionHandler
from .exceptions import (
    APIException,
    BadRequestException,
    UnauthorizedException,
    ForbiddenException,
    NotFoundException,
    ConflictException,
    ValidationException,
    TooManyRequestsException,
    InternalServerException,
)

__all__ = [
    'GlobalExceptionHandler',
    'APIException',
    'BadRequestException',
    'UnauthorizedException',
    'ForbiddenException',
    'NotFoundException',
    'ConflictException',
    'ValidationException',
    'TooManyRequestsException',
    'InternalServerException',
]
