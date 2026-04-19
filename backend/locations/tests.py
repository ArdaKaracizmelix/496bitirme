from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.gis.geos import Point, Polygon
from django.contrib.auth import get_user_model
from .models import POI
from .services import ExternalPlaceDTO, ExternalSyncService, GeoService

User = get_user_model()

class POIModelTests(TestCase):
    def setUp(self):
        self.poi = POI.objects.create(
            name="Test Location",
            address="123 Test St",
            location=Point(10.0, 20.0), # lon=10, lat=20
            category=POI.Category.FOOD,
            average_rating=4.5
        )

    def test_create_poi(self):
        """Test that a POI can be created successfully."""
        self.assertEqual(POI.objects.count(), 1)
        self.assertEqual(self.poi.name, "Test Location")
        # Note: Point(x, y) maps to (lon, lat)
        self.assertEqual(self.poi.location.x, 10.0) 
        self.assertEqual(self.poi.location.y, 20.0)

    def test_invalid_coordinates(self):
        """Test that invalid coordinates raise a ValueError during save."""
        poi = POI(
            name="Bad Location",
            location=Point(200.0, 100.0) # Invalid: Lat > 90, Lon > 180
        )
        with self.assertRaises(ValueError):
            poi.save()

    def test_distance_to(self):
        """Test distance calculation between points."""
        # Create a point roughly 1.11km away (0.01 degrees lat change)
        target = Point(10.0, 20.01) 
        distance = self.poi.distance_to(target)
        
        self.assertIsNotNone(distance)
        # Check if distance is within expected range (meters)
        self.assertGreater(distance.m, 1000)
        self.assertLess(distance.m, 1200)


class GeoServiceTests(TestCase):
    def setUp(self):
        # Center point (0,0)
        self.center_poi = POI.objects.create(
            name="Center",
            location=Point(0.0, 0.0),
            category=POI.Category.HISTORICAL
        )
        # Nearby point (~1km away)
        self.nearby_poi = POI.objects.create(
            name="Nearby",
            location=Point(0.009, 0.0), 
            category=POI.Category.FOOD
        )
        # Far point (~100km away)
        self.far_poi = POI.objects.create(
            name="Far",
            location=Point(1.0, 0.0),
            category=POI.Category.NATURE
        )
        # Misclassified legacy data should be hidden from map exploration.
        self.school_poi = POI.objects.create(
            name="Sample University Campus",
            location=Point(0.008, 0.0),
            category=POI.Category.ENTERTAINMENT,
            tags=["university", "education"],
        )

    def test_find_nearby(self):
        """Test finding POIs within a specific radius."""
        center = Point(0.0, 0.0)
        # Search within 2000 meters
        results = GeoService.find_nearby(center, radius_m=2000)
        
        self.assertIn(self.center_poi, results)
        self.assertIn(self.nearby_poi, results)
        self.assertNotIn(self.far_poi, results)
        self.assertNotIn(self.school_poi, results)

    def test_find_in_viewport(self):
        """Test finding POIs within a map bounding box."""
        # Create a box covering roughly -0.1 to 0.5 degrees
        bbox = Polygon([
            (-0.1, -0.1),
            (0.5, -0.1),
            (0.5, 0.5),
            (-0.1, 0.5),
            (-0.1, -0.1)
        ])
        
        results = GeoService.find_in_viewport(bbox)
        
        self.assertIn(self.center_poi, results)
        self.assertIn(self.nearby_poi, results)
        self.assertNotIn(self.far_poi, results)


class ExternalSyncServiceTests(TestCase):
    def setUp(self):
        self.service = ExternalSyncService(google_api_key=None, fsq_api_key=None)

    def test_upsert_rejects_health_finance_and_service_places(self):
        dto = ExternalPlaceDTO(
            external_id="google-pharmacy-1",
            name="Cankaya Eczane",
            address="Cankaya, Ankara",
            lat=39.9208,
            lon=32.8541,
            category="pharmacy",
            metadata={"source": "google_places", "rating": 4.8, "user_ratings_total": 100},
            tags=["pharmacy", "health", "point_of_interest"],
        )

        self.assertIsNone(self.service.upsert_poi(dto))
        self.assertEqual(POI.objects.count(), 0)

    def test_upsert_rejects_chain_food_and_stores(self):
        for external_id, name, category, tags in [
            ("google-burger-1", "Burger King Kizilay", "restaurant", ["restaurant", "food"]),
            ("google-penti-1", "Penti Armada", "clothing_store", ["store", "clothing_store"]),
            ("google-market-1", "Migros Market", "supermarket", ["store", "supermarket"]),
        ]:
            dto = ExternalPlaceDTO(
                external_id=external_id,
                name=name,
                address="Ankara",
                lat=39.9208,
                lon=32.8541,
                category=category,
                metadata={"source": "google_places", "rating": 4.8, "user_ratings_total": 1000},
                tags=tags,
            )
            self.assertIsNone(self.service.upsert_poi(dto))

        self.assertEqual(POI.objects.count(), 0)

    def test_upsert_accepts_and_enriches_travel_poi(self):
        dto = ExternalPlaceDTO(
            external_id="google-museum-1",
            name="Anadolu Medeniyetleri Muzesi",
            address="Altindag, Ankara",
            lat=39.9385,
            lon=32.8619,
            category="museum",
            metadata={"source": "google_places", "rating": 4.7, "user_ratings_total": 3500},
            tags=["museum", "tourist_attraction", "point_of_interest"],
        )

        poi = self.service.upsert_poi(dto)

        self.assertIsNotNone(poi)
        self.assertEqual(poi.category, POI.Category.HISTORICAL)
        self.assertEqual(poi.average_rating, 4.7)
        self.assertIn("quality_score", poi.metadata)
        self.assertIn("museum", poi.tags)

    def test_upsert_dedupes_same_name_and_nearby_location(self):
        existing = POI.objects.create(
            name="Anitkabir",
            address="Ankara",
            location=Point(32.8369, 39.9250),
            category=POI.Category.HISTORICAL,
            tags=["historical"],
        )
        dto = ExternalPlaceDTO(
            external_id="google-anitkabir",
            name="Anitkabir",
            address="Cankaya, Ankara",
            lat=39.9251,
            lon=32.8370,
            category="tourist_attraction",
            metadata={"source": "google_places", "rating": 4.9, "user_ratings_total": 100000},
            tags=["tourist_attraction", "monument"],
        )

        self.assertIsNone(self.service.upsert_poi(dto))
        self.assertEqual(POI.objects.count(), 1)
        existing.refresh_from_db()
        self.assertEqual(existing.external_id, "google-anitkabir")


class POIAPITests(APITestCase):
    def setUp(self):
        # Create a test POI
        self.poi = POI.objects.create(
            name="API Test POI",
            address="API St",
            location=Point(30.0, 40.0), # lon=30, lat=40
            category=POI.Category.ENTERTAINMENT
        )
        # Define URL names based on router in urls.py
        self.list_url = reverse('locations:poi-list')
        self.nearby_url = reverse('locations:poi-nearby')
        self.viewport_url = reverse('locations:poi-viewport')
        self.cities_url = reverse('locations:poi-cities')

    def test_list_pois(self):
        """Test listing all POIs."""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], "API Test POI")

    def test_nearby_endpoint(self):
        """Test the nearby custom action endpoint."""
        # Search near the POI (lat=40, lon=30)
        params = {
            'latitude': 40.0,
            'longitude': 30.0,
            'radius': 1000
        }
        response = self.client.get(self.nearby_url, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.poi.id))

    def test_viewport_endpoint(self):
        """Test the viewport custom action endpoint."""
        # Box surrounding 30,40
        params = {
            'north': 41.0,
            'south': 39.0,
            'east': 31.0,
            'west': 29.0
        }
        response = self.client.get(self.viewport_url, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)

    def test_cities_endpoint_returns_supported_top_turkey_cities_without_existing_pois(self):
        POI.objects.all().delete()

        response = self.client.get(self.cities_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 10)
        self.assertIn('Istanbul', response.data['results'])
        self.assertIn('Ankara', response.data['results'])
        self.assertIn('Kocaeli', response.data['results'])
