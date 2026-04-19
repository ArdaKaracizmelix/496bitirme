/**
 * MapController - Custom Hook for Map Business Logic
 * Encapsulates location fetching, filtering, search, and geospatial operations
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import locationService from '../services/locationService';
import {
  clusterMarkers,
  dedupePOIs,
  getRegionRadius,
  getViewportBounds,
  isPOIInViewport,
  isValidCoordinates,
  regionToZoom,
} from '../utils/mapUtils';
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
  const poiCacheRef = useRef(new Map());

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
  const buildDisplayMarkers = useCallback((pois, region) => {
    const viewport = getViewportBounds(region);
    const zoomLevel = regionToZoom(region);
    const visiblePOIs = dedupePOIs(pois)
      .filter((poi) => !viewport || isPOIInViewport(poi, viewport))
      .sort((a, b) => String(a.id || a.name).localeCompare(String(b.id || b.name)));

    return clusterMarkers(visiblePOIs, zoomLevel);
  }, []);

  const mergePOIsIntoCache = useCallback((pois) => {
    dedupePOIs(pois).forEach((poi) => {
      const key = poi.id || `${poi.name}-${poi.latitude.toFixed(5)}-${poi.longitude.toFixed(5)}`;
      poiCacheRef.current.set(String(key), poi);
    });
  }, []);

  const getCachedPOIs = useCallback(() => Array.from(poiCacheRef.current.values()), []);

  const fetchNearbyPlaces = useCallback(
    async (region = currentRegion, radius = null, filterOverrides = null, options = {}) => {
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
          ? user.interests.filter((item) => typeof item === 'string' && item.trim().length > 0)
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
        const viewport = getViewportBounds(region);
        const effectiveRadius = radius || getRegionRadius(region);

        // Prevent duplicate in-flight requests for the exact same query.
        const requestKey = JSON.stringify({
          north: viewport ? Number(viewport.north).toFixed(5) : null,
          south: viewport ? Number(viewport.south).toFixed(5) : null,
          east: viewport ? Number(viewport.east).toFixed(5) : null,
          west: viewport ? Number(viewport.west).toFixed(5) : null,
          radius: effectiveRadius,
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

        let response = viewport
          ? await locationService.fetchPOIsInViewport(viewport, filters)
          : { results: [] };

        // If viewport has no cached/server data, trigger nearby sync once with
        // a radius derived from the current zoom level.
        if ((response.results || []).length === 0) {
          response = await locationService.fetchNearbyPOIs(
            region.latitude,
            region.longitude,
            effectiveRadius,
            filters
          );
        }

        if (requestId !== requestSequenceRef.current || dataModeRef.current !== 'nearby') {
          return;
        }

        mergePOIsIntoCache(response.results || []);
        setDisplayedMarkers(buildDisplayMarkers(getCachedPOIs(), region));

        // Update last fetch coordinates
        lastFetchRegion.current = {
          latitude: region.latitude,
          longitude: region.longitude,
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        };
      } catch (err) {
        console.warn('Error fetching nearby places:', err?.response?.data?.error || err?.message || err);
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
    [currentRegion, activeFilters, buildDisplayMarkers, getCachedPOIs, hasMovedSignificantly, mergePOIsIntoCache, user]
  );

  /**
   * Handle region change (map pan/zoom)
   * Debounced to avoid excessive API calls
   * @param {Object} region - New region from map
   */
  const onRegionChangeComplete = useCallback(
    (region) => {
      setCurrentRegion(region);
      if (dataModeRef.current === 'nearby') {
        setDisplayedMarkers(buildDisplayMarkers(getCachedPOIs(), region));
      }

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
    [buildDisplayMarkers, fetchNearbyPlaces, getCachedPOIs]
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
      fetchNearbyPlaces(newRegion, null, null, { force: true });
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
      fetchNearbyPlaces(currentRegion, null, null, { force: true });
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
      setDisplayedMarkers(dedupePOIs(response.results || []).map((poi) => ({ ...poi, type: 'marker' })));
    } catch (err) {
      console.warn('Error searching:', err?.response?.data?.error || err?.message || err);
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
      dataModeRef.current = 'nearby';
      poiCacheRef.current.clear();
      // Re-fetch with new filters
      fetchNearbyPlaces(currentRegion, null, nextFilters, { force: true });
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
    poiCacheRef.current.clear();
    dataModeRef.current = 'nearby';
    fetchNearbyPlaces(currentRegion, null, resetFilters, { force: true });
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
