from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.gis.geos import Point
from unittest.mock import patch, MagicMock

from .models import Itinerary, ItineraryItem
from locations.models import POI
from .services import RouteOptimizer, TransportMode


class ItineraryModelTest(TestCase):
    """Test cases for Itinerary model"""

    def setUp(self):
        """Set up test data"""
        User = get_user_model()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.start_date = timezone.now()
        self.end_date = self.start_date + timedelta(days=7)

    def test_itinerary_creation(self):
        """Test creating an itinerary"""
        itinerary = Itinerary.objects.create(
            user=self.user,
            title='Paris Trip',
            start_date=self.start_date,
            end_date=self.end_date,
        )
        self.assertEqual(itinerary.title, 'Paris Trip')
        self.assertEqual(itinerary.status, Itinerary.Status.DRAFT)
        self.assertEqual(itinerary.visibility, Itinerary.Visibility.PRIVATE)

    def test_itinerary_get_total_duration(self):
        """Test get_total_duration method"""
        itinerary = Itinerary.objects.create(
            user=self.user,
            title='Test Trip',
            start_date=self.start_date,
            end_date=self.end_date,
        )
        # Should return 0 for empty itinerary
        self.assertEqual(itinerary.get_total_duration(), 0)

    def test_itinerary_clone(self):
        """Test cloning an itinerary"""
        User = get_user_model()
        new_user = User.objects.create_user(username='newuser', password='newpass')

        itinerary = Itinerary.objects.create(
            user=self.user,
            title='Original Trip',
            start_date=self.start_date,
            end_date=self.end_date,
            visibility=Itinerary.Visibility.PUBLIC,
        )

        cloned = itinerary.clone(new_user)
        self.assertNotEqual(cloned.id, itinerary.id)
        self.assertEqual(cloned.user, new_user)
        self.assertEqual(cloned.status, Itinerary.Status.DRAFT)
        self.assertIn('Copy', cloned.title)

    def test_itinerary_clone_private_fails(self):
        """Test that cloning a private itinerary fails"""
        itinerary = Itinerary.objects.create(
            user=self.user,
            title='Private Trip',
            start_date=self.start_date,
            end_date=self.end_date,
            visibility=Itinerary.Visibility.PRIVATE,
        )

        User = get_user_model()
        new_user = User.objects.create_user(username='newuser', password='newpass')

        with self.assertRaises(ValueError):
            itinerary.clone(new_user)

    def test_itinerary_generate_share_link(self):
        """Test generating a share link"""
        itinerary = Itinerary.objects.create(
            user=self.user,
            title='Shareable Trip',
            start_date=self.start_date,
            end_date=self.end_date,
            visibility=Itinerary.Visibility.PUBLIC,
        )

        share_link = itinerary.generate_share_link()
        self.assertIn('/trips/share/', share_link)


class ItineraryItemModelTest(TestCase):
    """Test cases for ItineraryItem model"""

    def setUp(self):
        """Set up test data"""
        User = get_user_model()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.start_date = timezone.now()
        self.end_date = self.start_date + timedelta(days=7)

        self.itinerary = Itinerary.objects.create(
            user=self.user,
            title='Test Trip',
            start_date=self.start_date,
            end_date=self.end_date,
        )

        self.poi = POI.objects.create(
            name='Eiffel Tower',
            address='Paris, France',
            location=Point(2.2945, 48.8584),
            category=POI.Category.HISTORICAL,
        )

    def test_itinerary_item_creation(self):
        """Test creating an itinerary item"""
        item = ItineraryItem.objects.create(
            itinerary=self.itinerary,
            poi=self.poi,
            order_index=0,
            arrival_time=None,
            notes='Visit the tower',
        )
        self.assertEqual(item.order_index, 0)
        self.assertEqual(item.notes, 'Visit the tower')

    def test_itinerary_item_unique_order(self):
        """Test that order_index is unique per itinerary"""
        ItineraryItem.objects.create(
            itinerary=self.itinerary,
            poi=self.poi,
            order_index=0,
        )

        # Try to create duplicate order_index
        with self.assertRaises(Exception):
            ItineraryItem.objects.create(
                itinerary=self.itinerary,
                poi=self.poi,
                order_index=0,
            )


class ItineraryAPITest(APITestCase):
    """Test cases for Itinerary API endpoints"""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='apiuser', password='password')
        self.other_user = User.objects.create_user(username='otheruser', password='password')
        self.client.force_authenticate(user=self.user)
        
        self.poi = POI.objects.create(
            name='Test POI',
            location=Point(0, 0),
            category=POI.Category.NATURE
        )

    def test_create_itinerary(self):
        """Test creating a new itinerary via API"""
        url = reverse('trips:itinerary-list')
        data = {
            'title': 'My API Trip',
            'start_date': timezone.now(),
            'end_date': timezone.now() + timedelta(days=5),
            'status': 'DRAFT',
            'visibility': 'PRIVATE'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Itinerary.objects.count(), 1)
        self.assertEqual(Itinerary.objects.get().user, self.user)

    def test_list_itineraries_filtering(self):
        """Test listing itineraries with visibility rules"""
        # Create private itinerary for user
        Itinerary.objects.create(user=self.user, title='My Private', start_date=timezone.now(), end_date=timezone.now(), visibility='PRIVATE')
        # Create public itinerary for user
        Itinerary.objects.create(user=self.user, title='My Public', start_date=timezone.now(), end_date=timezone.now(), visibility='PUBLIC')
        # Create private itinerary for other user (should not see)
        Itinerary.objects.create(user=self.other_user, title='Other Private', start_date=timezone.now(), end_date=timezone.now(), visibility='PRIVATE')
        # Create public itinerary for other user (should see)
        Itinerary.objects.create(user=self.other_user, title='Other Public', start_date=timezone.now(), end_date=timezone.now(), visibility='PUBLIC')

        url = reverse('trips:itinerary-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should see 3 itineraries: My Private, My Public, Other Public
        self.assertEqual(len(response.data['results']), 3)

    def test_update_itinerary_permission(self):
        """Test that only owner can update itinerary"""
        itinerary = Itinerary.objects.create(user=self.other_user, title='Other Trip', start_date=timezone.now(), end_date=timezone.now(), visibility='PUBLIC')
        url = reverse('trips:itinerary-detail', args=[itinerary.id])
        data = {'title': 'Hacked Trip'}
        
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_clone_action(self):
        """Test cloning a public itinerary via API"""
        public_trip = Itinerary.objects.create(
            user=self.other_user, 
            title='Public Trip', 
            start_date=timezone.now(), 
            end_date=timezone.now(), 
            visibility='PUBLIC'
        )
        url = reverse('trips:itinerary-clone', args=[public_trip.id])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Itinerary.objects.filter(user=self.user, title__contains='Copy').count(), 1)

    def test_optimize_route_action(self):
        """Test route optimization endpoint"""
        itinerary = Itinerary.objects.create(user=self.user, title='Trip', start_date=timezone.now(), end_date=timezone.now())
        poi1 = POI.objects.create(name='P1', location=Point(0, 0), category='NATURE')
        poi2 = POI.objects.create(name='P2', location=Point(1, 1), category='NATURE')
        
        ItineraryItem.objects.create(itinerary=itinerary, poi=poi1, order_index=0)
        ItineraryItem.objects.create(itinerary=itinerary, poi=poi2, order_index=1)
        
        url = reverse('trips:itinerary-optimize-route', args=[itinerary.id])
        
        # Mock the service call
        with patch('trips.services.RouteOptimizer') as MockOptimizer:
            instance = MockOptimizer.return_value
            # Mock optimize_route to return POIs in reverse order
            instance.optimize_route.return_value = [poi2, poi1]
            
            response = self.client.post(url, {'mode': 'DRIVING'}, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # Check if order was updated in DB
            item1 = ItineraryItem.objects.get(itinerary=itinerary, poi=poi1)
            item2 = ItineraryItem.objects.get(itinerary=itinerary, poi=poi2)
            self.assertEqual(item2.order_index, 0)
            self.assertEqual(item1.order_index, 1)


class ItineraryItemAPITest(APITestCase):
    """Test cases for ItineraryItem API endpoints"""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='apiuser', password='password')
        self.client.force_authenticate(user=self.user)
        self.itinerary = Itinerary.objects.create(user=self.user, title='Trip', start_date=timezone.now(), end_date=timezone.now())
        self.poi = POI.objects.create(name='POI', location=Point(0, 0), category='NATURE')

    def test_add_item(self):
        """Test adding an item to itinerary"""
        url = reverse('trips:itinerary-item-list')
        data = {
            'itinerary': self.itinerary.id,
            'poi_id': self.poi.id,
            'order_index': 0,
            'notes': 'Test note'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ItineraryItem.objects.count(), 1)

    def test_bulk_reorder(self):
        """Test bulk reordering of items"""
        item1 = ItineraryItem.objects.create(itinerary=self.itinerary, poi=self.poi, order_index=0)
        poi2 = POI.objects.create(name='POI2', location=Point(1, 1), category='NATURE')
        item2 = ItineraryItem.objects.create(itinerary=self.itinerary, poi=poi2, order_index=1)
        
        url = reverse('trips:itinerary-item-bulk-reorder')
        data = {
            'itinerary_id': self.itinerary.id,
            'order': [
                {'id': item1.id, 'order_index': 1},
                {'id': item2.id, 'order_index': 0}
            ]
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        item1.refresh_from_db()
        item2.refresh_from_db()
        self.assertEqual(item1.order_index, 1)
        self.assertEqual(item2.order_index, 0)


class RouteOptimizerServiceTest(TestCase):
    """Test cases for RouteOptimizer service logic"""

    def test_optimize_route_logic(self):
        """Test TSP nearest neighbor logic"""
        # Mock the client
        mock_client = MagicMock()
        
        # Matrix indices: 0=A, 1=B, 2=C
        # Matrix:
        #   A   B   C
        # A 0   10  2
        # B 10  0   8
        # C 2   8   0
        # Nearest neighbor from A(0): C(2) (dist 2)
        # Nearest neighbor from C(2): B(1) (dist 8)
        # Path: A -> C -> B
        
        mock_client.get_distance_matrix.return_value = [
            [0, 10, 2],
            [10, 0, 8],
            [2, 8, 0]
        ]
        
        optimizer = RouteOptimizer(mock_client)
        
        poi_a = MagicMock()
        poi_a.location = Point(0, 0)
        poi_b = MagicMock()
        poi_b.location = Point(0, 10)
        poi_c = MagicMock()
        poi_c.location = Point(0, 2)
        
        stops = [poi_a, poi_b, poi_c]
        
        optimized = optimizer.optimize_route(stops, TransportMode.DRIVING)
        
        self.assertEqual(optimized, [poi_a, poi_c, poi_b])
