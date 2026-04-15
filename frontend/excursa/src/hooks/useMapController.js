/**
 * MapController - Custom Hook for Map Business Logic
 * Encapsulates location fetching, filtering, search, and geospatial operations
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import locationService from '../services/locationService';
import { getViewportBounds, clusterMarkers, isValidCoordinates } from '../utils/mapUtils';
import useAuthStore from '../store/authStore';

export const useMapController = () => {
  const user = useAuthStore((state) => state.user);
  // State for location and POI data
  const [displayedMarkers, setDisplayedMarkers] = useState([]);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [currentRegion, setCurrentRegion] = useState({
    latitude: 41.0082,
    longitude: 28.9784,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

  // State for filtering and search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState({
    category: null,
    minRating: 0,
    interestsOnly: false,
  });

  // State for loading and errors
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);

  // Tracking state to prevent redundant API calls
  const lastFetchRegion = useRef(null);
  const fetchDebounceTimer = useRef(null);
  const inFlightRequestKey = useRef(null);
  const dataModeRef = useRef('nearby'); // 'nearby' | 'search'
  const requestSequenceRef = useRef(0);

  /**
   * Check if distance moved is significant enough to warrant new API call
   * @param {Object} newCoords - { latitude, longitude }
   * @returns {boolean} - True if distance > 500m
   */
  const hasMovedSignificantly = useCallback((newRegion) => {
    if (!lastFetchRegion.current) return true;

    const { latitude: lastLat, longitude: lastLon, latitudeDelta: lastLatDelta, longitudeDelta: lastLonDelta } =
      lastFetchRegion.current;
    const { latitude: newLat, longitude: newLon, latitudeDelta: newLatDelta, longitudeDelta: newLonDelta } =
      newRegion;

    // Haversine formula - check if moved > 500m
    const R = 6371000; // Earth's radius in meters
    const dLat = ((newLat - lastLat) * Math.PI) / 180;
    const dLon = ((newLon - lastLon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lastLat * Math.PI) / 180) *
        Math.cos((newLat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const latDeltaRatio =
      typeof newLatDelta === 'number' && typeof lastLatDelta === 'number' && lastLatDelta > 0
        ? Math.abs(newLatDelta - lastLatDelta) / lastLatDelta
        : 0;
    const lonDeltaRatio =
      typeof newLonDelta === 'number' && typeof lastLonDelta === 'number' && lastLonDelta > 0
        ? Math.abs(newLonDelta - lastLonDelta) / lastLonDelta
        : 0;

    // Fetch if moved >500m OR zoom level changed meaningfully.
    return distance > 500 || latDeltaRatio > 0.2 || lonDeltaRatio > 0.2;
  }, []);

  /**
   * Request location permission from OS
   * @returns {Promise<boolean>} - True if permission granted
   */
  const requestLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        // Android location permission handling
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // iOS location permission - handled by Geolocation
        return true;
      }
    } catch (err) {
      console.error('Permission error:', err);
      return false;
    }
  }, []);

  /**
   * Fetch nearby POIs from API
   * @param {Object} region - Map region with latitude, longitude
   * @param {number} radius - Search radius in meters
   */
  const fetchNearbyPlaces = useCallback(
    async (region = currentRegion, radius = 5000, filterOverrides = null, options = {}) => {
      const { force = false } = options;
      // Validate coordinates
      if (!isValidCoordinates(region.latitude, region.longitude)) {
        setError('Invalid coordinates');
        return;
      }

      if (!force && dataModeRef.current === 'search') {
        return;
      }

      // Check if movement is significant
      if (!force && !hasMovedSignificantly(region)) {
        return;
      }

      setIsFetching(true);
      setError(null);

      try {
        // Prepare filters
        const userInterests = Array.isArray(user?.interests)
          ? user.interests
              .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                  return item.name || item.title || '';
                }
                return '';
              })
              .map((value) =>
                String(value || '')
                  .trim()
                  .toLowerCase()
                  .replace(/[\s\-]+/g, '_')
              )
              .filter((item) => item.length > 0)
          : [];
        const effectiveFilters = filterOverrides || activeFilters;
        const filters = {};
        if (effectiveFilters.category) {
          filters.category = effectiveFilters.category;
        }
        if (effectiveFilters.minRating > 0) {
          filters.min_rating = effectiveFilters.minRating;
        }
        if (effectiveFilters.interestsOnly) {
          filters.interests_only = true;
        }
        if (userInterests.length > 0) {
          filters.interests = userInterests;
        }

        // Prevent duplicate in-flight requests for the exact same query.
        const requestKey = JSON.stringify({
          lat: Number(region.latitude).toFixed(6),
          lon: Number(region.longitude).toFixed(6),
          radius,
          category: filters.category || null,
          min_rating: filters.min_rating || 0,
          interests_only: !!filters.interests_only,
          interests: (filters.interests || []).slice().sort(),
        });
        if (inFlightRequestKey.current === requestKey) {
          setIsFetching(false);
          return;
        }
        inFlightRequestKey.current = requestKey;
        const requestId = ++requestSequenceRef.current;

        // Fetch from API
        let response = await locationService.fetchNearbyPOIs(
          region.latitude,
          region.longitude,
          radius,
          filters
        );

        // If nothing is found in 5km, widen search once.
        if ((response.results || []).length === 0 && radius < 50000) {
          response = await locationService.fetchNearbyPOIs(
            region.latitude,
            region.longitude,
            50000,
            filters
          );
        }

        if (requestId !== requestSequenceRef.current || dataModeRef.current !== 'nearby') {
          return;
        }

        // Cluster markers if there are many
        let markers = response.results || [];
        const zoomLevel = regionToZoom(region);
        if (markers.length > 50) {
          const clustered = clusterMarkers(markers, zoomLevel);
          setDisplayedMarkers(clustered);
        } else {
          setDisplayedMarkers(markers.map((poi) => ({ ...poi, type: 'marker' })));
        }

        // Update last fetch coordinates
        lastFetchRegion.current = {
          latitude: region.latitude,
          longitude: region.longitude,
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        };
      } catch (err) {
        console.error('Error fetching nearby places:', err);
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail || err?.response?.data?.error;
        setError(
          status
            ? `Failed to fetch nearby places (${status}${detail ? `: ${detail}` : ''})`
            : 'Failed to fetch nearby places'
        );
      } finally {
        inFlightRequestKey.current = null;
        setIsFetching(false);
      }
    },
    [currentRegion, activeFilters, hasMovedSignificantly, user]
  );

  /**
   * Handle region change (map pan/zoom)
   * Debounced to avoid excessive API calls
   * @param {Object} region - New region from map
   */
  const onRegionChangeComplete = useCallback(
    (region) => {
      setCurrentRegion(region);

      // Debounce API call
      if (fetchDebounceTimer.current) {
        clearTimeout(fetchDebounceTimer.current);
      }

      fetchDebounceTimer.current = setTimeout(() => {
        if (dataModeRef.current === 'nearby') {
          fetchNearbyPlaces(region);
        }
      }, 500);
    },
    [fetchNearbyPlaces]
  );

  /**
   * Handle map pan detection - pause auto-tracking when user drags map
   */
  const onMapPanDrag = useCallback(() => {
    // Could emit event to pause auto-location tracking here
    console.log('User panned map - pausing auto-tracking');
  }, []);

  /**
   * Center map on user location
   * @param {number} latitude - User latitude
   * @param {number} longitude - User longitude
   */
  const animateToUserLocation = useCallback((latitude, longitude) => {
    if (isValidCoordinates(latitude, longitude)) {
      const newRegion = {
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
      setCurrentRegion(newRegion);
      fetchNearbyPlaces(newRegion, 5000, null, { force: true });
    }
  }, [fetchNearbyPlaces]);

  /**
   * Handle search for places by name
   * @param {string} query - Search query
   */
  const handleSearch = useCallback(async (query) => {
    const normalizedQuery = String(query || '').trim();
    setSearchQuery(normalizedQuery);

    if (!normalizedQuery) {
      dataModeRef.current = 'nearby';
      // Restore nearby markers when search is cleared.
      fetchNearbyPlaces(currentRegion, 5000, null, { force: true });
      return;
    }

    dataModeRef.current = 'search';
    setIsFetching(true);
    setError(null);
    const requestId = ++requestSequenceRef.current;

    try {
      const response = await locationService.searchPOIs(normalizedQuery);
      if (requestId !== requestSequenceRef.current || dataModeRef.current !== 'search') {
        return;
      }
      const markers = (response.results || []).map((poi) => ({ ...poi, type: 'marker' }));
      setDisplayedMarkers(markers);
    } catch (err) {
      console.error('Error searching:', err);
      setError('Search failed');
    } finally {
      setIsFetching(false);
    }
  }, [fetchNearbyPlaces, currentRegion]);

  /**
   * Update active filters
   * @param {Object} filters - Filter object { category?, minRating? }
   */
  const updateFilters = useCallback(
    (filters) => {
      const nextFilters = { ...activeFilters, ...filters };
      setActiveFilters(nextFilters);
      // Re-fetch with new filters
      fetchNearbyPlaces(currentRegion, 5000, nextFilters);
    },
    [currentRegion, fetchNearbyPlaces, activeFilters]
  );

  /**
   * Clear all filters and reset display
   */
  const clearFilters = useCallback(() => {
    const resetFilters = { category: null, minRating: 0, interestsOnly: false };
    setActiveFilters(resetFilters);
    setSearchQuery('');
    dataModeRef.current = 'nearby';
    fetchNearbyPlaces(currentRegion, 5000, resetFilters, { force: true });
  }, [currentRegion, fetchNearbyPlaces]);

  /**
   * Handle marker press - select POI and show details
   * @param {Object} poi - POI object
   */
  const handleMarkerPress = useCallback((poi) => {
    setSelectedPOI(poi);
    // Record interaction
    if (poi.id) {
      locationService.recordInteraction(poi.id, 'VIEW').catch((err) => {
        console.error('Failed to record interaction:', err);
      });
    }
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (fetchDebounceTimer.current) {
        clearTimeout(fetchDebounceTimer.current);
      }
    };
  }, []);

  // Initial fetch when component mounts
  useEffect(() => {
    fetchNearbyPlaces(currentRegion);
  }, []);

  return {
    // State
    displayedMarkers,
    selectedPOI,
    currentRegion,
    searchQuery,
    activeFilters,
    isFetching,
    error,
    lastFetchCoordinates: lastFetchRegion.current
      ? {
          latitude: lastFetchRegion.current.latitude,
          longitude: lastFetchRegion.current.longitude,
        }
      : null,

    // Methods
    setSelectedPOI,
    requestLocationPermission,
    onRegionChangeComplete,
    fetchNearbyPlaces,
    clusterMarkers: (markers, zoomLevel) => clusterMarkers(markers, zoomLevel),
    handleSearch,
    handleMarkerPress,
    updateFilters,
    clearFilters,
    onMapPanDrag,
    animateToUserLocation,
  };
};

export default useMapController;
  const regionToZoom = (region) => {
    if (typeof region?.zoomLevel === 'number' && Number.isFinite(region.zoomLevel)) {
      return Math.max(2, Math.min(18, Math.round(region.zoomLevel)));
    }
    const latDelta = Number(region?.latitudeDelta) || 0.1;
    return Math.max(2, Math.min(18, Math.round(Math.log2(360 / Math.max(latDelta, 0.0001)))));
  };
