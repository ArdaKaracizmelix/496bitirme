"""
Test utilities and configuration for integration testing.

This module provides utilities to make integration tests easier to run
and more maintainable, including helpers for API testing, database operations,
and common assertions.
"""

from contextlib import contextmanager
from django.test import TestCase
from django.db import connection, transaction
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
import time

User = get_user_model()


class DatabaseUtils:
    """Utilities for database operations in tests."""
    
    @staticmethod
    def reset_sequences():
        """Reset all database sequences (useful between tests)."""
        call_command('migrate', verbosity=0)
    
    @staticmethod
    @contextmanager
    def assert_num_queries(expected_count, num_queries_to_check=None):
        """
        Context manager to assert the number of SQL queries executed.
        
        Usage:
            with assert_num_queries(5):
                expensive_operation()
        """
        with connection.cursor() as cursor:
            initial_count = connection.queries_log.__len__()
        
        yield
        
        with connection.cursor() as cursor:
            final_count = connection.queries_log.__len__()
        
        actual_count = final_count - initial_count
        
        if actual_count != expected_count:
            raise AssertionError(
                f'Expected {expected_count} queries, got {actual_count}'
            )
    
    @staticmethod
    def count_queries():
        """Get the count of SQL queries executed."""
        return len(connection.queries)


class APITestUtils:
    """Utilities for testing REST API endpoints."""
    
    @staticmethod
    def get_token(user):
        """Generate JWT token for a user."""
        refresh = RefreshToken.for_user(user)
        return str(refresh.access_token)
    
    @staticmethod
    def authenticate_client(client, user):
        """Authenticate an APIClient with a user's token."""
        token = APITestUtils.get_token(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client
    
    @staticmethod
    def create_and_authenticate_user(username='testuser', password='testpass123'):
        """Create a user and authenticated client."""
        user = User.objects.create_user(
            username=username,
            password=password
        )
        client = APIClient()
        APITestUtils.authenticate_client(client, user)
        return user, client
    
    @staticmethod
    def assert_error_response(response, expected_status, field=None):
        """Assert that a response is an error response."""
        if response.status_code != expected_status:
            raise AssertionError(
                f'Expected status {expected_status}, got {response.status_code}. '
                f'Response: {response.data}'
            )
        
        if field and field not in response.data:
            raise AssertionError(
                f'Expected error field {field}, got {response.data.keys()}'
            )


class TimingUtils:
    """Utilities for performance testing."""
    
    @staticmethod
    @contextmanager
    def assert_timing(max_duration_ms, operation_name=''):
        """
        Context manager to assert that an operation completes within a time limit.
        
        Usage:
            with assert_timing(1000):  # Max 1 second
                expensive_query()
        """
        start_time = time.time()
        yield
        end_time = time.time()
        
        duration_ms = (end_time - start_time) * 1000
        
        if duration_ms > max_duration_ms:
            raise AssertionError(
                f'{operation_name} took {duration_ms:.2f}ms, '
                f'expected max {max_duration_ms}ms'
            )
    
    @staticmethod
    def measure_operation(operation, iterations=1):
        """
        Measure the execution time of an operation.
        
        Returns:
            Tuple of (total_time_ms, average_time_ms)
        """
        start_time = time.time()
        
        for _ in range(iterations):
            operation()
        
        end_time = time.time()
        
        total_time_ms = (end_time - start_time) * 1000
        average_time_ms = total_time_ms / iterations
        
        return total_time_ms, average_time_ms


class AssertionUtils:
    """Custom assertions for integration tests."""
    
    @staticmethod
    def assert_contains_fields(data, required_fields):
        """Assert that a dictionary contains all required fields."""
        missing_fields = [f for f in required_fields if f not in data]
        
        if missing_fields:
            raise AssertionError(
                f'Response missing required fields: {missing_fields}'
            )
    
    @staticmethod
    def assert_valid_uuid(value):
        """Assert that a value is a valid UUID."""
        import uuid
        try:
            uuid.UUID(str(value))
        except ValueError:
            raise AssertionError(f'{value} is not a valid UUID')
    
    @staticmethod
    def assert_valid_datetime(value):
        """Assert that a value is a valid datetime."""
        from django.utils.dateparse import parse_datetime
        if parse_datetime(str(value)) is None:
            raise AssertionError(f'{value} is not a valid datetime')
    
    @staticmethod
    def assert_valid_coordinates(lat, lon):
        """Assert that coordinates are valid."""
        if not (-90 <= lat <= 90):
            raise AssertionError(f'Invalid latitude: {lat}')
        
        if not (-180 <= lon <= 180):
            raise AssertionError(f'Invalid longitude: {lon}')
    
    @staticmethod
    def assert_list_contains(lst, item, message=''):
        """Assert that a list contains an item with custom message."""
        if item not in lst:
            raise AssertionError(
                f'Item {item} not found in list. {message}'
            )
    
    @staticmethod
    def assert_list_does_not_contain(lst, item, message=''):
        """Assert that a list does not contain an item."""
        if item in lst:
            raise AssertionError(
                f'Item {item} found in list. {message}'
            )


class MockDataUtils:
    """Utilities for creating mock data."""
    
    @staticmethod
    def create_mock_location(lat=0, lon=0):
        """Create a mock location point."""
        from django.contrib.gis.geos import Point
        return Point(lon, lat)
    
    @staticmethod
    def create_mock_polygon(sw_lat=0, sw_lon=0, ne_lat=1, ne_lon=1):
        """Create a mock bounding box polygon."""
        from django.contrib.gis.geos import Polygon
        return Polygon([
            (sw_lon, sw_lat),
            (ne_lon, sw_lat),
            (ne_lon, ne_lat),
            (sw_lon, ne_lat),
            (sw_lon, sw_lat),
        ])
    
    @staticmethod
    def create_coordinates_sequence(center_lat, center_lon, count=10):
        """Create a sequence of coordinates around a center point."""
        import math
        coordinates = []
        
        for i in range(count):
            angle = (2 * math.pi * i) / count
            offset = 0.01
            
            lat = center_lat + (offset * math.sin(angle))
            lon = center_lon + (offset * math.cos(angle))
            
            coordinates.append((lat, lon))
        
        return coordinates


class TransactionTestUtils:
    """Utilities for transaction and atomicity testing."""
    
    @staticmethod
    @contextmanager
    def assert_atomic_operation():
        """
        Context manager to verify that an operation is atomic.
        
        Usage:
            with assert_atomic_operation():
                perform_operation()
        """
        with transaction.atomic():
            yield
    
    @staticmethod
    @contextmanager
    def assert_rollback_on_error():
        """
        Context manager to verify rollback behavior on error.
        
        Usage:
            with assert_rollback_on_error():
                operation_that_might_fail()
        """
        try:
            with transaction.atomic():
                yield
        except Exception:
            # Expected - transaction should be rolled back
            pass


class TestDataCleaner:
    """Utility for cleaning up test data between tests."""
    
    _created_objects = []
    
    @classmethod
    def track_object(cls, obj):
        """Track an object for cleanup."""
        cls._created_objects.append(obj)
        return obj
    
    @classmethod
    def cleanup(cls):
        """Clean up all tracked objects."""
        for obj in cls._created_objects:
            try:
                obj.delete()
            except Exception:
                pass
        cls._created_objects.clear()


# ============================================================================
# PYTEST FIXTURES (if using pytest)
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "api: mark test as an API endpoint test"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as a performance test"
    )


# ============================================================================
# CONFTEST.PY CONFIGURATION
# ============================================================================

"""
If using pytest, create a conftest.py file in the backend directory with:

import pytest
from django.conf import settings
from django.test.utils import get_runner

@pytest.fixture(scope='session')
def django_db_setup():
    settings.DATABASES['default'] = {
        'ENGINE': 'django.contrib.gis.db.backends.spatialite',
        'NAME': ':memory:',
    }

@pytest.fixture
def db():
    from django.db import connection
    cursor = connection.cursor()
    yield
    cursor.close()

@pytest.fixture
def client():
    from rest_framework.test import APIClient
    return APIClient()

@pytest.fixture
def authenticated_client(db):
    from rest_framework.test import APIClient
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    user = User.objects.create_user('testuser', 'test@test.com', 'password')
    
    client = APIClient()
    from tests_utils import APITestUtils
    APITestUtils.authenticate_client(client, user)
    
    return client, user
"""
