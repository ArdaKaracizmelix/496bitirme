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
from user.models import UserProfile


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
        """Test listing own itineraries by default and mixed list when requested."""
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
        # Default list should show only current user's itineraries.
        self.assertEqual(len(response.data['results']), 2)
        self.assertTrue(all(item['username'] == self.user.username for item in response.data['results']))

        response_with_public = self.client.get(url, {'include_public': 'true'})
        self.assertEqual(response_with_public.status_code, status.HTTP_200_OK)
        # Mixed list should include current user + other users' public itineraries.
        self.assertEqual(len(response_with_public.data['results']), 3)

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

    def test_generate_from_preferences_creates_itinerary(self):
        """Test AI-style itinerary generation using city, duration and interests."""
        POI.objects.create(
            name='Hagia Sophia',
            address='Sultanahmet, Istanbul',
            location=Point(28.9802, 41.0086),
            category=POI.Category.HISTORICAL,
            average_rating=4.8,
            tags=['historical', 'istanbul', 'museum'],
        )
        POI.objects.create(
            name='Galata Tower',
            address='Beyoglu, Istanbul',
            location=Point(28.9741, 41.0256),
            category=POI.Category.HISTORICAL,
            average_rating=4.7,
            tags=['historical', 'istanbul'],
        )
        POI.objects.create(
            name='Istanbul Cafe',
            address='Kadikoy, Istanbul',
            location=Point(29.0300, 40.9920),
            category=POI.Category.FOOD,
            average_rating=4.5,
            tags=['food', 'istanbul', 'cafe'],
        )

        url = reverse('trips:itinerary-generate-from-preferences')
        data = {
            'city': 'Istanbul',
            'duration_days': 2,
            'interests': ['historical', 'food'],
            'stops_per_day': 2,
        }
        response = self.client.post(url, data, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('itinerary', response.data)
        self.assertIn('day_plan', response.data)
        self.assertEqual(response.data['summary']['city'], 'Istanbul')
        self.assertEqual(Itinerary.objects.filter(user=self.user).count(), 1)
        generated_count = ItineraryItem.objects.filter(itinerary__user=self.user).count()
        self.assertGreaterEqual(generated_count, 3)
        self.assertLessEqual(generated_count, 4)

    def test_generate_from_preferences_returns_error_when_city_has_no_pois(self):
        """Test generation returns 400 when there are no POIs in selected city."""
        url = reverse('trips:itinerary-generate-from-preferences')
        response = self.client.post(
            url,
            {
                'city': 'NonExistingCity',
                'duration_days': 2,
                'interests': ['nature'],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_generate_from_preferences_creates_new_draft_when_other_draft_exists(self):
        """Test generation creates a new draft instead of overwriting an existing draft."""
        old_trip = Itinerary.objects.create(
            user=self.user,
            title='Old Draft',
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=1),
            status=Itinerary.Status.DRAFT,
            visibility=Itinerary.Visibility.PRIVATE,
            transport_mode=Itinerary.TransportMode.DRIVING,
        )

        old_poi = POI.objects.create(
            name='Old Stop',
            address='Besiktas, Istanbul',
            location=Point(29.0000, 41.0500),
            category=POI.Category.HISTORICAL,
            average_rating=4.2,
            tags=['istanbul', 'historical'],
        )
        ItineraryItem.objects.create(itinerary=old_trip, poi=old_poi, order_index=0)

        POI.objects.create(
            name='New Stop 1',
            address='Kadikoy, Istanbul',
            location=Point(29.0300, 40.9920),
            category=POI.Category.FOOD,
            average_rating=4.8,
            tags=['istanbul', 'food'],
        )
        POI.objects.create(
            name='New Stop 2',
            address='Uskudar, Istanbul',
            location=Point(29.0150, 41.0220),
            category=POI.Category.NATURE,
            average_rating=4.6,
            tags=['istanbul', 'nature'],
        )

        url = reverse('trips:itinerary-generate-from-preferences')
        response = self.client.post(
            url,
            {
                'city': 'Istanbul',
                'duration_days': 1,
                'interests': ['food', 'nature'],
                'stops_per_day': 2,
                'title': 'Updated Draft',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Itinerary.objects.filter(user=self.user).count(), 2)

        old_trip.refresh_from_db()
        self.assertEqual(old_trip.title, 'Old Draft')
        self.assertEqual(old_trip.status, Itinerary.Status.DRAFT)
        self.assertEqual(ItineraryItem.objects.filter(itinerary=old_trip).count(), 1)

        new_trip_id = response.data['itinerary']['id']
        self.assertNotEqual(str(new_trip_id), str(old_trip.id))
        new_trip = Itinerary.objects.get(id=new_trip_id)
        self.assertEqual(new_trip.title, 'Updated Draft')
        self.assertEqual(new_trip.status, Itinerary.Status.DRAFT)
        self.assertEqual(ItineraryItem.objects.filter(itinerary=new_trip).count(), 2)

    def test_generate_from_preferences_uses_profile_interests_when_payload_missing(self):
        """Test generation merges profile interests when request interests are not provided."""
        profile = getattr(self.user, 'profile', None)
        if profile is None:
            profile = UserProfile.objects.create(user=self.user)
        profile.preferences_vector = {'food': 1.0}
        profile.save(update_fields=['preferences_vector'])

        food_poi = POI.objects.create(
            name='Food Spot',
            address='Kadikoy, Istanbul',
            location=Point(29.0301, 40.9921),
            category=POI.Category.FOOD,
            average_rating=4.9,
            tags=['food', 'istanbul'],
        )
        POI.objects.create(
            name='Generic Spot',
            address='Beyoglu, Istanbul',
            location=Point(28.9742, 41.0257),
            category=POI.Category.ENTERTAINMENT,
            average_rating=3.8,
            tags=['istanbul'],
        )

        url = reverse('trips:itinerary-generate-from-preferences')
        response = self.client.post(
            url,
            {
                'city': 'Istanbul',
                'duration_days': 1,
                'stops_per_day': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('food', response.data['summary']['interests'])
        first_stop_poi_id = response.data['itinerary']['stops'][0]['poi']['id']
        first_stop = response.data['itinerary']['stops'][0]['poi']
        self.assertIn(first_stop['category'], [POI.Category.FOOD, 'FOOD_DRINK'])
        self.assertIn(
            'food',
            [str(tag).lower() for tag in (first_stop.get('tags') or [])]
        )

    @patch('trips.services.TripGenerationService._plan_with_ai')
    def test_generate_from_preferences_uses_ai_plan_when_available(self, mock_ai_plan):
        """Test generation applies AI-selected POI order and marks source as AI."""
        poi1 = POI.objects.create(
            name='Stop One',
            address='Sultanahmet, Istanbul',
            location=Point(28.9803, 41.0087),
            category=POI.Category.HISTORICAL,
            average_rating=4.4,
            tags=['historical', 'istanbul'],
        )
        POI.objects.create(
            name='Stop Two',
            address='Beyoglu, Istanbul',
            location=Point(28.9743, 41.0258),
            category=POI.Category.ENTERTAINMENT,
            average_rating=4.3,
            tags=['entertainment', 'istanbul'],
        )
        poi3 = POI.objects.create(
            name='Stop Three',
            address='Kadikoy, Istanbul',
            location=Point(29.0302, 40.9922),
            category=POI.Category.FOOD,
            average_rating=4.6,
            tags=['food', 'istanbul'],
        )

        mock_ai_plan.return_value = {
            'selected_pois': [poi3, poi1],
            'daily_themes': ['Mixed discovery'],
        }

        url = reverse('trips:itinerary-generate-from-preferences')
        response = self.client.post(
            url,
            {
                'city': 'Istanbul',
                'duration_days': 1,
                'interests': ['historical'],
                'stops_per_day': 2,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['summary']['planning_source'], 'ai')
        self.assertEqual(response.data['day_plan'][0]['theme'], 'Mixed discovery')

        stops = response.data['itinerary']['stops']
        self.assertEqual(str(stops[0]['poi']['id']), str(poi3.id))
        self.assertEqual(str(stops[1]['poi']['id']), str(poi1.id))


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
