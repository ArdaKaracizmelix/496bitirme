"""
Centralized exception handling middleware for the application.

The GlobalExceptionHandler intercepts all unhandled errors and custom API exceptions,
converting them into standardized JSON responses to prevent raw stack traces from
leaking to users.
"""

import json
import logging
import traceback
from typing import Dict, Any

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.core.exceptions import ValidationError, PermissionDenied
from django.http import Http404
from rest_framework.exceptions import APIException as DRFAPIException
from rest_framework import status

from .exceptions import APIException


logger = logging.getLogger(__name__)


class GlobalExceptionHandler:
    """
    Middleware for centralized exception handling.
    
    Sits between the server and client. Intercepts any unhandled errors (500 Internal Server Error)
    or custom API exceptions (400/401/404) and converts them into a standardized JSON format,
    preventing raw stack traces from leaking to the user.
    
    The middleware:
    1. Catches all exceptions during request processing
    2. Identifies the exception type
    3. Maps it to an appropriate HTTP status code
    4. Formats a standardized error response
    5. Logs the error with context for monitoring
    """
    
    def __init__(self, get_response):
        """
        Initialize the exception handler middleware.
        
        Args:
            get_response: The next middleware or view in the Django execution chain.
        """
        self.get_response = get_response
    
    def __call__(self, request: HttpRequest) -> HttpResponse:
        """
        Process the request and handle any exceptions.
        
        Args:
            request: The incoming HTTP request.
            
        Returns:
            HttpResponse: The response from the next middleware/view or an error response.
        """
        try:
            response = self.get_response(request)
            return response
        except Exception as exception:
            return self.process_exception(request, exception)
    
    def process_exception(self, request: HttpRequest, exception: Exception) -> JsonResponse:
        """
        Middleware Hook: Process exceptions and convert to standardized JSON responses.
        
        This method:
        1. Identifies the exception type
        2. Maps the exception to an HTTP Status Code
        3. Calls format_error_response to construct the response
        4. Logs the error with context
        
        Args:
            request: The HTTP request that caused the exception.
            exception: The exception that was raised.
            
        Returns:
            JsonResponse: Standardized error response in JSON format.
        """
        # Determine status code and details based on exception type
        status_code, detail, code = self._map_exception_to_response(exception)
        
        # Format the error response
        response_data = self.format_error_response(
            code=status_code,
            message=detail,
            details=self._get_exception_details(exception)
        )
        
        # Log the error with context for monitoring
        self.log_error(exception, {
            'request_path': request.path,
            'request_method': request.method,
            'status_code': status_code,
            'exception_type': exception.__class__.__name__,
        })
        
        return JsonResponse(response_data, status=status_code)
    
    def _map_exception_to_response(self, exception: Exception) -> tuple:
        """
        Map exception types to HTTP status codes and messages.
        
        Args:
            exception: The exception to map.
            
        Returns:
            tuple: (status_code, detail_message, exception_code)
        """
        # Handle custom API exceptions
        if isinstance(exception, APIException):
            return exception.status_code, str(exception.detail), exception.code
        
        # Handle Django REST Framework exceptions
        if isinstance(exception, DRFAPIException):
            return exception.status_code, str(exception.detail), 'api_error'
        
        # Handle Django built-in exceptions
        if isinstance(exception, Http404):
            return status.HTTP_404_NOT_FOUND, 'The requested resource was not found.', 'not_found'
        
        if isinstance(exception, PermissionDenied):
            return status.HTTP_403_FORBIDDEN, 'You do not have permission to perform this action.', 'permission_denied'
        
        if isinstance(exception, ValidationError):
            return status.HTTP_422_UNPROCESSABLE_ENTITY, 'Validation failed.', 'validation_error'
        
        # Default to 500 Internal Server Error for unhandled exceptions
        return status.HTTP_500_INTERNAL_SERVER_ERROR, 'An internal server error occurred.', 'internal_error'
    
    def _get_exception_details(self, exception: Exception) -> Dict[str, Any]:
        """
        Extract details from exception for error response.
        
        Args:
            exception: The exception to extract details from.
            
        Returns:
            Dict: Details about the exception (empty for security in production).
        """
        # In production, avoid exposing sensitive details
        # For development, could include exception specifics via settings
        details = {}
        
        if isinstance(exception, ValidationError):
            details['validation_errors'] = exception.message_dict if hasattr(exception, 'message_dict') else {}
        
        return details
    
    def format_error_response(self, code: int, message: str, details: Dict = None) -> Dict[str, Any]:
        """
        Constructs the standard error response payload.
        
        Ensures all error responses follow the same JSON structure for consistency
        in client-side error handling.
        
        Args:
            code: HTTP status code.
            message: Human-readable error message.
            details: Additional error details (optional).
            
        Returns:
            Dict: Standardized error response payload.
        """
        return {
            'success': False,
            'error': {
                'code': code,
                'message': message,
                'details': details or {},
            },
            'data': None,
        }
    
    def log_error(self, exception: Exception, context: Dict = None) -> None:
        """
        Sends the stack trace and request metadata to monitoring/logging.
        
        This method logs exceptions with context for developer analysis,
        typically sending data to external monitoring services like Sentry.
        
        Args:
            exception: The exception that occurred.
            context: Additional context about the request/error.
        """
        context = context or {}
        
        # Log to Django's logger
        logger.error(
            f"Unhandled exception: {exception.__class__.__name__}",
            exc_info=True,
            extra={
                'exception_type': exception.__class__.__name__,
                'exception_message': str(exception),
                'context': context,
                'traceback': traceback.format_exc(),
            }
        )
        
        # In production, this is where to send to Sentry, DataDog, etc.
