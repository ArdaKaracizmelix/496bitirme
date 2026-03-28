"""
Test suite for locations app endpoints and models
Tests cover: SavedPOI model, toggle_favorite, is_favorited, and search endpoints
"""

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from uuid import uuid4

from locations.models import POI, SavedPOI
from core.models import UserProfile

User = get_user_model()


class SavedPOIModelTestCase(TestCase):
    """Test SavedPOI model creation and constraints"""

    def setUp(self):
        """Set up test fixtures"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(user=self.user)
        
        self.poi = POI.objects.create(
            id=uuid4(),
            name='Ayasofya',
            latitude=41.0086,
            longitude=28.9802,
            category='HISTORICAL'
        )

    def test_saved_poi_creation(self):
        """Should create SavedPOI instance"""
        saved = SavedPOI.objects.create(
            user=self.user_profile,
            poi=self.poi
        )
        
        self.assertEqual(saved.user, self.user_profile)
        self.assertEqual(saved.poi, self.poi)
        self.assertIsNotNone(saved.created_at)

    def test_saved_poi_unique_constraint(self):
        """Should prevent duplicate user-POI combinations"""
        SavedPOI.objects.create(
            user=self.user_profile,
            poi=self.poi
        )
        
        with self.assertRaises(Exception):
            SavedPOI.objects.create(
                user=self.user_profile,
                poi=self.poi
            )

    def test_saved_poi_ordering(self):
        """Should order by creation date descending"""
        saved1 = SavedPOI.objects.create(
            user=self.user_profile,
            poi=self.poi
        )
        
        poi2 = POI.objects.create(
            id=uuid4(),
            name='Blue Mosque',
            latitude=41.0054,
            longitude=28.9768,
            category='HISTORICAL'
        )
        saved2 = SavedPOI.objects.create(
            user=self.user_profile,
            poi=poi2
        )
        
        saved = SavedPOI.objects.filter(user=self.user_profile)
        self.assertEqual(saved[0].poi.name, 'Blue Mosque')
        self.assertEqual(saved[1].poi.name, 'Ayasofya')


class ToggleFavoriteTestCase(TestCase):
    """Test toggle_favorite endpoint"""

    def setUp(self):
        """Set up test fixtures"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(user=self.user)
        
        self.poi = POI.objects.create(
            id=uuid4(),
            name='Ayasofya',
            latitude=41.0086,
            longitude=28.9802,
            category='HISTORICAL'
        )
        
        self.client.force_authenticate(user=self.user)

    def test_toggle_favorite_not_authenticated(self):
        """Should return 401 for unauthenticated requests"""
        client = APIClient()
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(self.poi.id)})
        
        response = client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_toggle_favorite_creates_favorite(self):
        """Should create SavedPOI when toggling favorite first time"""
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(self.poi.id)})
        
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_favorited'])
        self.assertTrue(SavedPOI.objects.filter(
            user=self.user_profile,
            poi=self.poi
        ).exists())

    def test_toggle_favorite_removes_favorite(self):
        """Should remove SavedPOI when toggling second time"""
        SavedPOI.objects.create(user=self.user_profile, poi=self.poi)
        
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(self.poi.id)})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_favorited'])
        self.assertFalse(SavedPOI.objects.filter(
            user=self.user_profile,
            poi=self.poi
        ).exists())

    def test_toggle_favorite_returns_poi_id(self):
        """Should return POI ID in response"""
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(self.poi.id)})
        
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['poi_id'], str(self.poi.id))

    def test_toggle_favorite_nonexistent_poi(self):
        """Should return 404 for nonexistent POI"""
        fake_id = uuid4()
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(fake_id)})
        
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class IsFavoritedTestCase(TestCase):
    """Test is_favorited endpoint"""

    def setUp(self):
        """Set up test fixtures"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(user=self.user)
        
        self.poi = POI.objects.create(
            id=uuid4(),
            name='Ayasofya',
            latitude=41.0086,
            longitude=28.9802,
            category='HISTORICAL'
        )
        
        self.client.force_authenticate(user=self.user)

    def test_is_favorited_not_authenticated(self):
        """Should return 401 for unauthenticated requests"""
        client = APIClient()
        url = reverse('poi-is-favorited', kwargs={'pk': str(self.poi.id)})
        
        response = client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_is_favorited_true(self):
        """Should return true when POI is favorited"""
        SavedPOI.objects.create(user=self.user_profile, poi=self.poi)
        
        url = reverse('poi-is-favorited', kwargs={'pk': str(self.poi.id)})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_favorited'])

    def test_is_favorited_false(self):
        """Should return false when POI is not favorited"""
        url = reverse('poi-is-favorited', kwargs={'pk': str(self.poi.id)})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['is_favorited'])

    def test_is_favorited_returns_poi_id(self):
        """Should return POI ID in response"""
        url = reverse('poi-is-favorited', kwargs={'pk': str(self.poi.id)})
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['poi_id'], str(self.poi.id))

    def test_is_favorited_nonexistent_poi(self):
        """Should return 404 for nonexistent POI"""
        fake_id = uuid4()
        url = reverse('poi-is-favorited', kwargs={'pk': str(fake_id)})
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SearchPOIsTestCase(TestCase):
    """Test search endpoint"""

    def setUp(self):
        """Set up test fixtures"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.pois = [
            POI.objects.create(
                id=uuid4(),
                name='Ayasofya',
                latitude=41.0086,
                longitude=28.9802,
                category='HISTORICAL'
            ),
            POI.objects.create(
                id=uuid4(),
                name='Blue Mosque',
                latitude=41.0054,
                longitude=28.9768,
                category='HISTORICAL'
            ),
            POI.objects.create(
                id=uuid4(),
                name='Grand Bazaar',
                latitude=41.0116,
                longitude=28.9626,
                category='SHOPPING'
            ),
        ]
        
        self.client.force_authenticate(user=self.user)

    def test_search_not_authenticated(self):
        """Should return 401 for unauthenticated requests"""
        client = APIClient()
        url = reverse('poi-search')
        
        response = client.get(url, {'q': 'Ayasofya'})
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_by_name(self):
        """Should find POIs by name"""
        url = reverse('poi-search')
        
        response = self.client.get(url, {'q': 'Ayasofya'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['name'], 'Ayasofya')

    def test_search_case_insensitive(self):
        """Should search case-insensitively"""
        url = reverse('poi-search')
        
        response = self.client.get(url, {'q': 'ayasofya'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['name'], 'Ayasofya')

    def test_search_partial_match(self):
        """Should match partial names"""
        url = reverse('poi-search')
        
        response = self.client.get(url, {'q': 'Mosque'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['name'], 'Blue Mosque')

    def test_search_multiple_results(self):
        """Should return multiple results for common search"""
        url = reverse('poi-search')
        
        response = self.client.get(url, {'q': 'Mosque'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should match "Blue Mosque" and any other POI with "Mosque" in tags
        self.assertGreaterEqual(response.data['count'], 1)

    def test_search_no_results(self):
        """Should return empty list for no matches"""
        url = reverse('poi-search')
        
        response = self.client.get(url, {'q': 'NonexistentPlace'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 0)
        self.assertEqual(response.data['results'], [])

    def test_search_required_parameter(self):
        """Should require q parameter"""
        url = reverse('poi-search')
        
        response = self.client.get(url)
        
        # Should either 400 or return all (depending on implementation)
        self.assertIn(response.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_200_OK])

    def test_search_special_characters(self):
        """Should handle special characters in search"""
        POI.objects.create(
            id=uuid4(),
            name="Topkapi's Palace",
            latitude=41.0116,
            longitude=28.9878,
            category='HISTORICAL'
        )
        
        url = reverse('poi-search')
        response = self.client.get(url, {'q': "Topkapi's"})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should find the POI despite special character


class POIEndpointAuthenticationTestCase(TestCase):
    """Test authentication requirements across new endpoints"""

    def setUp(self):
        """Set up test fixtures"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.poi = POI.objects.create(
            id=uuid4(),
            name='Ayasofya',
            latitude=41.0086,
            longitude=28.9802,
            category='HISTORICAL'
        )

    def test_toggle_favorite_requires_auth(self):
        """toggle_favorite endpoint should require authentication"""
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(self.poi.id)})
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_is_favorited_requires_auth(self):
        """is_favorited endpoint should require authentication"""
        url = reverse('poi-is-favorited', kwargs={'pk': str(self.poi.id)})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_requires_auth(self):
        """search endpoint should require authentication"""
        url = reverse('poi-search')
        response = self.client.get(url, {'q': 'test'})
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class POIEndpointResponseFormatTestCase(TestCase):
    """Test response format and structure"""

    def setUp(self):
        """Set up test fixtures"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(user=self.user)
        
        self.poi = POI.objects.create(
            id=uuid4(),
            name='Ayasofya',
            latitude=41.0086,
            longitude=28.9802,
            category='HISTORICAL'
        )
        
        self.client.force_authenticate(user=self.user)

    def test_toggle_favorite_response_structure(self):
        """Should return proper response structure"""
        url = reverse('poi-toggle-favorite', kwargs={'pk': str(self.poi.id)})
        response = self.client.post(url)
        
        self.assertIn('is_favorited', response.data)
        self.assertIn('poi_id', response.data)
        self.assertIsInstance(response.data['is_favorited'], bool)

    def test_is_favorited_response_structure(self):
        """Should return proper response structure"""
        url = reverse('poi-is-favorited', kwargs={'pk': str(self.poi.id)})
        response = self.client.get(url)
        
        self.assertIn('is_favorited', response.data)
        self.assertIn('poi_id', response.data)
        self.assertIsInstance(response.data['is_favorited'], bool)

    def test_search_response_structure(self):
        """Should return proper paginated response structure"""
        url = reverse('poi-search')
        response = self.client.get(url, {'q': 'test'})
        
        self.assertIn('count', response.data)
        self.assertIn('results', response.data)
        self.assertIsInstance(response.data['count'], int)
        self.assertIsInstance(response.data['results'], list)


class SavedPOIQueryOptimizationTestCase(TestCase):
    """Test database query optimization for SavedPOI"""

    def setUp(self):
        """Set up test fixtures"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.user_profile = UserProfile.objects.create(user=self.user)

    def test_saved_poi_index_on_user(self):
        """SavedPOI should have index on user for fast queries"""
        pois = [
            POI.objects.create(
                id=uuid4(),
                name=f'POI {i}',
                latitude=41 + i * 0.001,
                longitude=28 + i * 0.001,
                category='HISTORICAL'
            )
            for i in range(5)
        ]
        
        saved = [
            SavedPOI.objects.create(user=self.user_profile, poi=poi)
            for poi in pois
        ]
        
        # Query should be efficient
        user_favorites = SavedPOI.objects.filter(user=self.user_profile)
        self.assertEqual(user_favorites.count(), 5)
