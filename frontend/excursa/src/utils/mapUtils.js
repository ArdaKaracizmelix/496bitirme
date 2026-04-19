/**
 * Map Utility Functions
 * Clustering, geospatial calculations, and marker management.
 */

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
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

export const areCoordinatesClose = (coord1, coord2, threshold = 100) => {
  const distance = calculateDistance(
    coord1.latitude,
    coord1.longitude,
    coord2.latitude,
    coord2.longitude
  );
  return distance < threshold;
};

export const isValidCoordinates = (latitude, longitude) => (
  typeof latitude === 'number' &&
  typeof longitude === 'number' &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180
);

export const normalizePOI = (poi) => {
  if (!poi) return null;
  const latitude = Number(poi.latitude);
  const longitude = Number(poi.longitude);
  if (!isValidCoordinates(latitude, longitude)) return null;
  const displayCategory = poi.display_category || poi.metadata?.derived_category || poi.category || 'ENTERTAINMENT';
  return {
    ...poi,
    latitude,
    longitude,
    display_category: String(displayCategory).toUpperCase(),
    category: poi.category || String(displayCategory).toUpperCase(),
  };
};

export const dedupePOIs = (pois = []) => {
  const seen = new Set();
  const output = [];

  for (const rawPoi of pois || []) {
    const poi = normalizePOI(rawPoi);
    if (!poi) continue;

    const normalizedName = String(poi.name || '').trim().toLowerCase();
    const key = poi.id
      ? `id:${poi.id}`
      : `geo:${normalizedName}:${poi.latitude.toFixed(5)}:${poi.longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(poi);
  }

  return output;
};

/**
 * Deterministic grid clustering. This avoids flicker from order-dependent
 * pairwise clustering while still keeping the UI lightweight.
 */
export const clusterMarkers = (pois, zoomLevel) => {
  const safePois = dedupePOIs(pois)
    .sort((a, b) => String(a.id || a.name).localeCompare(String(b.id || b.name)));
  if (safePois.length === 0) return [];

  const zoom = Math.max(2, Math.min(19, Number(zoomLevel) || 12));
  if (zoom >= 16) {
    return safePois.map((poi) => ({ ...poi, type: 'marker' }));
  }

  const gridSizeDeg = Math.max(0.0007, 0.18 / Math.pow(2, Math.max(zoom - 7, 0)));
  const buckets = new Map();

  safePois.forEach((poi) => {
    const latKey = Math.floor(poi.latitude / gridSizeDeg);
    const lonKey = Math.floor(poi.longitude / gridSizeDeg);
    const key = `${latKey}:${lonKey}`;
    const bucket = buckets.get(key) || [];
    bucket.push(poi);
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries()).map(([bucketKey, members]) => {
    if (members.length === 1) {
      return { type: 'marker', ...members[0] };
    }

    const latitude = members.reduce((sum, p) => sum + p.latitude, 0) / members.length;
    const longitude = members.reduce((sum, p) => sum + p.longitude, 0) / members.length;

    return {
      id: `cluster-${bucketKey}-${members.length}`,
      type: 'cluster',
      latitude,
      longitude,
      count: members.length,
      members,
    };
  });
};

export const formatDistance = (distanceInMeters) => {
  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  }
  return `${(distanceInMeters / 1000).toFixed(1)} km`;
};

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

export const isPOIInViewport = (poi, viewport) => {
  if (!poi || !viewport) return false;
  return (
    poi.latitude <= viewport.north &&
    poi.latitude >= viewport.south &&
    poi.longitude <= viewport.east &&
    poi.longitude >= viewport.west
  );
};

export const getRegionRadius = (region) => {
  if (!region) return 5000;
  const latDelta = Math.max(Number(region.latitudeDelta) || 0.05, 0.005);
  const lonDelta = Math.max(Number(region.longitudeDelta) || 0.05, 0.005);
  const latMeters = latDelta * 111320;
  const lonMeters =
    lonDelta * 111320 * Math.cos((Number(region.latitude || 0) * Math.PI) / 180);
  const diagonal = Math.sqrt(latMeters * latMeters + lonMeters * lonMeters);
  return Math.max(2500, Math.min(50000, Math.ceil(diagonal / 2)));
};

export const regionToZoom = (region) => {
  if (typeof region?.zoomLevel === 'number' && Number.isFinite(region.zoomLevel)) {
    return Math.max(2, Math.min(19, Math.round(region.zoomLevel)));
  }
  const latDelta = Number(region?.latitudeDelta) || 0.1;
  return Math.max(2, Math.min(19, Math.round(Math.log2(360 / Math.max(latDelta, 0.0001)))));
};

export const calculateRegionToFitMarkers = (pois) => {
  const safePois = dedupePOIs(pois);
  if (safePois.length === 0) return null;

  let maxLat = safePois[0].latitude;
  let minLat = safePois[0].latitude;
  let maxLon = safePois[0].longitude;
  let minLon = safePois[0].longitude;

  safePois.forEach((poi) => {
    maxLat = Math.max(maxLat, poi.latitude);
    minLat = Math.min(minLat, poi.latitude);
    maxLon = Math.max(maxLon, poi.longitude);
    minLon = Math.min(minLon, poi.longitude);
  });

  return {
    latitude: (maxLat + minLat) / 2,
    longitude: (maxLon + minLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.1),
    longitudeDelta: Math.max((maxLon - minLon) * 1.3, 0.1),
  };
};

export const getCategoryColor = (category) => {
  const categoryColors = {
    HISTORICAL: '#e74c3c',
    CULTURE: '#8e44ad',
    VIEWPOINT: '#0ea5e9',
    NATURE: '#27ae60',
    FOOD: '#f39c12',
    ENTERTAINMENT: '#9b59b6',
    SHOPPING: '#3498db',
  };
  return categoryColors[String(category || '').toUpperCase()] || '#95a5a6';
};

export const getCategoryName = (category) => {
  const categoryNames = {
    HISTORICAL: 'Tarihi',
    CULTURE: 'Kultur',
    VIEWPOINT: 'Manzara',
    NATURE: 'Doga',
    FOOD: 'Yemek',
    ENTERTAINMENT: 'Eglence',
    SHOPPING: 'Alisveris',
  };
  return categoryNames[String(category || '').toUpperCase()] || category || 'POI';
};

export const getCategoryIcon = (category) => {
  const icons = {
    HISTORICAL: 'H',
    CULTURE: 'C',
    VIEWPOINT: 'V',
    NATURE: 'N',
    FOOD: 'F',
    ENTERTAINMENT: 'E',
    SHOPPING: 'S',
  };
  return icons[String(category || '').toUpperCase()] || 'P';
};

export default {
  calculateDistance,
  areCoordinatesClose,
  clusterMarkers,
  formatDistance,
  getViewportBounds,
  isPOIInViewport,
  isValidCoordinates,
  normalizePOI,
  dedupePOIs,
  getRegionRadius,
  regionToZoom,
  calculateRegionToFitMarkers,
  getCategoryColor,
  getCategoryName,
  getCategoryIcon,
};
