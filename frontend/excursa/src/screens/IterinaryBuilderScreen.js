/**
 * IterinaryBuilderScreen - Component for building and editing itineraries
 * Features: Draggable stop list, POI selection, route optimization, metrics display
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  FlatList,
  Dimensions,
  SectionList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useTripStore from '../store/tripStore';
import RouteManager from '../services/RouteManager';
import locationService from '../services/locationService';
import useAuthStore from '../store/authStore';

const CATEGORY_COLORS = {
  HISTORICAL: '#e74c3c',
  NATURE: '#27ae60',
  FOOD: '#f39c12',
  ENTERTAINMENT: '#9b59b6',
};

const CATEGORY_LABELS_TR = {
  HISTORICAL: 'Tarihi',
  NATURE: 'Doğa',
  FOOD: 'Yemek',
  ENTERTAINMENT: 'Eğlence',
};

export default function IterinaryBuilderScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { tripId } = route.params || {};
  const user = useAuthStore((state) => state.user);
  const loadTrip = useTripStore((state) => state.loadTrip);
  const clearCurrentTrip = useTripStore((state) => state.clearCurrentTrip);

  // Trip Store
  const store = useTripStore();
  const {
    currentTrip,
    currentTripStops,
    currentTripMetrics,
    isOptimizing,
    isLoading,
    isGenerating,
  } = store;

  // Local State
  const [tripTitle, setTripTitle] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [transportMode, setTransportMode] = useState('DRIVING');
  const [showPOISelector, setShowPOISelector] = useState(false);
  const [availablePOIs, setAvailablePOIs] = useState([]);
  const [draggedStopId, setDraggedStopId] = useState(null);
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [aiDurationDays, setAiDurationDays] = useState('3');
  const [aiStopsPerDay, setAiStopsPerDay] = useState('4');

  // Load trip if ID provided
  useEffect(() => {
    if (tripId) {
      loadTrip(tripId);
      return;
    }

    // Creating a new trip must start from a clean slate, not previous draft/edit data.
    clearCurrentTrip();
    setTripTitle('');
    setTripDate('');
    setTransportMode('DRIVING');
    setCityQuery('');
    setSelectedCity('');
    setCitySuggestions([]);
    setShowCitySuggestions(false);
    setAiDurationDays('3');
    setAiStopsPerDay('4');
  }, [tripId, loadTrip, clearCurrentTrip]);

  // Update local state when trip loads
  useEffect(() => {
    // Only hydrate local form fields from store when editing an existing trip.
    if (tripId && currentTrip) {
      setTripTitle(currentTrip.title || '');
      setTripDate(currentTrip.start_date ? currentTrip.start_date.slice(0, 10) : '');
      setTransportMode(currentTrip.transport_mode || 'DRIVING');
    }
  }, [tripId, currentTrip]);

  const loadCitySuggestions = useCallback(async (queryText) => {
    setIsCityLoading(true);
    try {
      const cities = await locationService.fetchAvailableCities(queryText);
      setCitySuggestions(Array.isArray(cities) ? cities : []);
    } catch (error) {
      setCitySuggestions([]);
    } finally {
      setIsCityLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      loadCitySuggestions(cityQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [cityQuery, loadCitySuggestions]);

  const toIsoDateTime = (dateValue) => {
    if (!dateValue) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return `${dateValue}T09:00:00.000Z`;
    }
    const parsed = new Date(dateValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const handleGenerateTrip = useCallback(async () => {
    const typedCity = cityQuery.trim();
    let city = selectedCity.trim();
    const durationDays = Number.parseInt(aiDurationDays, 10);
    const stopsPerDay = Number.parseInt(aiStopsPerDay, 10);

    if (!typedCity) {
      Alert.alert('Hata', 'Lütfen şehir yazın');
      return;
    }
    if (!city) {
      let exactMatch = citySuggestions.find(
        (item) => String(item).toLowerCase() === typedCity.toLowerCase()
      );
      if (!exactMatch) {
        try {
          const latestSuggestions = await locationService.fetchAvailableCities(typedCity);
          exactMatch = (latestSuggestions || []).find(
            (item) => String(item).toLowerCase() === typedCity.toLowerCase()
          );
          if (Array.isArray(latestSuggestions)) {
            setCitySuggestions(latestSuggestions);
          }
        } catch (error) {
          exactMatch = null;
        }
      }
      if (exactMatch) {
        city = exactMatch;
        setSelectedCity(exactMatch);
      } else {
        Alert.alert('Hata', 'Lütfen önerilerden bir şehir seçin');
        return;
      }
    }
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) {
      Alert.alert('Hata', 'Gün sayısı 1 ile 30 arasında olmalı');
      return;
    }
    if (!Number.isInteger(stopsPerDay) || stopsPerDay < 1 || stopsPerDay > 8) {
      Alert.alert('Hata', 'Günlük durak sayısı 1 ile 8 arasında olmalı');
      return;
    }

    try {
      store.setGenerating(true);

      const userInterests = Array.isArray(user?.interests)
        ? user.interests
            .map((item) => {
              if (typeof item === 'string') return item;
              if (item?.name) return String(item.name);
              if (item?.title) return String(item.title);
              return '';
            })
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

      // 1) Generate/sync city POIs for this user's interests (Google Places pipeline).
      await locationService.generatePOIsForCity(city, userInterests, 20000);

      // 2) Generate itinerary from now-available city POIs.
      const result = await store.generateTripFromPreferences({
        city,
        duration_days: durationDays,
        interests: userInterests,
        start_date: tripDate || undefined,
        title: tripTitle.trim() || undefined,
        visibility: 'PRIVATE',
        transport_mode: transportMode,
        stops_per_day: stopsPerDay,
      });

      const selectedCount = result?.summary?.selected_pois_count ?? 0;
      const generatedTitle = result?.itinerary?.title;
      if (generatedTitle) {
        setTripTitle(generatedTitle);
      }
      if (result?.summary?.start_date) {
        setTripDate(result.summary.start_date);
      }
      if (result?.itinerary?.transport_mode) {
        setTransportMode(result.itinerary.transport_mode);
      }

      Alert.alert('Başarılı', `Rota oluşturuldu. ${selectedCount} popüler durak eklendi.`);
    } catch (error) {
      Alert.alert('Hata', error?.message || 'Rota oluşturulamadı');
    } finally {
      store.setGenerating(false);
    }
  }, [
    cityQuery,
    selectedCity,
    citySuggestions,
    aiDurationDays,
    aiStopsPerDay,
    tripDate,
    tripTitle,
    transportMode,
    user,
    store,
  ]);

  /**
   * Load available POIs for selection
   */
  const loadAvailablePOIs = useCallback(async () => {
    try {
      const response = await locationService.fetchPOIsList();
      setAvailablePOIs(response?.results || []);
      setShowPOISelector(true);
    } catch (error) {
      Alert.alert('Hata', 'POI verisi alınamadı');
    }
  }, []);

  /**
   * Handle adding POI to trip
   */
  const handleAddPOI = useCallback(async (poi) => {
    try {
      const startDate = toIsoDateTime(tripDate) || new Date().toISOString();
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 8);

      if (!store.currentTrip) {
        await store.createDraftTrip({
          title: tripTitle.trim() || 'Yeni Rota',
          start_date: startDate,
          end_date: endDate.toISOString(),
        });
      }
      await store.addStopToTrip(poi.id);
      setShowPOISelector(false);
    } catch (error) {
      Alert.alert('Hata', 'Durak eklenemedi');
    }
  }, [tripDate, tripTitle, store]);

  /**
   * Handle removing stop from trip
   */
  const handleRemoveStop = useCallback((stopId) => {
    if (!stopId) {
      Alert.alert('Hata', 'Silinecek durak kimliği bulunamadı');
      return;
    }

    const removeStop = async () => {
      try {
        await store.removeStopFromTrip(stopId);
      } catch (error) {
        Alert.alert('Hata', error?.message || 'Durak silinemedi');
      }
    };

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm('Bu durağı rotadan çıkarmak istiyor musunuz?');
      if (confirmed) {
        removeStop();
      }
      return;
    }

    Alert.alert(
      'Durak Sil',
      'Bu durağı rotadan çıkarmak istiyor musunuz?',
      [
        { text: 'İptal', onPress: () => {} },
        { text: 'Sil', onPress: removeStop },
      ]
    );
  }, [store]);

  /**
   * Handle reordering stops via drag and drop
   */
  const handleDragStart = (stopId) => {
    setDraggedStopId(stopId);
  };

  const handleDragEnd = async (targetIndex) => {
    if (!draggedStopId) return;

    const draggedIndex = currentTripStops.findIndex(s => s.id === draggedStopId);
    if (draggedIndex === targetIndex) {
      setDraggedStopId(null);
      return;
    }

    const newStops = [...currentTripStops];
    const [draggedStop] = newStops.splice(draggedIndex, 1);
    newStops.splice(targetIndex, 0, draggedStop);

    store.reorderStops(newStops);
    setDraggedStopId(null);

    try {
      await store.saveReorderedStops();
    } catch (error) {
      // Re-sync from backend if persistence fails.
      if (currentTrip?.id) {
        await store.loadTrip(currentTrip.id);
      }
      Alert.alert('Hata', error?.message || 'Durak sırası kaydedilemedi');
    }
  };

  /**
   * Open POI details from stop list
   */
  const handleOpenPOIDetail = useCallback((stop) => {
    const poiId = stop?.poi?.id;
    if (!poiId) {
      Alert.alert('Bilgi', 'Bu durak için detay bilgisi bulunamadı');
      return;
    }

    navigation.navigate('Home', {
      screen: 'POIDetail',
      params: { poiId },
    });
  }, [navigation]);

  /**
   * Handle route optimization
   */
  const handleOptimizeRoute = useCallback(async () => {
    const showInfo = (title, message) => {
      if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
        globalThis.alert(`${title}\n\n${message}`);
        return;
      }
      Alert.alert(title, message);
    };

    if (currentTripStops.length < 3) {
      showInfo('Bilgi', 'Rotayı optimize etmek için en az 3 durak ekleyin');
      return;
    }

    const executeOptimize = async () => {
      try {
        const beforeOrder = currentTripStops.map((s) => s.id).join(',');
        await store.optimizeRoute(transportMode);
        const afterOrder = (useTripStore.getState().currentTripStops || [])
          .map((s) => s.id)
          .join(',');
        if (beforeOrder === afterOrder) {
          showInfo('Bilgi', 'Rota zaten optimal görünüyor');
        } else {
          showInfo('Başarılı', 'Rota optimize edildi');
        }
      } catch (error) {
        showInfo('Hata', error?.message || 'Rota optimize edilemedi');
      }
    };

    if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm(
        `Ulaşım modu: ${transportMode}\n\nRota optimize edilsin mi?`
      );
      if (confirmed) {
        executeOptimize();
      }
      return;
    }

    Alert.alert('Rotayı Optimize Et', `Ulaşım modu: ${transportMode}\n\nRota optimize edilsin mi?`, [
      { text: 'İptal', onPress: () => {} },
      { text: 'Optimize Et', onPress: executeOptimize },
    ]);
  }, [transportMode, currentTripStops, store]);

  /**
   * Handle saving trip
   */
  const handleSaveTrip = useCallback(async () => {
    if (!tripTitle.trim()) {
      Alert.alert('Hata', 'Lütfen rota adı girin');
      return;
    }

    const startDate = toIsoDateTime(tripDate) || new Date().toISOString();
    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 8);

    try {
      if (!store.currentTrip) {
        await store.createDraftTrip({
          title: tripTitle.trim(),
          start_date: startDate,
          end_date: endDate.toISOString(),
          transport_mode: transportMode,
        });
      } else {
        await store.updateCurrentTrip({
          title: tripTitle.trim(),
          start_date: startDate,
          end_date: endDate.toISOString(),
          transport_mode: transportMode,
        });
      }

      // Only finalize as ACTIVE when itinerary has at least one stop.
      if (currentTripStops.length > 0) {
        await store.saveCurrentTrip();
      }

      Alert.alert('Başarılı', currentTripStops.length > 0 ? 'Rota kaydedildi' : 'Taslak kaydedildi');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Hata', 'Rota kaydedilemedi');
    }
  }, [tripTitle, tripDate, currentTripStops, navigation, store, transportMode]);

  /**
   * Render stop item
   */
  const renderStopItem = ({ item, index }) => (
    <View
      style={[
        styles.stopItem,
        draggedStopId === item.id && styles.stopItemDragging,
      ]}
    >
      <TouchableOpacity
        style={styles.stopDragHandle}
        onLongPress={() => handleDragStart(item.id)}
        onPress={() => handleDragEnd(index)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.dragHandleText}>⋮⋮</Text>
      </TouchableOpacity>

      <View style={styles.stopNumber}>
        <Text style={styles.stopNumberText}>{index + 1}</Text>
      </View>

      <TouchableOpacity
        style={styles.stopContent}
        activeOpacity={0.7}
        onPress={() => handleOpenPOIDetail(item)}
      >
        <Text style={styles.stopName} numberOfLines={1}>
          {item.poi?.name || 'Unknown POI'}
        </Text>
        <View style={styles.stopMeta}>
          {item.poi?.category && (
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: CATEGORY_COLORS[item.poi.category] },
              ]}
            >
              <Text style={styles.categoryLabel}>
                {CATEGORY_LABELS_TR[item.poi.category] || item.poi.category}
              </Text>
            </View>
          )}
          {item.poi?.average_rating && (
            <Text style={styles.ratingText}>⭐ {item.poi.average_rating.toFixed(1)}</Text>
          )}
        </View>
        {item.poi?.address && (
          <Text style={styles.addressText} numberOfLines={1}>
            📍 {item.poi.address}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.removeButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={(e) => {
          e?.stopPropagation?.();
          handleRemoveStop(item.id || item.itinerary_item_id);
        }}
      >
        <Text style={styles.removeButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  // Loading state
  if (isLoading && !currentTrip) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerBackText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rota Oluştur</Text>
        <TouchableOpacity onPress={handleSaveTrip} disabled={isLoading}>
          <Text style={styles.headerSaveText}>✓ Kaydet</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Trip Info Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rota Bilgisi</Text>
          <TextInput
            style={styles.input}
            placeholder="Rota Adı"
            value={tripTitle}
            onChangeText={setTripTitle}
            placeholderTextColor="#ccc"
          />
          <TextInput
            style={styles.input}
            placeholder="Tarih (YYYY-MM-DD)"
            value={tripDate}
            onChangeText={setTripDate}
            placeholderTextColor="#ccc"
          />
        </View>

        {/* AI Trip Generation Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI ile Rota Oluştur</Text>
          <TextInput
            style={styles.input}
            placeholder="Şehir yazın (örn. Paris)"
            value={cityQuery}
            onChangeText={(text) => {
              setCityQuery(text);
              setSelectedCity('');
              setShowCitySuggestions(true);
            }}
            onFocus={() => setShowCitySuggestions(true)}
            placeholderTextColor="#ccc"
          />
          {showCitySuggestions && (cityQuery.trim().length >= 2) ? (
            <View style={styles.citySuggestionsContainer}>
              {isCityLoading ? (
                <View style={styles.citySuggestionLoading}>
                  <ActivityIndicator size="small" color="#1a1a2e" />
                </View>
              ) : (
                citySuggestions.length > 0 ? (
                  citySuggestions.slice(0, 8).map((cityItem) => (
                    <TouchableOpacity
                      key={cityItem}
                      style={styles.citySuggestionItem}
                      onPress={() => {
                        setSelectedCity(cityItem);
                        setCityQuery(cityItem);
                        setShowCitySuggestions(false);
                      }}
                    >
                      <Text style={styles.citySuggestionText}>{cityItem}</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.citySuggestionEmpty}>
                    <Text style={styles.citySuggestionEmptyText}>Şehir bulunamadı</Text>
                  </View>
                )
              )}
            </View>
          ) : null}
          <View style={styles.aiRow}>
            <TextInput
              style={[styles.input, styles.aiInputHalf]}
              placeholder="Kaç gün? (1-30)"
              value={aiDurationDays}
              onChangeText={setAiDurationDays}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
            />
            <TextInput
              style={[styles.input, styles.aiInputHalf]}
              placeholder="Durak/gün (1-8)"
              value={aiStopsPerDay}
              onChangeText={setAiStopsPerDay}
              keyboardType="numeric"
              placeholderTextColor="#ccc"
            />
          </View>
          <TouchableOpacity
            style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            onPress={handleGenerateTrip}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>✨ Şehre Göre Rota Oluştur</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Metrics Section */}
        {currentTripMetrics && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rota Özeti</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Durak Sayısı</Text>
                <Text style={styles.metricValue}>{currentTripMetrics.stopCount}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Toplam Mesafe</Text>
                <Text style={styles.metricValue}>
                  {currentTripMetrics.getFormattedDistance()}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Tahmini Süre</Text>
                <Text style={styles.metricValue}>
                  {currentTripMetrics.getFormattedDurationTR()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Transport Mode Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ulaşım Modu</Text>
          <View style={styles.transportModeGrid}>
            {['DRIVING', 'WALKING', 'CYCLING'].map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.transportModeButton,
                  transportMode === mode && styles.transportModeButtonActive,
                ]}
                onPress={() => setTransportMode(mode)}
              >
                <Text style={styles.transportModeEmoji}>
                  {RouteManager.getTransportModeEmoji(mode)}
                </Text>
                <Text
                  style={[
                    styles.transportModeLabel,
                    transportMode === mode && styles.transportModeLabelActive,
                  ]}
                >
                  {mode === 'DRIVING' ? 'Araba' : mode === 'WALKING' ? 'Yürüyüş' : 'Bisiklet'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stops Section */}
        <View style={styles.section}>
          <View style={styles.stopsHeader}>
            <Text style={styles.sectionTitle}>Duraklar ({currentTripStops.length})</Text>
            <TouchableOpacity
              style={styles.addStopButton}
              onPress={loadAvailablePOIs}
            >
              <Text style={styles.addStopButtonText}>+ Durak Ekle</Text>
            </TouchableOpacity>
          </View>

          {currentTripStops.length > 0 ? (
            <View style={styles.stopsList}>
              {currentTripStops.map((stop, index) =>
                renderStopItem({ item: stop, index })
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Henüz durak eklenmedi</Text>
              <Text style={styles.emptyStateSubtext}>Başlamak için durak ekleyin</Text>
            </View>
          )}

          {currentTripStops.length > 1 && (
            <TouchableOpacity
              style={[styles.optimizeButton, isOptimizing && styles.optimizeButtonDisabled]}
              onPress={handleOptimizeRoute}
              disabled={isOptimizing}
            >
              {isOptimizing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.optimizeButtonIcon}>🔀</Text>
                  <Text style={styles.optimizeButtonText}>Rotayı Optimize Et</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Additional Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonIcon}>🗺️</Text>
            <Text style={styles.actionButtonText}>Harita Üzerinde Göster</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonIcon}>📸</Text>
            <Text style={styles.actionButtonText}>Rota Paylaş</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonIcon}>📅</Text>
            <Text style={styles.actionButtonText}>Takvime Ekle</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* POI Selection Modal */}
      <Modal
        visible={showPOISelector}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPOISelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mekan Seç</Text>
              <TouchableOpacity onPress={() => setShowPOISelector(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Mekan ara..."
              placeholderTextColor="#ccc"
            />
            <FlatList
              data={availablePOIs}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.poiItem}
                  onPress={() => handleAddPOI(item)}
                >
                  <View>
                    <Text style={styles.poiName}>{item.name}</Text>
                    <Text style={styles.poiAddress}>{item.address}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Mekan bulunamadı</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerBackText: {
    fontSize: 16,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  headerSaveText: {
    fontSize: 16,
    color: '#27ae60',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  aiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  aiInputHalf: {
    flex: 1,
  },
  citySuggestionsContainer: {
    marginTop: -8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  citySuggestionLoading: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  citySuggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  citySuggestionText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '500',
  },
  citySuggestionEmpty: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  citySuggestionEmptyText: {
    color: '#999',
    fontSize: 13,
  },
  generateButton: {
    marginTop: 4,
    backgroundColor: '#34495e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.7,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  transportModeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  transportModeButton: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  transportModeButtonActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  transportModeEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  transportModeLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  transportModeLabelActive: {
    color: '#fff',
  },
  stopsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addStopButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addStopButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  stopsList: {
    marginBottom: 12,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1a1a2e',
  },
  stopItemDragging: {
    backgroundColor: '#e8f5e9',
    opacity: 0.7,
  },
  stopDragHandle: {
    marginRight: 8,
    paddingHorizontal: 4,
  },
  dragHandleText: {
    fontSize: 12,
    color: '#ccc',
    fontWeight: 'bold',
  },
  stopNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  stopContent: {
    flex: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  stopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  ratingText: {
    fontSize: 11,
    color: '#f39c12',
  },
  addressText: {
    fontSize: 11,
    color: '#888',
  },
  removeButton: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdecea',
    zIndex: 2,
  },
  removeButtonText: {
    fontSize: 16,
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
  },
  optimizeButton: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  optimizeButtonDisabled: {
    opacity: 0.6,
  },
  optimizeButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  optimizeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  actionButtonIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  actionButtonText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  closeButton: {
    fontSize: 20,
    color: '#999',
  },
  modalSearchInput: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  poiItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  poiName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  poiAddress: {
    fontSize: 12,
    color: '#888',
  },
});
