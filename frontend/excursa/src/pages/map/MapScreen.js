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
  { id: 'HISTORICAL', label: 'Tarihi', helper: 'Muzeler, kaleler, anitlar' },
  { id: 'CULTURE', label: 'Kultur', helper: 'Galeri ve kulturel alanlar' },
  { id: 'VIEWPOINT', label: 'Manzara', helper: 'Seyir ve ikonik noktalar' },
  { id: 'NATURE', label: 'Doga', helper: 'Parklar ve dogal alanlar' },
  { id: 'ENTERTAINMENT', label: 'Etkinlik', helper: 'Sosyal gezi duraklari' },
];

const RATING_FILTERS = [
  { value: 0, label: 'Tumu', helper: 'Puan filtresi yok' },
  { value: 3, label: '3.0+', helper: 'Dengeli secimler' },
  { value: 4, label: '4.0+', helper: 'Yuksek puanli' },
  { value: 4.5, label: '4.5+', helper: 'En guclu duraklar' },
];

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildWebMapHtml = (markers, region) => {
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

  const centerLat = region?.latitude || 41.0082;
  const centerLng = region?.longitude || 28.9784;
  const explicitZoom = Number(region?.zoomLevel);
  const latDelta = Number(region?.latitudeDelta) || 0.1;
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

export default function MapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
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
    [displayedMarkers, currentRegion]
  );
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilters.category) count += 1;
    if (activeFilters.minRating > 0) count += 1;
    if (activeFilters.interestsOnly) count += 1;
    return count;
  }, [activeFilters]);
  const activeCategoryLabel = useMemo(
    () => CATEGORIES.find((item) => item.id === activeFilters.category)?.label,
    [activeFilters.category]
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
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextActive]}>
            Filtre
          </Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeFilterCount > 0 && (
        <View style={[styles.activeFilterRail, { top: insets.top + 66 }]}>
          {activeCategoryLabel ? <Text style={styles.activeFilterChip}>{activeCategoryLabel}</Text> : null}
          {activeFilters.minRating > 0 ? (
            <Text style={styles.activeFilterChip}>{activeFilters.minRating}+ puan</Text>
          ) : null}
          {activeFilters.interestsOnly ? (
            <Text style={styles.activeFilterChip}>Ilgi alanlarim</Text>
          ) : null}
          <TouchableOpacity style={styles.activeFilterClear} onPress={clearFilters}>
            <Text style={styles.activeFilterClearText}>Temizle</Text>
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
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setFilterModalVisible(false)}
          />
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Harita Filtreleri</Text>
                <Text style={styles.modalSubtitle}>Gezilecek noktaları daha net keşfet</Text>
              </View>
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
                      <View style={styles.categoryOptionCopy}>
                        <Text
                          style={[
                            styles.categoryOptionText,
                            activeFilters.category === cat.id && styles.categoryOptionTextActive,
                          ]}
                        >
                          {cat.label}
                        </Text>
                        <Text style={styles.categoryOptionHelper}>{cat.helper}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Minimum Rating</Text>
                <View style={styles.ratingOptions}>
                  {RATING_FILTERS.map((rating) => (
                    <TouchableOpacity
                      key={rating.value}
                      style={[
                        styles.ratingOption,
                        activeFilters.minRating === rating.value && styles.ratingOptionActive,
                      ]}
                      onPress={() => updateFilters({ minRating: rating.value })}
                    >
                      <Text
                        style={[
                          styles.ratingOptionText,
                          activeFilters.minRating === rating.value && styles.ratingOptionTextActive,
                        ]}
                      >
                        {rating.label}
                      </Text>
                      <Text style={styles.ratingOptionHelper}>{rating.helper}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Ilgi Alani Modu</Text>
                <TouchableOpacity
                  style={[
                    styles.interestToggle,
                    activeFilters.interestsOnly && styles.interestToggleActive,
                  ]}
                  onPress={() => updateFilters({ interestsOnly: !activeFilters.interestsOnly })}
                >
                  <View>
                    <Text
                      style={[
                        styles.interestToggleTitle,
                        activeFilters.interestsOnly && styles.interestToggleTitleActive,
                      ]}
                    >
                      Sadece ilgi alanlarim
                    </Text>
                    <Text style={styles.interestToggleHelper}>
                      Kapaliyken ilgi alanlarin sadece siralamada oncelik verir.
                    </Text>
                  </View>
                  <View style={[styles.switchTrack, activeFilters.interestsOnly && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, activeFilters.interestsOnly && styles.switchThumbActive]} />
                  </View>
                </TouchableOpacity>
              </View>

              {activeFilterCount > 0 && (
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
            <TouchableOpacity
              style={styles.applyFiltersButton}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={styles.applyFiltersButtonText}>Sonuclari Goster</Text>
            </TouchableOpacity>
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
    minWidth: 76,
    height: 44,
    borderRadius: 14,
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
  filterButtonActive: {
    backgroundColor: '#1a1a2e',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#1a1a2e',
    fontWeight: '700',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  filterCountBadge: {
    position: 'absolute',
    top: -6,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f39c12',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  filterCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  activeFilterRail: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeFilterChip: {
    overflow: 'hidden',
    backgroundColor: '#fff',
    color: '#1a1a2e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '800',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  activeFilterClear: {
    backgroundColor: '#1a1a2e',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  activeFilterClearText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
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
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(13, 17, 35, 0.36)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#fff',
    marginTop: 'auto',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    maxHeight: '86%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 14,
  },
  modalHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d8dbe4',
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#7d8293',
    fontWeight: '600',
  },
  modalCloseText: {
    fontSize: 20,
    color: '#7d8293',
    fontWeight: '800',
    padding: 8,
  },
  filterOptions: {
    paddingHorizontal: 20,
  },
  filterSection: {
    marginTop: 18,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1a1a2e',
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  categoryGrid: {
    gap: 10,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: '#f6f7fb',
    borderWidth: 1,
    borderColor: '#edf0f6',
  },
  categoryOptionActive: {
    backgroundColor: '#f0f2ff',
    borderColor: '#1a1a2e',
  },
  categoryOptionDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  categoryOptionCopy: {
    flex: 1,
  },
  categoryOptionText: {
    fontSize: 14,
    color: '#1a1a2e',
    fontWeight: '900',
  },
  categoryOptionTextActive: {
    color: '#111426',
  },
  categoryOptionHelper: {
    marginTop: 3,
    fontSize: 11,
    color: '#7d8293',
    fontWeight: '600',
  },
  ratingOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingOption: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#f6f7fb',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#edf0f6',
  },
  ratingOptionActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  ratingOptionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  ratingOptionTextActive: {
    color: '#fff',
  },
  ratingOptionHelper: {
    marginTop: 3,
    color: '#8c91a1',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  interestToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderRadius: 20,
    backgroundColor: '#f6f7fb',
    borderWidth: 1,
    borderColor: '#edf0f6',
    padding: 14,
  },
  interestToggleActive: {
    backgroundColor: '#f0f2ff',
    borderColor: '#1a1a2e',
  },
  interestToggleTitle: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '900',
  },
  interestToggleTitleActive: {
    color: '#111426',
  },
  interestToggleHelper: {
    marginTop: 4,
    color: '#7d8293',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 245,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d8dbe4',
    padding: 3,
  },
  switchTrackActive: {
    backgroundColor: '#1a1a2e',
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  switchThumbActive: {
    transform: [{ translateX: 18 }],
  },
  clearFiltersButton: {
    marginTop: 18,
    marginBottom: 8,
    paddingVertical: 12,
    backgroundColor: '#fff3f1',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffd6cf',
  },
  clearFiltersButtonText: {
    color: '#e74c3c',
    fontWeight: '900',
    fontSize: 14,
  },
  applyFiltersButton: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: '#1a1a2e',
    paddingVertical: 15,
    alignItems: 'center',
  },
  applyFiltersButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});
