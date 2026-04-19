/**
 * Location Service - API calls for POI and map-related endpoints
 * Handles interaction with the backend locations, recommendations, and trips APIs
 */

import axios from 'axios';
import api from './api';

export const locationService = {
  /**
   * Fetch POIs near a specific location
   * @param {number} latitude - User's latitude
   * @param {number} longitude - User's longitude
   * @param {number} radius - Search radius in meters (default: 5000)
   * @param {Object} filters - Optional filters (category, min_rating)
   * @returns {Promise<Object>} - { count, results: POI[] }
   */
  fetchNearbyPOIs: async (latitude, longitude, radius = 5000, filters = {}) => {
    try {
      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        radius: radius.toString(),
      });

      // Add optional filters
      if (filters.category) {
        params.append('category', filters.category);
      }
      if (filters.min_rating) {
        params.append('min_rating', filters.min_rating.toString());
      }
      if (Array.isArray(filters.interests) && filters.interests.length > 0) {
        params.append('interests', filters.interests.join(','));
      }
      if (filters.interests_only) {
        params.append('interests_only', 'true');
      }

      const response = await api.get(`/locations/pois/nearby/?${params}`, {
        skipAuth: true,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby POIs:', error);
      throw error;
    }
  },

  /**
   * Fetch POIs in a viewport (bounding box)
   * @param {Object} viewport - { north, south, east, west }
   * @returns {Promise<Object>} - { count, results: POI[] }
   */
  fetchPOIsInViewport: async (viewport, filters = {}) => {
    try {
      const params = new URLSearchParams({
        north: viewport.north.toString(),
        south: viewport.south.toString(),
        east: viewport.east.toString(),
        west: viewport.west.toString(),
      });
      if (filters.category) {
        params.append('category', filters.category);
      }
      if (filters.min_rating) {
        params.append('min_rating', filters.min_rating.toString());
      }

      const response = await api.get(`/locations/pois/viewport/?${params}`, {
        skipAuth: true,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching POIs in viewport:', error);
      throw error;
    }
  },

  /**
   * Fetch generic POI list (fallback when nearby query has no results)
   * @returns {Promise<Object>} - paginated POI list
   */
  fetchPOIsList: async () => {
    try {
      const response = await api.get('/locations/pois/', {
        skipAuth: true,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching POI list:', error);
      throw error;
    }
  },

  /**
   * Fetch available city list inferred from POI data
   * @param {string} query - Optional text query for autocomplete
   * @returns {Promise<Array<string>>}
   */
  fetchAvailableCities: async (query = '') => {
    const typed = String(query || '').trim();
    if (typed.length < 2) {
      try {
        const response = await api.get('/locations/pois/cities/', {
          skipAuth: true,
        });
        return response.data?.results || [];
      } catch (error) {
        console.error('Error fetching supported cities:', error);
        return [];
      }
    }

    // Primary: global city search (dynamic, worldwide, not fixed local list)
    try {
      const external = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
          name: typed,
          count: 10,
          language: 'en',
          format: 'json',
        },
        timeout: 7000,
      });

      const results = Array.isArray(external?.data?.results) ? external.data.results : [];
      const names = [];
      const seen = new Set();
      for (const item of results) {
        const name = String(item?.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
      }
      if (names.length > 0) {
        return names;
      }
    } catch (error) {
      // Silent fallback to backend endpoint.
    }

    // Fallback: backend city suggestions
    try {
      const params = new URLSearchParams();
      params.append('q', typed);
      const path = params.toString()
        ? `/locations/pois/cities/?${params.toString()}`
        : '/locations/pois/cities/';
      const response = await api.get(path, {
        skipAuth: true,
      });
      return response.data?.results || [];
    } catch (error) {
      console.error('Error fetching available cities:', error);
      throw error;
    }
  },

  /**
   * Trigger POI generation/sync for a city and return generated nearby POIs.
   * Uses backend's external sync pipeline (Google Places integration).
   * @param {string} city
   * @param {Array<string>} interests
   * @param {number} radius
   */
  generatePOIsForCity: async (city, interests = [], radius = 20000) => {
    try {
      const response = await api.post('/locations/pois/generate_for_city/', {
        city,
        interests,
        radius,
      });
      return response.data;
    } catch (error) {
      console.error('Error generating POIs for city:', error);
      throw error;
    }
  },

  /**
   * Fetch a single POI's details
   * @param {string} poiId - UUID of the POI
   * @returns {Promise<Object>} - POI with full details
   */
  fetchPOIDetails: async (poiId) => {
    try {
      const response = await api.get(`/locations/pois/${poiId}/`, {
        skipAuth: true,
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching POI details:', error);
      throw error;
    }
  },

  /**
   * Search for POIs by name or tags
   * @param {string} query - Search term
   * @returns {Promise<Object>} - { count, results: POI[] }
   */
  searchPOIs: async (query) => {
    try {
      const response = await api.get(`/locations/pois/search/?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('Error searching POIs:', error);
      throw error;
    }
  },

  /**
   * Fetch reviews for a specific POI
   * @param {string} poiId - UUID of the POI
   * @param {number} page - Pagination page number (default: 1)
   * @returns {Promise<Object>} - { count, next, results: Review[] }
   */
  fetchPOIReviews: async (poiId, page = 1) => {
    try {
      const response = await api.get(`/recommendations/reviews/?poi=${poiId}&page=${page}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching POI reviews:', error);
      throw error;
    }
  },

  /**
   * Submit a new review for a POI
   * @param {string} poiId - UUID of the POI
   * @param {number} rating - Rating 1-5
   * @param {string} comment - Review text
   * @returns {Promise<Object>} - Created review object
   */
  submitReview: async (poiId, rating, comment) => {
    try {
      const response = await api.post('/recommendations/reviews/', {
        poi: poiId,
        rating,
        comment,
      });
      return response.data;
    } catch (error) {
      console.error('Error submitting review:', error);
      throw error;
    }
  },

  /**
   * Record a user interaction with a POI
   * @param {string} poiId - UUID of the POI
   * @param {string} interactionType - Type: VIEW, LIKE, SHARE, VISIT, CLICK, CHECK_IN
   * @returns {Promise<Object>} - Created interaction object
   */
  recordInteraction: async (poiId, interactionType) => {
    try {
      const response = await api.post('/recommendations/interactions/', {
        poi: poiId,
        interaction_type: interactionType,
      });
      return response.data;
    } catch (error) {
      console.error('Error recording interaction:', error);
      throw error;
    }
  },

  /**
   * Add a POI to an itinerary
   * @param {string} itineraryId - UUID of the itinerary
   * @param {string} poiId - UUID of the POI
   * @param {number} order - Order/position in the itinerary
   * @returns {Promise<Object>} - Created itinerary item
   */
  addPOIToItinerary: async (itineraryId, poiId, order) => {
    try {
      const response = await api.post('/trips/itinerary-items/', {
        itinerary: itineraryId,
        poi_id: poiId,
        order_index: order,
      });
      return response.data;
    } catch (error) {
      console.error('Error adding POI to itinerary:', error);
      throw error;
    }
  },

  /**
   * Fetch user's itineraries (for "add to itinerary" modal)
   * @returns {Promise<Object>} - { count, results: Itinerary[] }
   */
  fetchUserItineraries: async () => {
    try {
      const response = await api.get('/trips/itineraries/');
      return response.data;
    } catch (error) {
      console.error('Error fetching itineraries:', error);
      throw error;
    }
  },

  /**
   * Toggle favorite status for a POI
   * @param {string} poiId - UUID of the POI
   * @returns {Promise<Object>} - Updated favorite status
   */
  toggleFavorite: async (poiId) => {
    try {
      const response = await api.post(`/locations/pois/${poiId}/toggle_favorite/`);
      return response.data;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  },

  /**
   * Check if a POI is favorited by current user
   * @param {string} poiId - UUID of the POI
   * @returns {Promise<boolean>} - True if favorited
   */
  isFavorited: async (poiId) => {
    try {
      const response = await api.get(`/locations/pois/${poiId}/is_favorited/`);
      return response.data.is_favorited;
    } catch (error) {
      console.error('Error checking favorite status:', error);
      return false;
    }
  },
};

export default locationService;
