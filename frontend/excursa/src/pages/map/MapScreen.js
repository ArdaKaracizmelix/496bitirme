import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useMapController } from '../../hooks/useMapController';
import { getCategoryColor, getCategoryName, formatDistance, calculateDistance } from '../../utils/mapUtils';

let MapView = null;
let Marker = null;
let Callout = null;
let PROVIDER_GOOGLE = undefined;

if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Callout = maps.Callout;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
}

const CATEGORIES = [
  { id: 'HISTORICAL', label: 'Tarihi' },
  { id: 'NATURE', label: 'Doğa' },
  { id: 'FOOD', label: 'Yemek' },
  { id: 'ENTERTAINMENT', label: 'Eğlence' },
  { id: 'SHOPPING', label: 'Alışveriş' },
];

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInterestLabel = (value = '') =>
  String(value || '')
    .trim()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const buildWebMapHtml = (markers, region) => {
  const safeMarkers = (markers || []).map((item) => ({
    id: item.id || `${item.latitude}-${item.longitude}`,
    type: item.type || 'marker',
    name: item.name || 'POI',
    nameEscaped: escapeHtml(item.name || 'POI'),
    latitude: item.latitude,
    longitude: item.longitude,
    count: item.count || 1,
    category: item.category || '',
    average_rating: item.average_rating || 0,
    matched_interests: Array.isArray(item.matched_interests) ? item.matched_interests : [],
  }));

  const centerLat = region?.latitude || 41.0082;
  const centerLng = region?.longitude || 28.9784;
  const explicitZoom = Number(region?.zoomLevel);
  const latDelta = Number(region?.latitudeDelta) || 0.1;
  // Prefer exact zoom from map events; fallback to delta-based approximation.
  const estimatedZoom = Number.isFinite(explicitZoom)
    ? Math.max(2, Math.min(18, Math.round(explicitZoom)))
    : Math.max(2, Math.min(18, Math.round(Math.log2(360 / Math.max(latDelta, 0.0001)))));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
    .cluster {
      width: 42px;
      height: 42px;
      border-radius: 21px;
      background: #2980b9;
      color: #fff;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #fff;
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var markers = ${JSON.stringify(safeMarkers)};
    var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], ${estimatedZoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    markers.forEach(function(item) {
      if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return;

      if (item.type === 'cluster') {
        var icon = L.divIcon({
          html: '<div class="cluster">' + item.count + '</div>',
          className: '',
          iconSize: [42, 42],
        });
        L.marker([item.latitude, item.longitude], { icon: icon }).addTo(map);
        return;
      }

      var marker = L.marker([item.latitude, item.longitude]).addTo(map);
      var popupTitle = item.nameEscaped || 'POI';
      var popupCategory = item.category ? '<br/>' + item.category : '';
      var popupInterest = Array.isArray(item.matched_interests) && item.matched_interests.length > 0
        ? '<br/>🎯 ' + item.matched_interests[0].replace(/[_\\-]+/g, ' ')
        : '';
      marker.bindPopup('<b>' + popupTitle + '</b>' + popupCategory + popupInterest);
      marker.on('click', function() {
        window.parent.postMessage(JSON.stringify({
          type: 'poi-click',
          poiId: item.id
        }), '*');
      });
    });

    function publishRegionChange() {
      var c = map.getCenter();
      var b = map.getBounds();
      window.parent.postMessage(JSON.stringify({
        type: 'map-region-change',
        region: {
          latitude: c.lat,
          longitude: c.lng,
          latitudeDelta: Math.abs(b.getNorth() - b.getSouth()),
          longitudeDelta: Math.abs(b.getEast() - b.getWest()),
          zoomLevel: map.getZoom()
        }
      }), '*');
    }

    map.on('moveend', publishRegionChange);
    map.on('zoomend', publishRegionChange);
  </script>
</body>
</html>`;
};

/**
 * MapScreen - Main exploration/map view component
 * Displays map interface, POI markers, search, and filtering
 */
export default function MapScreen({ navigation }) {
  const mapRef = useRef(null);
  const locationInitializedRef = useRef(false);
  const markersRef = useRef([]);
  
  const {
    displayedMarkers,
    selectedPOI,
    currentRegion,
    activeFilters,
    isFetching,
    error,
    setSelectedPOI,
    onRegionChangeComplete,
    handleSearch,
    handleMarkerPress,
    updateFilters,
    clearFilters,
    onMapPanDrag,
    animateToUserLocation,
  } = useMapController();

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchDebouncedText, setSearchDebouncedText] = useState('');
  const webMapHtml = useMemo(
    () => buildWebMapHtml(displayedMarkers, currentRegion),
    [displayedMarkers]
  );

  /**
   * Get user's current location
   */
  useEffect(() => {
    if (locationInitializedRef.current) return;
    locationInitializedRef.current = true;

    const getLocation = () => {
      const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
      if (!geolocation) return;

      geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          animateToUserLocation(latitude, longitude);
        },
        (error) => {
          console.warn('Location error:', error);
          // Fall back to default location (Istanbul)
        }
      );
    };

    getLocation();
  }, []);

  useEffect(() => {
    markersRef.current = displayedMarkers;
  }, [displayedMarkers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebouncedText(searchText);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    handleSearch(searchDebouncedText);
  }, [searchDebouncedText, handleSearch]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onMessage = (event) => {
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.type === 'poi-click' && payload?.poiId) {
          const poi = markersRef.current.find(
            (item) => String(item.id) === String(payload.poiId) && item.type !== 'cluster'
          );
          if (poi) {
            handleMarkerPress(poi);
          }
          return;
        }

        if (payload?.type === 'map-region-change' && payload?.region) {
          onRegionChangeComplete(payload.region);
        }
      } catch (err) {
        // Ignore unrelated postMessage events.
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleMarkerPress, onRegionChangeComplete]);

  /**
   * Render individual marker or cluster
   */
  const renderMarker = (item) => {
    if (item.type === 'cluster') {
      return (
        <Marker
          key={`cluster-${item.latitude}-${item.longitude}`}
          coordinate={{
            latitude: item.latitude,
            longitude: item.longitude,
          }}
          onPress={() => {
            // Animate to cluster bounds
            if (mapRef.current) {
              mapRef.current.fitToCoordinates(
                item.members.map((m) => ({
                  latitude: m.latitude,
                  longitude: m.longitude,
                })),
                { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 } }
              );
            }
          }}
        >
          <View style={[styles.clusterMarker, { backgroundColor: '#2980b9' }]}>
            <Text style={styles.clusterText}>{item.count}</Text>
          </View>
        </Marker>
      );
    }

    // Regular marker
    return (
      <Marker
        key={item.id}
        coordinate={{
          latitude: item.latitude,
          longitude: item.longitude,
        }}
        onPress={() => handleMarkerPress(item)}
      >
        <View
          style={[
            styles.markerContainer,
            {
              backgroundColor: selectedPOI?.id === item.id ? '#fff' : getCategoryColor(item.category),
            },
          ]}
        >
          <View
            style={[
              styles.markerInner,
              { backgroundColor: getCategoryColor(item.category) },
            ]}
          >
            <Text style={styles.markerEmoji}>📍</Text>
          </View>
        </View>

        {selectedPOI?.id === item.id && (
          <Callout onPress={() => navigation.navigate('POIDetail', { poiId: item.id })}>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{item.name}</Text>
              <Text style={styles.calloutCategory}>{getCategoryName(item.category)}</Text>
              {Array.isArray(item.matched_interests) && item.matched_interests.length > 0 ? (
                <Text style={styles.calloutInterest}>
                  🎯 {formatInterestLabel(item.matched_interests[0])}
                </Text>
              ) : null}
              <Text style={styles.calloutRating}>⭐ {item.average_rating?.toFixed(1)}</Text>
            </View>
          </Callout>
        )}
      </Marker>
    );
  };

  /**
   * Bottom sheet for selected POI preview
   */
  const renderSelectedPOISheet = () => {
    if (!selectedPOI) return null;

    const distance = userLocation
      ? calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          selectedPOI.latitude,
          selectedPOI.longitude
        )
      : null;

    return (
      <View style={styles.bottomSheet}>
        <View style={styles.bottomSheetHandle} />
        <ScrollView style={styles.bottomSheetContent} scrollEnabled={false}>
          <View style={styles.poiHeader}>
            <View style={styles.poiHeaderLeft}>
              <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(selectedPOI.category) }]}>
                <Text style={styles.categoryText}>{getCategoryName(selectedPOI.category)}</Text>
              </View>
              <Text style={styles.poiName}>{selectedPOI.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedPOI(null)}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.poiInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>⭐ Rating</Text>
              <Text style={styles.infoValue}>{selectedPOI.average_rating?.toFixed(1)}/5.0</Text>
            </View>

            {distance && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>📍 Distance</Text>
                <Text style={styles.infoValue}>{formatDistance(distance)}</Text>
              </View>
            )}

            {selectedPOI.address && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>📬 Address</Text>
                <Text style={styles.infoValue}>{selectedPOI.address}</Text>
              </View>
            )}
          </View>

          <View style={styles.poiActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton]}
              onPress={() => {
                navigation.navigate('POIDetail', { poiId: selectedPOI.id });
                setSelectedPOI(null);
              }}
            >
              <Text style={styles.actionButtonText}>Detayları Gör</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Map View */}
      {Platform.OS === 'web' ? (
        <iframe
          srcDoc={webMapHtml}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="excursa-map"
        />
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={currentRegion}
          onRegionChangeComplete={onRegionChangeComplete}
          onPanDrag={onMapPanDrag}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          showsUserLocation={true}
          showsMyLocationButton={false}
          zoomControlEnabled={Platform.OS === 'android'}
        >
          {displayedMarkers.map((marker) => renderMarker(marker))}
        </MapView>
      )}

      {/* Loading Indicator */}
      {isFetching && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Yer ara..."
            placeholderTextColor="#95a5a6"
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Text style={styles.clearButton}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Button */}
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Text style={styles.filterButtonText}>⚙️</Text>
          {Object.values(activeFilters).some((v) => v) && (
            <View style={styles.filterBadge} />
          )}
        </TouchableOpacity>
      </View>

      {/* My Location Button */}
      <TouchableOpacity
        style={styles.myLocationButton}
        onPress={() => {
          if (userLocation) {
            animateToUserLocation(userLocation.latitude, userLocation.longitude);
          }
        }}
      >
        <Text style={styles.myLocationButtonText}>📍</Text>
      </TouchableOpacity>

      {/* Selected POI Bottom Sheet */}
      {renderSelectedPOISheet()}

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrele</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterOptions}>
              {/* Category Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Kategori</Text>
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryOption,
                        activeFilters.category === cat.id && styles.categoryOptionActive,
                      ]}
                      onPress={() => {
                        updateFilters({
                          category: activeFilters.category === cat.id ? null : cat.id,
                        });
                      }}
                    >
                      <View
                        style={[
                          styles.categoryOptionDot,
                          { backgroundColor: getCategoryColor(cat.id) },
                        ]}
                      />
                      <Text style={styles.categoryOptionText}>{cat.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Rating Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Minimum Rating</Text>
                <View style={styles.ratingOptions}>
                  {[0, 3, 4, 4.5].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[
                        styles.ratingOption,
                        activeFilters.minRating === rating && styles.ratingOptionActive,
                      ]}
                      onPress={() => updateFilters({ minRating: rating })}
                    >
                      <Text style={styles.ratingOptionText}>
                        {rating === 0 ? 'Tümü' : `${rating}+`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Interest Personalization */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>İlgi Alanı Modu</Text>
                <TouchableOpacity
                  style={[
                    styles.ratingOption,
                    activeFilters.interestsOnly && styles.ratingOptionActive,
                  ]}
                  onPress={() => updateFilters({ interestsOnly: !activeFilters.interestsOnly })}
                >
                  <Text style={styles.ratingOptionText}>
                    {activeFilters.interestsOnly ? 'Sadece ilgi alanlarım' : 'İlgi alanlarını önceliklendir'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Clear Filters Button */}
              {Object.values(activeFilters).some((v) => v) && (
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={() => {
                    clearFilters();
                    setFilterModalVisible(false);
                  }}
                >
                  <Text style={styles.clearFiltersButtonText}>Filtreleri Temizle</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  errorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#e74c3c',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  searchContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 5,
    flexDirection: 'row',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2c3e50',
  },
  clearButton: {
    fontSize: 16,
    color: '#95a5a6',
    padding: 4,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  filterButtonText: {
    fontSize: 18,
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e74c3c',
  },
  myLocationButton: {
    position: 'absolute',
    bottom: 200,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3.84,
    elevation: 5,
  },
  myLocationButtonText: {
    fontSize: 20,
  },
  markerContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerEmoji: {
    fontSize: 16,
  },
  clusterMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  clusterText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  callout: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    minWidth: 150,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  calloutCategory: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  calloutRating: {
    fontSize: 12,
    color: '#f39c12',
    fontWeight: '600',
  },
  calloutInterest: {
    fontSize: 12,
    color: '#16a085',
    marginBottom: 4,
    fontWeight: '600',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    maxHeight: 280,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#bdc3c7',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  bottomSheetContent: {
    paddingHorizontal: 16,
  },
  poiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  poiHeaderLeft: {
    flex: 1,
  },
  poiName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginTop: 8,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeText: {
    fontSize: 24,
    color: '#95a5a6',
  },
  poiInfo: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#7f8c8d',
  },
  infoValue: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '600',
  },
  poiActions: {
    gap: 8,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3498db',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 'auto',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  modalCloseText: {
    fontSize: 24,
    color: '#95a5a6',
  },
  filterOptions: {
    paddingHorizontal: 16,
  },
  filterSection: {
    marginVertical: 16,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#ecf0f1',
  },
  categoryOptionActive: {
    backgroundColor: '#e8f4f8',
    borderWidth: 1,
    borderColor: '#3498db',
  },
  categoryOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  categoryOptionText: {
    fontSize: 13,
    color: '#2c3e50',
    fontWeight: '500',
  },
  ratingOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#ecf0f1',
    alignItems: 'center',
  },
  ratingOptionActive: {
    backgroundColor: '#3498db',
  },
  ratingOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
  },
  clearFiltersButton: {
    marginVertical: 16,
    paddingVertical: 12,
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearFiltersButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
