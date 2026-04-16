/**
 * RouteManager - Client-side logic service for route management
 * Handles route metrics calculation, distance estimation, and polyline rendering
 */

/**
 * Route Metrics DTO - represents calculated metrics for a route
 */
class RouteMetrics {
  constructor(totalDistance = 0, totalDuration = 0, stopCount = 0) {
    this.totalDistance = totalDistance; // in kilometers
    this.totalDuration = totalDuration; // in minutes
    this.stopCount = stopCount;
  }

  /**
   * Get formatted distance string
   */
  getFormattedDistance() {
    if (this.totalDistance < 1) {
      return `${Math.round(this.totalDistance * 1000)} m`;
    }
    return `${(this.totalDistance).toFixed(1)} km`;
  }

  /**
   * Get formatted duration string
   */
  getFormattedDuration() {
    const hours = Math.floor(this.totalDuration / 60);
    const minutes = this.totalDuration % 60;

    if (hours === 0) {
      return `${minutes} min`;
    }
    if (minutes === 0) {
      return `${hours}s`;
    }
    return `${hours}s ${minutes} min`;
  }

  /**
   * Get formatted duration in Turkish
   */
  getFormattedDurationTR() {
    const hours = Math.floor(this.totalDuration / 60);
    const minutes = this.totalDuration % 60;

    if (hours === 0) {
      return `${minutes} dakika`;
    }
    if (minutes === 0) {
      return `${hours} saat`;
    }
    return `${hours} saat ${minutes} dakika`;
  }
}

export { RouteMetrics };
export class RouteManager {
  /**
   * Normalize POI/stop coordinate shape across API responses.
   * Supports either { location: { latitude, longitude } } or { latitude, longitude }.
   */
  static _getCoordinates(stop) {
    const latitude = stop?.location?.latitude ?? stop?.latitude;
    const longitude = stop?.location?.longitude ?? stop?.longitude;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return null;
    }

    return { latitude, longitude };
  }

  /**
   * Calculate metrics for a list of POIs with their distances
   * @param {Array} stops - Array of stops with location data
   * @param {Array} distances - Array of distances between consecutive stops
   */
  static calculateMetrics(stops, distances = []) {
    const totalDistance = distances.reduce((sum, dist) => sum + dist, 0);
    
    // Estimate duration: assume ~50 km/h average travel speed + dwell time
    // Dwell time = 1.5 hours per stop (can be customized per POI)
    const travelTime = (totalDistance / 50) * 60; // convert to minutes
    const dwellTime = (stops.length - 1) * 60; // 60 minutes per stop (except start)
    const totalDuration = Math.round(travelTime + dwellTime);

    return new RouteMetrics(totalDistance, totalDuration, stops.length);
  }

  /**
   * Calculate haversine distance between two coordinates
   * Returns distance in kilometers
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  static _toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get distances between all consecutive stops
   */
  static getConsecutiveDistances(stops) {
    const distances = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const current = this._getCoordinates(stops[i]);
      const next = this._getCoordinates(stops[i + 1]);
      if (!current || !next) {
        continue;
      }
      const distance = this.calculateDistance(
        current.latitude,
        current.longitude,
        next.latitude,
        next.longitude
      );
      distances.push(distance);
    }
    return distances;
  }

  /**
   * Decode polyline string (Google's encoded polyline algorithm)
   * @param {string} encoded - Encoded polyline string
   */
  static decodePolyline(encoded) {
    const poly = [];
    let index = 0,
      lat = 0,
      lng = 0;
    const changes = {
      latitude: 0,
      longitude: 0,
    };

    while (index < encoded.length) {
      let ll;
      for (const unit in changes) {
        let result = 0;
        let shift = 0;
        let byte;

        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);

        const dlat = result & 1 ? ~(result >> 1) : result >> 1;
        changes[unit] = dlat;
      }

      lat += changes.latitude;
      lng += changes.longitude;

      poly.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }

    return poly;
  }

  /**
   * Encode polyline string (Google's encoded polyline algorithm)
   * @param {Array} points - Array of {latitude, longitude} points
   */
  static encodePolyline(points) {
    let encoded = '';
    let prevLat = 0;
    let prevLng = 0;

    for (const point of points) {
      const lat = Math.round(point.latitude * 1e5);
      const lng = Math.round(point.longitude * 1e5);

      encoded += this._encodeValue(lat - prevLat);
      encoded += this._encodeValue(lng - prevLng);

      prevLat = lat;
      prevLng = lng;
    }

    return encoded;
  }

  static _encodeValue(current) {
    current = current << 1;
    if (current < 0) {
      current = ~current;
    }
    let encoded = '';
    while (current >= 0x20) {
      const byte = (0x20 | (current & 0x1f)) + 63;
      encoded += String.fromCharCode(byte);
      current >>= 5;
    }
    encoded += String.fromCharCode(current + 63);
    return encoded;
  }

  /**
   * Get bounding box for a set of coordinates
   */
  static getBoundingBox(stops) {
    const coordinates = stops
      .map((stop) => this._getCoordinates(stop))
      .filter(Boolean);

    if (coordinates.length === 0) {
      return null;
    }

    let minLat = coordinates[0].latitude;
    let maxLat = coordinates[0].latitude;
    let minLng = coordinates[0].longitude;
    let maxLng = coordinates[0].longitude;

    for (const point of coordinates) {
      const lat = point.latitude;
      const lng = point.longitude;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }

    return {
      minLatitude: minLat,
      maxLatitude: maxLat,
      minLongitude: minLng,
      maxLongitude: maxLng,
    };
  }

  /**
   * Calculate center point of route
   */
  static getRouteCenter(stops) {
    const coordinates = stops
      .map((stop) => this._getCoordinates(stop))
      .filter(Boolean);

    if (coordinates.length === 0) {
      return null;
    }

    let sumLat = 0;
    let sumLng = 0;

    for (const point of coordinates) {
      sumLat += point.latitude;
      sumLng += point.longitude;
    }

    return {
      latitude: sumLat / coordinates.length,
      longitude: sumLng / coordinates.length,
    };
  }

  /**
   * Validate stop coordinates
   */
  static isValidCoordinate(latitude, longitude) {
    return (
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  /**
   * Get transport mode icon/emoji
   */
  static getTransportModeEmoji(mode) {
    const modes = {
      DRIVING: '🚗',
      WALKING: '🚶',
      CYCLING: '🚴',
      TRANSIT: '🚌',
      UNKNOWN: '🗺️',
    };
    return modes[mode] || modes.UNKNOWN;
  }

  /**
   * Get status display information
   */
  static getStatusInfo(status) {
    const statusMap = {
      DRAFT: { label: 'Taslak', color: '#f39c12', bgColor: '#fff3e0' },
      ACTIVE: { label: 'Aktif', color: '#27ae60', bgColor: '#e8f5e9' },
      COMPLETED: { label: 'Tamamlandı', color: '#2980b9', bgColor: '#e3f2fd' },
      ARCHIVED: { label: 'Arşivlendi', color: '#95a5a6', bgColor: '#ecf0f1' },
    };
    return statusMap[status] || statusMap.DRAFT;
  }

  /**
   * Get category color
   */
  static getCategoryColor(category) {
    const categoryColors = {
      CULTURE_HISTORY: '#8e44ad',
      FOOD_DRINK: '#f39c12',
      OUTDOOR_NATURE: '#27ae60',
      ENTERTAINMENT: '#9b59b6',
      SHOPPING: '#3498db',
      HEALTH_WELLNESS: '#1abc9c',
      TRANSPORTATION: '#7f8c8d',
      LODGING: '#16a085',
      HISTORICAL: '#8e44ad',
      FOOD: '#f39c12',
      NATURE: '#27ae60',
      UNKNOWN: '#95a5a6',
    };
    return categoryColors[category] || categoryColors.UNKNOWN;
  }

  /**
   * Get category emoji
   */
  static getCategoryEmoji(category) {
    const categoryEmojis = {
      CULTURE_HISTORY: '🏛️',
      FOOD_DRINK: '🍽️',
      OUTDOOR_NATURE: '🌿',
      ENTERTAINMENT: '🎭',
      SHOPPING: '🛍️',
      HEALTH_WELLNESS: '🧘',
      TRANSPORTATION: '🚆',
      LODGING: '🏨',
      HISTORICAL: '🏛️',
      FOOD: '🍽️',
      NATURE: '🌿',
      UNKNOWN: '📍',
    };
    return categoryEmojis[category] || categoryEmojis.UNKNOWN;
  }

  /**
   * Get category label in Turkish
   */
  static getCategoryLabelTR(category) {
    const categoryLabels = {
      CULTURE_HISTORY: 'Kultur ve tarih',
      FOOD_DRINK: 'Yeme icme',
      OUTDOOR_NATURE: 'Doga ve acik hava',
      ENTERTAINMENT: 'Eğlence',
      SHOPPING: 'Alisveris',
      HEALTH_WELLNESS: 'Saglik ve rahatlama',
      TRANSPORTATION: 'Ulasim',
      LODGING: 'Konaklama',
      HISTORICAL: 'Kultur ve tarih',
      FOOD: 'Yeme icme',
      NATURE: 'Doga ve acik hava',
      UNKNOWN: 'Diğer',
    };
    return categoryLabels[category] || categoryLabels.UNKNOWN;
  }
}

export default RouteManager;
