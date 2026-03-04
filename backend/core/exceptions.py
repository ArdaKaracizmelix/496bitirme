"""
Custom exception classes for the application.

These exceptions are handled by the GlobalExceptionHandler middleware,
which converts them into standardized JSON error responses.
"""

from django.core.exceptions import ValidationError


class APIException(Exception):
    """
    Base exception class for API errors that should be returned to the client.
    
    Maps to specific HTTP status codes and error messages.
    """
    
    status_code = 500
    default_detail = "An internal server error occurred."
    
    def __init__(self, detail=None, status_code=None, code=None):
        self.detail = detail or self.default_detail
        if status_code is not None:
            self.status_code = status_code
        self.code = code or self.__class__.__name__
    
    def __str__(self):
        return str(self.detail)


class BadRequestException(APIException):
    """400 Bad Request - Invalid request parameters or malformed data."""
    status_code = 400
    default_detail = "Invalid request parameters."


class UnauthorizedException(APIException):
    """401 Unauthorized - Authentication required or failed."""
    status_code = 401
    default_detail = "Authentication credentials were not provided."


class ForbiddenException(APIException):
    """403 Forbidden - User lacks necessary permissions."""
    status_code = 403
    default_detail = "You do not have permission to access this resource."


class NotFoundException(APIException):
    """404 Not Found - Requested resource does not exist."""
    status_code = 404
    default_detail = "The requested resource was not found."


class ConflictException(APIException):
    """409 Conflict - Request conflicts with current state."""
    status_code = 409
    default_detail = "The request conflicts with the current state of the server."


class ValidationException(APIException):
    """422 Unprocessable Entity - Validation failed."""
    status_code = 422
    default_detail = "Validation failed."


class TooManyRequestsException(APIException):
    """429 Too Many Requests - Rate limit exceeded."""
    status_code = 429
    default_detail = "Too many requests. Please try again later."


class InternalServerException(APIException):
    """500 Internal Server Error - Unexpected server error."""
    status_code = 500
    default_detail = "An internal server error occurred."
