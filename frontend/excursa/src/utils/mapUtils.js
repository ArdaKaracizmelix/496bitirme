/**
 * Map Utility Functions
 * Clustering, geospatial calculations, and marker management
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lon1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lon2 - Second longitude
 * @returns {number} - Distance in meters
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if two coordinates are close together (within threshold)
 * @param {Object} coord1 - { latitude, longitude }
 * @param {Object} coord2 - { latitude, longitude }
 * @param {number} threshold - Distance threshold in meters (default: 100)
 * @returns {boolean} - True if coordinates are within threshold
 */
export const areCoordinatesClose = (coord1, coord2, threshold = 100) => {
  const distance = calculateDistance(
    coord1.latitude,
    coord1.longitude,
    coord2.latitude,
    coord2.longitude
  );
  return distance < threshold;
};

/**
 * Simple marker clustering algorithm (groups nearby markers)
 * @param {Array<Object>} pois - Array of POI objects with latitude/longitude
 * @param {number} zoomLevel - Current map zoom level (1-20)
 * @returns {Array<Object>} - Array of clusters and individual markers
 */
export const clusterMarkers = (pois, zoomLevel) => {
  if (!pois || pois.length === 0) return [];

  // Determine cluster radius based on zoom level
  // At high zoom, clusters are smaller; at low zoom, they're larger
  const clusterRadius = Math.max(50, 500 / (zoomLevel / 10));

  const clusters = [];
  const processed = new Set();

  pois.forEach((poi, index) => {
    if (processed.has(index)) return;

    // Find all POIs within cluster radius
    const clusterMembers = [poi];
    processed.add(index);

    pois.forEach((otherPoi, otherIndex) => {
      if (!processed.has(otherIndex)) {
        const distance = calculateDistance(
          poi.latitude,
          poi.longitude,
          otherPoi.latitude,
          otherPoi.longitude
        );

        if (distance < clusterRadius) {
          clusterMembers.push(otherPoi);
          processed.add(otherIndex);
        }
      }
    });

    // Create cluster or individual marker object
    if (clusterMembers.length > 1) {
      const avgLat =
        clusterMembers.reduce((sum, p) => sum + p.latitude, 0) /
        clusterMembers.length;
      const avgLon =
        clusterMembers.reduce((sum, p) => sum + p.longitude, 0) /
        clusterMembers.length;

      clusters.push({
        type: 'cluster',
        latitude: avgLat,
        longitude: avgLon,
        count: clusterMembers.length,
        members: clusterMembers,
      });
    } else {
      clusters.push({
        type: 'marker',
        ...clusterMembers[0],
      });
    }
  });

  return clusters;
};

/**
 * Format distance for display
 * @param {number} distanceInMeters - Distance in meters
 * @returns {string} - Formatted distance string
 */
export const formatDistance = (distanceInMeters) => {
  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  }
  return `${(distanceInMeters / 1000).toFixed(1)} km`;
};

/**
 * Get viewport bounding box
 * @param {Object} region - MapView region object
 * @returns {Object} - { north, south, east, west }
 */
export const getViewportBounds = (region) => {
  if (!region) return null;

  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;

  return {
    north: latitude + latitudeDelta / 2,
    south: latitude - latitudeDelta / 2,
    east: longitude + longitudeDelta / 2,
    west: longitude - longitudeDelta / 2,
  };
};

/**
 * Check if POI is within viewport
 * @param {Object} poi - POI object with latitude/longitude
 * @param {Object} viewport - Viewport bounds
 * @returns {boolean} - True if POI is visible
 */
export const isPOIInViewport = (poi, viewport) => {
  if (!poi || !viewport) return false;

  return (
    poi.latitude <= viewport.north &&
    poi.latitude >= viewport.south &&
    poi.longitude <= viewport.east &&
    poi.longitude >= viewport.west
  );
};

/**
 * Validate coordinates
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {boolean} - True if valid
 */
export const isValidCoordinates = (latitude, longitude) => {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
};

/**
 * Calculate region to fit all markers
 * @param {Array<Object>} pois - Array of POI objects
 * @returns {Object} - Region object for MapView
 */
export const calculateRegionToFitMarkers = (pois) => {
  if (!pois || pois.length === 0) return null;

  let maxLat = pois[0].latitude;
  let minLat = pois[0].latitude;
  let maxLon = pois[0].longitude;
  let minLon = pois[0].longitude;

  pois.forEach((poi) => {
    maxLat = Math.max(maxLat, poi.latitude);
    minLat = Math.min(minLat, poi.latitude);
    maxLon = Math.max(maxLon, poi.longitude);
    minLon = Math.min(minLon, poi.longitude);
  });

  const centerLat = (maxLat + minLat) / 2;
  const centerLon = (maxLon + minLon) / 2;

  // Add padding
  const latDelta = (maxLat - minLat) * 1.3;
  const lonDelta = (maxLon - minLon) * 1.3;

  return {
    latitude: centerLat,
    longitude: centerLon,
    latitudeDelta: Math.max(latDelta, 0.1),
    longitudeDelta: Math.max(lonDelta, 0.1),
  };
};

/**
 * Map category to color
 * @param {string} category - POI category
 * @returns {string} - Color hex code
 */
export const getCategoryColor = (category) => {
  const normalizeCategory = (value) => {
    const aliases = {
      HISTORICAL: 'CULTURE_HISTORY',
      FOOD: 'FOOD_DRINK',
      NATURE: 'OUTDOOR_NATURE',
    };
    return aliases[value] || value;
  };

  const categoryColors = {
    CULTURE_HISTORY: '#8e44ad',
    FOOD_DRINK: '#f39c12',
    OUTDOOR_NATURE: '#27ae60',
    ENTERTAINMENT: '#9b59b6',
    SHOPPING: '#3498db',
    HEALTH_WELLNESS: '#1abc9c',
    TRANSPORTATION: '#7f8c8d',
    LODGING: '#16a085',
  };
  return categoryColors[normalizeCategory(category)] || '#95a5a6';
};

/**
 * Map category to human readable name
 * @param {string} category - POI category
 * @returns {string} - Display name
 */
export const getCategoryName = (category) => {
  const normalizeCategory = (value) => {
    const aliases = {
      HISTORICAL: 'CULTURE_HISTORY',
      FOOD: 'FOOD_DRINK',
      NATURE: 'OUTDOOR_NATURE',
    };
    return aliases[value] || value;
  };

  const categoryNames = {
    CULTURE_HISTORY: 'Kultur ve tarih',
    FOOD_DRINK: 'Yeme icme',
    OUTDOOR_NATURE: 'Doga ve acik hava',
    ENTERTAINMENT: 'Eğlence',
    SHOPPING: 'Alışveriş',
    HEALTH_WELLNESS: 'Saglik ve rahatlama',
    TRANSPORTATION: 'Ulasim',
    LODGING: 'Konaklama',
  };
  const normalized = normalizeCategory(category);
  return categoryNames[normalized] || normalized;
};

export default {
  calculateDistance,
  areCoordinatesClose,
  clusterMarkers,
  formatDistance,
  getViewportBounds,
  isPOIInViewport,
  isValidCoordinates,
  calculateRegionToFitMarkers,
  getCategoryColor,
  getCategoryName,
};
