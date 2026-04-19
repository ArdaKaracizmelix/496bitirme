/**
 * Trip Store using Zustand
 * Manages trip and itinerary state for the Planning & Itinerary Module
 */
import { create } from 'zustand';
import TripService from '../services/TripService';
import { RouteManager, RouteMetrics } from '../services/RouteManager';

/**
 * Zustand store for trip management
 */
const useTripStore = create((set, get) => ({
  // Trip Lists
  upcomingTrips: [],
  pastTrips: [],
  allTrips: [],
  draftTrips: [],

  // Current Trip Being Edited
  currentTrip: null,
  currentTripStops: [],
  currentTripMetrics: null,

  // Loading States
  isLoading: false,
  isOptimizing: false,
  isGenerating: false,
  isRefreshing: false,

  // Error State
  error: null,

  /**
   * Explicitly control AI generation loading state
   */
  setGenerating: (value) => {
    set({ isGenerating: Boolean(value) });
  },

  /**
   * Fetch all trips for user
   */
  fetchAllTrips: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await TripService.fetchTrips();
      set({ allTrips: data.results || data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to fetch all trips:', error);
    }
  },

  /**
   * Fetch upcoming trips
   */
  fetchUpcomingTrips: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await TripService.fetchUpcomingTrips();
      set({ upcomingTrips: data.results || data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to fetch upcoming trips:', error);
    }
  },

  /**
   * Fetch past trips
   */
  fetchPastTrips: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await TripService.fetchPastTrips();
      set({ pastTrips: data.results || data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to fetch past trips:', error);
    }
  },

  /**
   * Refresh all trip lists
   */
  refreshAllTrips: async () => {
    set({ isRefreshing: true, error: null });
    try {
      await Promise.all([
        get().fetchUpcomingTrips(),
        get().fetchPastTrips(),
        get().fetchAllTrips(),
      ]);
      set({ isRefreshing: false });
    } catch (error) {
      set({ error: error.message, isRefreshing: false });
      console.error('Failed to refresh trips:', error);
    }
  },

  /**
   * Load a trip by ID for editing
   */
  loadTrip: async (tripId) => {
    set({ isLoading: true, error: null });
    try {
      const trip = await TripService.fetchTripById(tripId);
      const stops = trip.stops || [];
      
      // Calculate metrics
      const distances = stops.length > 1 
        ? RouteManager.getConsecutiveDistances(stops.map(s => s.poi))
        : [];
      const metrics = RouteManager.calculateMetrics(stops, distances);

      set({
        currentTrip: trip,
        currentTripStops: stops,
        currentTripMetrics: metrics,
        isLoading: false,
      });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to load trip:', error);
    }
  },

  /**
   * Create a new draft trip
   */
  createDraftTrip: async (tripData) => {
    set({ isLoading: true, error: null });
    try {
      const newTrip = await TripService.createTrip({
        ...tripData,
        status: 'DRAFT',
        visibility: 'PRIVATE',
        transport_mode: tripData.transport_mode || 'DRIVING',
      });
      
      set((state) => ({
        draftTrips: [newTrip, ...state.draftTrips],
        currentTrip: newTrip,
        currentTripStops: [],
        currentTripMetrics: new RouteMetrics(0, 0, 0),
        isLoading: false,
      }));
      
      return newTrip;
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to create trip:', error);
      throw error;
    }
  },

  /**
   * Generate itinerary from city + duration + interests
   */
  generateTripFromPreferences: async (payload) => {
    set({ isGenerating: true, error: null });
    try {
      const result = await TripService.generateTripFromPreferences(payload);
      const itinerary = result?.itinerary;
      const stops = itinerary?.stops || [];
      const distances = stops.length > 1
        ? RouteManager.getConsecutiveDistances(stops.map((s) => s.poi))
        : [];
      const metrics = RouteManager.calculateMetrics(stops, distances);

      set((state) => ({
        currentTrip: itinerary || null,
        currentTripStops: stops,
        currentTripMetrics: metrics,
        draftTrips: itinerary ? [itinerary, ...state.draftTrips] : state.draftTrips,
        isGenerating: false,
      }));

      return result;
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        'Failed to generate trip';
      set({ error: message, isGenerating: false });
      console.warn('Failed to generate trip from preferences:', message);
      throw new Error(message);
    }
  },

  /**
   * Update current trip
   */
  updateCurrentTrip: async (updates) => {
    const { currentTrip } = get();
    if (!currentTrip) return;

    set({ isLoading: true, error: null });
    try {
      const updatedTrip = await TripService.updateTrip(currentTrip.id, updates);
      set({
        currentTrip: updatedTrip,
        isLoading: false,
      });
      return updatedTrip;
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to update trip:', error);
      throw error;
    }
  },

  /**
   * Delete a trip
   */
  deleteTrip: async (tripId) => {
    set({ isLoading: true, error: null });
    try {
      await TripService.deleteTrip(tripId);
      
      set((state) => ({
        allTrips: state.allTrips.filter(t => t.id !== tripId),
        upcomingTrips: state.upcomingTrips.filter(t => t.id !== tripId),
        pastTrips: state.pastTrips.filter(t => t.id !== tripId),
        draftTrips: state.draftTrips.filter(t => t.id !== tripId),
        currentTrip: state.currentTrip?.id === tripId ? null : state.currentTrip,
        isLoading: false,
      }));
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to delete trip:', error);
      throw error;
    }
  },

  /**
   * Add stop to current trip
   */
  addStopToTrip: async (poiId) => {
    const { currentTrip, currentTripStops } = get();
    if (!currentTrip) return;

    set({ isLoading: true, error: null });
    try {
      const result = await TripService.addStopToTrip(
        currentTrip.id,
        poiId,
        currentTripStops.length
      );
      
      const newStops = Array.isArray(result.stops) ? result.stops : [...currentTripStops, result];
      const distances = newStops.length > 1 
        ? RouteManager.getConsecutiveDistances(newStops.map(s => s.poi || s))
        : [];
      const metrics = RouteManager.calculateMetrics(newStops, distances);

      set({
        currentTripStops: newStops,
        currentTripMetrics: metrics,
        isLoading: false,
      });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to add stop to trip:', error);
      throw error;
    }
  },

  /**
   * Remove stop from current trip
   */
  removeStopFromTrip: async (itemId) => {
    const { currentTrip, currentTripStops } = get();
    if (!itemId) {
      const error = new Error('Invalid stop id');
      set({ error: error.message });
      throw error;
    }
    if (!currentTrip) {
      const error = new Error('No current trip loaded');
      set({ error: error.message });
      throw error;
    }

    set({ isLoading: true, error: null });
    try {
      await TripService.removeStopFromTrip(currentTrip.id, itemId);
      
      const newStops = currentTripStops.filter(s => s.id !== itemId);
      const distances = newStops.length > 1 
        ? RouteManager.getConsecutiveDistances(newStops.map(s => s.poi))
        : [];
      const metrics = RouteManager.calculateMetrics(newStops, distances);

      set({
        currentTripStops: newStops,
        currentTripMetrics: metrics,
        isLoading: false,
      });
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        'Failed to remove stop from trip';
      set({ error: message, isLoading: false });
      console.error('Failed to remove stop from trip:', error);
      throw new Error(message);
    }
  },

  /**
   * Reorder stops in current trip (for drag-and-drop)
   */
  reorderStops: (newStops) => {
    const distances = newStops.length > 1 
      ? RouteManager.getConsecutiveDistances(newStops.map(s => s.poi))
      : [];
    const metrics = RouteManager.calculateMetrics(newStops, distances);

    set({
      currentTripStops: newStops,
      currentTripMetrics: metrics,
    });
  },

  /**
   * Save reordered stops to backend
   */
  saveReorderedStops: async () => {
    const { currentTrip, currentTripStops } = get();
    if (!currentTrip) return;

    set({ isLoading: true, error: null });
    try {
      const stopsData = currentTripStops.map((stop, index) => ({
        id: stop.id,
        order_index: index,
      }));
      
      await TripService.reorderStops(currentTrip.id, stopsData);
      set({ isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to save reordered stops:', error);
      throw error;
    }
  },

  /**
   * Optimize route using backend algorithm
   */
  optimizeRoute: async (transportMode = 'DRIVING') => {
    const { currentTrip, currentTripStops } = get();
    if (!currentTrip) return;
    if (currentTripStops.length < 3) {
      throw new Error('Optimizasyon için en az 3 durak gerekli');
    }

    set({ isOptimizing: true, error: null });
    try {
      const result = await TripService.optimizeRoute(currentTrip.id, transportMode);
      
      // Update stops with optimized order
      const optimizedStops = result.stops || [];
      const distances = optimizedStops.length > 1 
        ? RouteManager.getConsecutiveDistances(optimizedStops.map(s => s.poi))
        : [];
      const metrics = RouteManager.calculateMetrics(optimizedStops, distances);

      set({
        currentTrip: result,
        currentTripStops: optimizedStops,
        currentTripMetrics: metrics,
        isOptimizing: false,
      });

      return result;
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        'Failed to optimize route';
      set({ error: message, isOptimizing: false });
      console.error('Failed to optimize route:', error);
      throw new Error(message);
    }
  },

  /**
   * Save current trip
   */
  saveCurrentTrip: async () => {
    const { currentTrip } = get();
    if (!currentTrip) return;

    set({ isLoading: true, error: null });
    try {
      const savedTrip = await TripService.saveTrip(currentTrip.id);
      set({
        currentTrip: savedTrip,
        isLoading: false,
      });
      return savedTrip;
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to save trip:', error);
      throw error;
    }
  },

  /**
   * Clear current trip
   */
  clearCurrentTrip: () => {
    set({
      currentTrip: null,
      currentTripStops: [],
      currentTripMetrics: null,
    });
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Clone a public trip
   */
  cloneTrip: async (tripId) => {
    set({ isLoading: true, error: null });
    try {
      const clonedTrip = await TripService.cloneTrip(tripId);
      set((state) => ({
        draftTrips: [clonedTrip, ...state.draftTrips],
        isLoading: false,
      }));
      return clonedTrip;
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to clone trip:', error);
      throw error;
    }
  },

  /**
   * Share trip
   */
  shareTrip: async (tripId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await TripService.shareTrip(tripId);
      set({ isLoading: false });
      return result;
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        error?.message ||
        'Failed to share trip';
      set({ error: message, isLoading: false });
      console.error('Failed to share trip:', error);
      throw new Error(message);
    }
  },

  /**
   * Export trip to calendar
   */
  exportToCalendar: async (tripId) => {
    set({ isLoading: true, error: null });
    try {
      const result = await TripService.exportToCalendar(tripId);
      set({ isLoading: false });
      return result;
    } catch (error) {
      set({ error: error.message, isLoading: false });
      console.error('Failed to export to calendar:', error);
      throw error;
    }
  },
}));

export default useTripStore;
