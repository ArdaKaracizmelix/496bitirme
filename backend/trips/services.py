"""
Domain services for trips app - RouteOptimizer service.
"""
from abc import ABC, abstractmethod
from typing import List, Tuple
from enum import Enum
import math


class TransportMode(Enum):
    """Enum for transport modes"""
    DRIVING = 'DRIVING'
    WALKING = 'WALKING'
    CYCLING = 'CYCLING'
    TRANSIT = 'TRANSIT'


class DistanceMatrixAPI(ABC):
    """Abstract base class for distance matrix clients"""

    @abstractmethod
    def get_distance_matrix(self, locations: List[Tuple[float, float]], mode: TransportMode) -> List[List[float]]:
        """
        Get distance matrix for a list of locations.
        Returns: N x N matrix where cell (i, j) is travel time from location i to j
        """
        pass


class GoogleDistanceMatrixClient(DistanceMatrixAPI):
    """Google Maps Distance Matrix API client"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def get_distance_matrix(self, locations: List[Tuple[float, float]], mode: TransportMode) -> List[List[float]]:
        """
        Placeholder for Google Distance Matrix API call.
        In production, this would call the Google API.
        """
        # For now, return a mock distance matrix
        n = len(locations)
        matrix = [[0.0] * n for _ in range(n)]

        for i in range(n):
            for j in range(n):
                if i != j:
                    # Calculate haversine distance as placeholder
                    distance = self._haversine_distance(locations[i], locations[j])
                    matrix[i][j] = distance

        return matrix

    @staticmethod
    def _haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
        """
        Calculate haversine distance between two coordinates in kilometers.
        Converted to minutes for travel time estimate (assuming ~60 km/h).
        """
        lat1, lon1 = coord1
        lat2, lon2 = coord2

        R = 6371  # Earth radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)

        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(
            dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        distance_km = R * c

        # Convert to travel time in minutes (assuming ~60 km/h average)
        travel_time_minutes = (distance_km / 60) * 60
        return travel_time_minutes


class RouteOptimizer:
    """
    Domain service that solves the Traveling Salesman Problem (TSP) to find the optimal route.
    Reorders a list of stops for minimal travel time.
    """

    def __init__(self, matrix_client: DistanceMatrixAPI):
        """
        Initialize with a distance matrix API client.

        Args:
            matrix_client: Client for Google/Mapbox Distance Matrix API
        """
        self.matrix_client = matrix_client

    def optimize_route(self, stops: List, mode: TransportMode = TransportMode.DRIVING) -> List:
        """
        Orchestrator method that optimizes the route of stops.

        Args:
            stops: List of POI objects to visit
            mode: Transport mode (DRIVING, WALKING, etc.)

        Returns:
            List of POI objects in optimized order
        """
        if len(stops) <= 2:
            # No optimization needed for 2 or fewer stops
            return stops

        # Validate constraints
        if not self.validate_constraints(stops):
            raise ValueError("Route constraints validation failed")

        # Build distance matrix from locations
        locations = [(stop.location.y, stop.location.x) for stop in stops]
        distance_matrix = self._build_distance_matrix(locations, mode)

        # Solve TSP to find optimal order
        optimal_indices = self._solve_tsp(distance_matrix)

        # Return reordered stops
        return [stops[i] for i in optimal_indices]

    def _build_distance_matrix(self, locations: List[Tuple[float, float]], mode: TransportMode) -> List[List[float]]:
        """
        Constructs an N x N distance/time matrix where cell (i, j) is the travel time
        from location i to location j.

        Args:
            locations: List of (latitude, longitude) tuples
            mode: Transport mode

        Returns:
            Matrix of travel times in minutes
        """
        return self.matrix_client.get_distance_matrix(locations, mode)

    def _solve_tsp(self, matrix: List[List[float]]) -> List[int]:
        """
        Executes the optimization logic using nearest neighbor heuristic.

        Args:
            matrix: Distance/time matrix

        Returns:
            List of indices representing the optimized order
        """
        n = len(matrix)
        unvisited = set(range(1, n))  # Start from stop 0
        current = 0
        path = [0]

        while unvisited:
            nearest = min(unvisited, key=lambda x: matrix[current][x])
            path.append(nearest)
            unvisited.remove(nearest)
            current = nearest

        return path

    def validate_constraints(self, stops: List) -> bool:
        """
        Checks if the route is feasible.
        Validates that all stops have valid location data.

        Args:
            stops: List of POI objects

        Returns:
            True if all constraints are satisfied
        """
        for stop in stops:
            if not stop.location:
                return False
            if not stop.location.valid:
                return False
        return True
