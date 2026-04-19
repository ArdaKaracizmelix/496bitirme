/**
 * TripService - API integration for trip/itinerary management
 * Handles all API calls related to trips, itineraries, and route optimization
 */
import api from './api';

class TripService {
  /**
   * Fetch all trips for the current user
   * Supports filtering by status and date range
   */
  async fetchTrips(params = {}) {
    try {
      const response = await api.get('/trips/itineraries/', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching trips:', error);
      throw error;
    }
  }

  /**
   * Fetch upcoming trips (starts in the future)
   */
  async fetchUpcomingTrips() {
    try {
      const response = await api.get('/trips/itineraries/', {
        params: { upcoming: 'true' },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching upcoming trips:', error);
      throw error;
    }
  }

  /**
   * Fetch past trips (already completed)
   */
  async fetchPastTrips() {
    try {
      const response = await api.get('/trips/itineraries/', {
        params: { past: 'true' },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching past trips:', error);
      throw error;
    }
  }

  /**
   * Fetch a single trip by ID
   */
  async fetchTripById(tripId) {
    try {
      const response = await api.get(`/trips/itineraries/${tripId}/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new trip
   */
  async createTrip(tripData) {
    try {
      const response = await api.post('/trips/itineraries/', tripData);
      return response.data;
    } catch (error) {
      console.error('Error creating trip:', error);
      throw error;
    }
  }

  /**
   * Generate trip from city + duration + interests
   */
  async generateTripFromPreferences(payload) {
    try {
      const response = await api.post('/trips/itineraries/generate_from_preferences/', payload, {
        timeout: 120000,
      });
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        'Trip generation request failed';
      console.warn('Trip generation failed:', { status, message });
      throw error;
    }
  }

  /**
   * Update an existing trip
   */
  async updateTrip(tripId, tripData) {
    try {
      const response = await api.patch(`/trips/itineraries/${tripId}/`, tripData);
      return response.data;
    } catch (error) {
      console.error(`Error updating trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a trip
   */
  async deleteTrip(tripId) {
    try {
      await api.delete(`/trips/itineraries/${tripId}/`);
      return true;
    } catch (error) {
      console.error(`Error deleting trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Add a POI to a trip
   */
  async addStopToTrip(tripId, poiId, orderIndex = null) {
    try {
      const payload = {
        poi_id: poiId,
        ...(orderIndex !== null && { order_index: orderIndex }),
      };
      const response = await api.post(`/trips/itineraries/${tripId}/add_stop/`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error adding stop to trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a stop from a trip
   */
  async removeStopFromTrip(tripId, itemId) {
    try {
      await api.delete(`/trips/itinerary-items/${itemId}/`);
      return true;
    } catch (error) {
      console.error(`Error removing stop from trip:`, error);
      throw error;
    }
  }

  /**
   * Reorder stops in a trip (for drag-and-drop)
   */
  async reorderStops(tripId, stopsData) {
    try {
      // Send array of stop IDs with their new order
      const response = await api.patch(`/trips/itineraries/${tripId}/reorder_stops/`, {
        stops: stopsData,
      });
      return response.data;
    } catch (error) {
      console.error(`Error reordering stops in trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Optimize route using backend TSP solver
   */
  async optimizeRoute(tripId, transportMode = 'DRIVING') {
    try {
      const response = await api.post(`/trips/itineraries/${tripId}/optimize_route/`, {
        mode: transportMode,
      });
      return response.data;
    } catch (error) {
      console.error(`Error optimizing route for trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Get polyline for route visualization on map
   */
  async getRoutePolyline(tripId) {
    try {
      const response = await api.get(`/trips/itineraries/${tripId}/route_polyline/`);
      return response.data;
    } catch (error) {
      // Backend may not expose a dedicated polyline endpoint.
      // Fall back to raw itinerary stop points so UI can still render a route line.
      if (error?.response?.status === 404) {
        const trip = await this.fetchTripById(tripId);
        const points = (trip?.stops || [])
          .map((stop) => {
            const latitude = stop?.poi?.latitude ?? stop?.latitude;
            const longitude = stop?.poi?.longitude ?? stop?.longitude;
            if (typeof latitude !== 'number' || typeof longitude !== 'number') {
              return null;
            }
            return { latitude, longitude };
          })
          .filter(Boolean);

        return { points };
      }
      console.error(`Error getting polyline for trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Save/finalize trip
   */
  async saveTrip(tripId) {
    try {
      const response = await api.patch(`/trips/itineraries/${tripId}/`, {
        status: 'ACTIVE',
      });
      return response.data;
    } catch (error) {
      console.error(`Error saving trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Clone a public trip for current user
   */
  async cloneTrip(tripId) {
    try {
      const response = await api.post(`/trips/itineraries/${tripId}/clone/`);
      return response.data;
    } catch (error) {
      console.error(`Error cloning trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Share trip and get share link
   */
  async shareTrip(tripId) {
    try {
      const response = await api.get(`/trips/itineraries/${tripId}/generate_share_link/`);
      return response.data;
    } catch (error) {
      console.error(`Error sharing trip ${tripId}:`, error);
      throw error;
    }
  }

  /**
   * Export trip to calendar
   */
  async exportToCalendar(tripId) {
    try {
      const response = await api.post(`/trips/itineraries/${tripId}/export_to_calendar/`);
      return response.data;
    } catch (error) {
      console.error(`Error exporting trip ${tripId} to calendar:`, error);
      throw error;
    }
  }

  /**
   * Get trip summary for sharing
   */
  async getTripSummary(tripId) {
    try {
      const response = await api.get(`/trips/itineraries/${tripId}/summary/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching trip summary for ${tripId}:`, error);
      throw error;
    }
  }
}

export default new TripService();
