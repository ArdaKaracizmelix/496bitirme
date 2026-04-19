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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapViewport from './MapViewport';
import { useMapController } from '../../hooks/useMapController';
import {
  calculateDistance,
  formatDistance,
  getCategoryColor,
  getCategoryIcon,
  getCategoryName,
} from '../../utils/mapUtils';

const CATEGORIES = [
  { id: 'HISTORICAL', label: 'Tarihi' },
  { id: 'CULTURE', label: 'Kultur' },
  { id: 'VIEWPOINT', label: 'Manzara' },
  { id: 'NATURE', label: 'Doga' },
  { id: 'ENTERTAINMENT', label: 'Eglence' },
];

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildWebMapHtml = (markers, region, routeStops) => {
  const safeMarkers = (markers || []).map((item) => ({
    id: item.id || `${item.latitude}-${item.longitude}`,
    type: item.type || 'marker',
    name: item.name || 'POI',
    nameEscaped: escapeHtml(item.name || 'POI'),
    latitude: item.latitude,
    longitude: item.longitude,
    count: item.count || 1,
    category: item.display_category || item.category || '',
    color: getCategoryColor(item.display_category || item.category),
    icon: getCategoryIcon(item.display_category || item.category),
    average_rating: item.average_rating || 0,
  }));

  const safeRouteStops = Array.isArray(routeStops)
    ? routeStops
        .filter((s) => Number.isFinite(Number(s?.poi?.latitude ?? s?.latitude)) && Number.isFinite(Number(s?.poi?.longitude ?? s?.longitude)))
        .map((s, idx) => ({
          order: idx + 1,
          name: escapeHtml(s?.poi?.name ?? s?.name ?? `Durak ${idx + 1}`),
          latitude: Number(s?.poi?.latitude ?? s?.latitude),
          longitude: Number(s?.poi?.longitude ?? s?.longitude),
          category: s?.poi?.display_category ?? s?.poi?.category ?? s?.category ?? '',
        }))
    : [];

  const isRouteMode = safeRouteStops.length > 0;

  let centerLat, centerLng, estimatedZoom;
  if (isRouteMode) {
    const lats = safeRouteStops.map((s) => s.latitude);
    const lngs = safeRouteStops.map((s) => s.longitude);
    centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    estimatedZoom = 12;
  } else {
    centerLat = region?.latitude || 41.0082;
    centerLng = region?.longitude || 28.9784;
    const explicitZoom = Number(region?.zoomLevel);
    const latDelta = Number(region?.latitudeDelta) || 0.1;
    estimatedZoom = Number.isFinite(explicitZoom)
      ? Math.max(2, Math.min(18, Math.round(explicitZoom)))
      : Math.max(2, Math.min(18, Math.round(Math.log2(360 / Math.max(latDelta, 0.0001)))));
  }

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
      box-shadow: 0 10px 24px rgba(17, 24, 39, .24);
    }
    .poi-marker {
      width: 34px;
      height: 34px;
      border-radius: 18px;
      color: white;
      font: 800 13px/34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      border: 3px solid white;
      box-shadow: 0 8px 20px rgba(17, 24, 39, .22);
    }
    .route-marker {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e74c3c;
      color: white;
      font: 800 14px/36px system-ui, sans-serif;
      text-align: center;
      border: 3px solid white;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
    }
    .route-marker.first { background: #27ae60; }
    .route-marker.last  { background: #e74c3c; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var markers = ${JSON.stringify(safeMarkers)};
    var routeStops = ${JSON.stringify(safeRouteStops)};
    var isRouteMode = ${isRouteMode};
    var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], ${estimatedZoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    if (isRouteMode && routeStops.length > 0) {
      var latlngs = routeStops.map(function(s) { return [s.latitude, s.longitude]; });

      L.polyline(latlngs, {
        color: '#3498db',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 6',
      }).addTo(map);

      routeStops.forEach(function(stop, idx) {
        var isFirst = idx === 0;
        var isLast = idx === routeStops.length - 1;
        var cls = 'route-marker' + (isFirst ? ' first' : isLast ? ' last' : '');
        var icon = L.divIcon({
          html: '<div class="' + cls + '">' + stop.order + '</div>',
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        var m = L.marker([stop.latitude, stop.longitude], { icon: icon }).addTo(map);
        m.bindPopup('<b>' + stop.order + '. ' + stop.name + '</b>' + (stop.category ? '<br/>' + stop.category : ''));
      });

      map.fitBounds(latlngs, { padding: [40, 40] });
    } else {
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

        var markerIcon = L.divIcon({
          html: '<div class="poi-marker" style="background:' + item.color + '">' + item.icon + '</div>',
          className: '',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        var marker = L.marker([item.latitude, item.longitude], { icon: markerIcon }).addTo(map);
        var popupTitle = item.nameEscaped || 'POI';
        var popupCategory = item.category ? '<br/>' + item.category : '';
        marker.bindPopup('<b>' + popupTitle + '</b>' + popupCategory);
        marker.on('click', function() {
          window.parent.postMessage(JSON.stringify({
            type: 'poi-click',
            poiId: item.id
          }), '*');
        });
      });
    }

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

    var regionTimer = null;
    function scheduleRegionChange() {
      window.clearTimeout(regionTimer);
      regionTimer = window.setTimeout(publishRegionChange, 160);
    }

    map.on('moveend', scheduleRegionChange);
    map.on('zoomend', scheduleRegionChange);
  </script>
</body>
</html>`;
};

export default function MapScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const locationInitializedRef = useRef(false);
  const markersRef = useRef([]);

  const routeStops = route?.params?.routeStops ?? null;
  const routeTitle = route?.params?.routeTitle ?? null;
  const isRouteMode = Array.isArray(routeStops) && routeStops.length > 0;

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
    () => buildWebMapHtml(displayedMarkers, currentRegion, isRouteMode ? routeStops : null),
    [displayedMarkers, isRouteMode, routeStops]
  );

  useEffect(() => {
    if (locationInitializedRef.current) return;
    locationInitializedRef.current = true;

    const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
    if (!geolocation) return;

    geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        animateToUserLocation(latitude, longitude);
      },
      (locationError) => {
        console.warn('Location error:', locationError);
      }
    );
  }, [animateToUserLocation]);

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
      } catch (messageError) {
        // Ignore unrelated postMessage events.
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleMarkerPress, onRegionChangeComplete]);

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
              <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(selectedPOI.display_category || selectedPOI.category) }]}>
                <Text style={styles.categoryText}>{getCategoryName(selectedPOI.display_category || selectedPOI.category)}</Text>
              </View>
              <Text style={styles.poiName}>{selectedPOI.name}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedPOI(null)}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.poiInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rating</Text>
              <Text style={styles.infoValue}>{selectedPOI.average_rating?.toFixed(1)}/5.0</Text>
            </View>

            {distance && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Distance</Text>
                <Text style={styles.infoValue}>{formatDistance(distance)}</Text>
              </View>
            )}

            {selectedPOI.address && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address</Text>
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
              <Text style={styles.actionButtonText}>Detaylari Gor</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <MapViewport
        mapRef={mapRef}
        style={styles.map}
        html={webMapHtml}
        currentRegion={currentRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        onMapPanDrag={onMapPanDrag}
        displayedMarkers={displayedMarkers}
        selectedPOI={selectedPOI}
        handleMarkerPress={handleMarkerPress}
        navigation={navigation}
        getCategoryColor={getCategoryColor}
        getCategoryIcon={getCategoryIcon}
        getCategoryName={getCategoryName}
        styles={styles}
      />

      {isFetching && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      )}

      {error && (
        <View style={[styles.errorBanner, { top: insets.top }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {isRouteMode ? (
        <View style={[styles.routeBanner, { top: insets.top + 12 }]}>
          <TouchableOpacity style={styles.routeBannerBack} onPress={() => navigation.setParams({ routeStops: null, routeTitle: null })}>
            <Text style={styles.routeBannerBackText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.routeBannerTitle} numberOfLines={1}>
            {routeTitle || 'Rota'}
          </Text>
          <Text style={styles.routeBannerCount}>{routeStops.length} durak</Text>
        </View>
      ) : (
        <View style={[styles.searchContainer, { top: insets.top + 12 }]}>
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
                <Text style={styles.clearButton}>X</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterModalVisible(true)}
          >
            <Text style={styles.filterButtonText}>Filtre</Text>
            {Object.values(activeFilters).some((value) => value) && (
              <View style={styles.filterBadge} />
            )}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.myLocationButton}
        onPress={() => {
          if (userLocation) {
            animateToUserLocation(userLocation.latitude, userLocation.longitude);
          }
        }}
      >
        <Text style={styles.myLocationButtonText}>Konum</Text>
      </TouchableOpacity>

      {renderSelectedPOISheet()}

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
                <Text style={styles.modalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterOptions}>
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
                        {rating === 0 ? 'Tumu' : `${rating}+`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Ilgi Alani Modu</Text>
                <TouchableOpacity
                  style={[
                    styles.ratingOption,
                    activeFilters.interestsOnly && styles.ratingOptionActive,
                  ]}
                  onPress={() => updateFilters({ interestsOnly: !activeFilters.interestsOnly })}
                >
                  <Text style={styles.ratingOptionText}>
                    {activeFilters.interestsOnly ? 'Sadece ilgi alanlarim' : 'Ilgi alanlarini onceliklendir'}
                  </Text>
                </TouchableOpacity>
              </View>

              {Object.values(activeFilters).some((value) => value) && (
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
  routeBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    gap: 8,
  },
  routeBannerBack: {
    paddingRight: 4,
  },
  routeBannerBackText: {
    fontSize: 20,
    color: '#2c3e50',
    fontWeight: '700',
  },
  routeBannerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#2c3e50',
  },
  routeBannerCount: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '600',
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
    minWidth: 64,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  filterButtonText: {
    fontSize: 14,
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
    minWidth: 70,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3.84,
    elevation: 5,
  },
  myLocationButtonText: {
    fontSize: 14,
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
