/**
 * SavedTripsScreen - Dashboard displaying user's upcoming and past trips
 * Features: Trip filtering, sharing, cloning, viewing, and management
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrips } from '../hooks/useTrips';
import useTripStore from '../store/tripStore';
import TripService from '../services/TripService';
import useAuthStore from '../store/authStore';

const TRIP_STATUS = {
  DRAFT: { label: 'Taslak', color: 'text', bgColor: '#fff3e0' },
  ACTIVE: { label: 'Aktif', color: 'success', bgColor: '#e8f5e9' },
  COMPLETED: { label: 'Tamamlandı', color: 'info', bgColor: '#e3f2fd' },
  ARCHIVED: { label: 'Arşivlendi', color: 'muted', bgColor: '#ecf0f1' },
};

const STATUS_TEXT_COLORS = {
  'DRAFT': '#f39c12',
  'ACTIVE': '#27ae60',
  'COMPLETED': '#2980b9',
  'ARCHIVED': '#95a5a6',
};

export default function SavedTripsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const store = useTripStore();

  // Query hooks
  const { data: tripsData, isLoading: tripsLoading, refetch: refetchTrips } = useTrips();

  // Local state
  const [activeTab, setActiveTab] = useState('UPCOMING');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const allTrips = Array.isArray(tripsData?.results) ? tripsData.results : tripsData || [];
  const currentUsername = user?.username;
  const ownTrips = currentUsername
    ? allTrips.filter((trip) => trip?.username === currentUsername)
    : allTrips;

  const isPastTrip = (trip) => {
    if (trip?.status === 'COMPLETED' || trip?.status === 'ARCHIVED') {
      return true;
    }
    if (!trip?.end_date) {
      return false;
    }
    const endAt = new Date(trip.end_date);
    if (Number.isNaN(endAt.getTime())) {
      return false;
    }
    return endAt < new Date();
  };

  const upcomingTrips = ownTrips.filter((trip) => !isPastTrip(trip));
  const pastTrips = ownTrips.filter(isPastTrip);

  /**
   * Handle pull-to-refresh
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchTrips();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchTrips]);

  /**
   * Format date to readable format
   */
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  /**
   * Handle opening trip details
   */
  const handleTripPress = useCallback(async (trip) => {
    setSelectedTrip(trip);
    setShowTripDetails(true);
    setIsLoadingDetails(true);
    try {
      const fullTrip = await TripService.fetchTripById(trip.id);
      setSelectedTrip(fullTrip);
    } catch (error) {
      // Keep lightweight list item if full fetch fails.
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  /**
   * Handle editing trip
   */
  const handleEditTrip = useCallback(async () => {
    if (!selectedTrip) return;
    setShowTripDetails(false);
    navigation.navigate('IterinaryBuilder', { tripId: selectedTrip.id });
  }, [selectedTrip, navigation]);

  /**
   * Handle deleting trip
   */
  const handleDeleteTrip = useCallback(async () => {
    if (!selectedTrip) return;

    Alert.alert(
      'Rotayı Sil',
      'Bu rotayı silmek istiyor musunuz? Bu işlem geri alınamaz.',
      [
        { text: 'İptal', onPress: () => {} },
        {
          text: 'Sil',
          onPress: async () => {
            try {
              await store.deleteTrip(selectedTrip.id);
              setShowTripDetails(false);
              Alert.alert('Başarılı', 'Rota silindi');
              refetchTrips();
            } catch (error) {
              Alert.alert('Hata', 'Rota silinemedi');
            }
          },
        },
      ]
    );
  }, [selectedTrip, store, refetchTrips]);

  /**
   * Handle sharing trip
   */
  const handleShareTrip = useCallback(async () => {
    if (!selectedTrip) return;

    const shareWithLink = async () => {
      const result = await store.shareTrip(selectedTrip.id);
      const stopCount = selectedTrip.stops?.length ?? selectedTrip.total_stops ?? 0;
      await Share.share({
        message: `${selectedTrip.title} rotasını kontrol et!\n\nRota: ${selectedTrip.title}\nDuraklar: ${stopCount}\nSüre: ${selectedTrip.total_duration || 'Bilinmiyor'}`,
        title: selectedTrip.title,
        url: result?.share_link || 'excursa://trip/' + selectedTrip.id,
      });
    };

    try {
      await shareWithLink();
    } catch (error) {
      const message = error?.message || 'Rota paylaşılamadı';
      const needsPublic = message.toLowerCase().includes('public itineraries');

      if (needsPublic) {
        const makePublicAndShare = async () => {
          try {
            await TripService.updateTrip(selectedTrip.id, { visibility: 'PUBLIC' });
            const fullTrip = await TripService.fetchTripById(selectedTrip.id);
            setSelectedTrip(fullTrip);
            await shareWithLink();
          } catch (shareError) {
            Alert.alert('Hata', shareError?.message || 'Rota paylaşılamadı');
          }
        };

        if (typeof globalThis.confirm === 'function') {
          const confirmed = globalThis.confirm(
            'Bu rota private durumda. Paylaşmak için public yapalım mı?'
          );
          if (confirmed) {
            await makePublicAndShare();
          }
          return;
        }

        Alert.alert(
          'Rota Private',
          'Bu rota private durumda. Paylaşmak için public yapalım mı?',
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Evet', onPress: makePublicAndShare },
          ]
        );
        return;
      }

      Alert.alert('Hata', message);
    }
  }, [selectedTrip, store]);

  /**
   * Handle cloning trip
   */
  const handleCloneTrip = useCallback(async () => {
    if (!selectedTrip) return;

    Alert.alert(
      'Rotayı Kopyala',
      'Bu rotanın bir kopyasını oluşturmak istiyor musunuz?',
      [
        { text: 'İptal', onPress: () => {} },
        {
          text: 'Kopyala',
          onPress: async () => {
            try {
              await store.cloneTrip(selectedTrip.id);
              setShowTripDetails(false);
              Alert.alert('Başarılı', 'Rota kopyalandı');
              refetchTrips();
            } catch (error) {
              Alert.alert('Hata', 'Rota kopyalanamadı');
            }
          },
        },
      ]
    );
  }, [selectedTrip, store, refetchTrips]);

  /**
   * Handle exporting to calendar
   */
  const handleExportToCalendar = useCallback(async () => {
    if (!selectedTrip) return;

    try {
      await store.exportToCalendar(selectedTrip.id);
      Alert.alert('Başarılı', 'Rota takvime eklendi');
    } catch (error) {
      Alert.alert('Hata', 'Takvime eklenemedi');
    }
  }, [selectedTrip, store]);

  /**
   * Render trip card
   */
  const renderTripCard = ({ item: trip }) => {
    const statusInfo = TRIP_STATUS[trip.status];
    const stops = trip.stops || [];
    const stopCount = stops.length || trip.total_stops || 0;

    return (
      <TouchableOpacity
        style={styles.tripCard}
        onPress={() => handleTripPress(trip)}
      >
        <View style={styles.tripCardHeader}>
          <View style={styles.tripCardTitleSection}>
            <Text style={styles.tripTitle} numberOfLines={1}>
              {trip.title}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusInfo.bgColor },
              ]}
            >
              <Text style={[styles.statusText, { color: STATUS_TEXT_COLORS[trip.status] }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => {
              setSelectedTrip(trip);
              setShowActionMenu(true);
            }}
          >
            <Text style={styles.moreButtonText}>⋮</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tripDate}>
          📅 {formatDate(trip.start_date)}
        </Text>

        <View style={styles.tripStats}>
          <View style={styles.tripStat}>
            <Text style={styles.tripStatIcon}>📍</Text>
            <Text style={styles.tripStatText}>{stopCount} durak</Text>
          </View>
          {trip.estimated_cost && (
            <View style={styles.tripStat}>
              <Text style={styles.tripStatIcon}>💰</Text>
              <Text style={styles.tripStatText}>₺{trip.estimated_cost}</Text>
            </View>
          )}
        </View>

        {stops.length > 0 && (
          <View style={styles.stopsPreview}>
            <Text style={styles.stopsPreviewLabel}>Duraklar:</Text>
            <View style={styles.stopsPreviewList}>
              {stops.slice(0, 3).map((stop, index) => (
                <View key={stop.id || index} style={styles.stopPreviewBubble}>
                  <Text style={styles.stopPreviewName} numberOfLines={1}>
                    {stop.poi?.name || `Durak ${index + 1}`}
                  </Text>
                  {index < Math.min(2, stops.length - 1) && (
                    <Text style={styles.stopPreviewArrow}>→</Text>
                  )}
                </View>
              ))}
              {stops.length > 3 && (
                <Text style={styles.stopsPreviewMore}>+{stops.length - 3}</Text>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateEmoji}>🗺️</Text>
      <Text style={styles.emptyStateTitle}>
        {activeTab === 'UPCOMING' ? 'Yaklaşan rota yok' : 'Geçmiş rota yok'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {activeTab === 'UPCOMING'
          ? 'Bir rota oluşturarak başla'
          : 'Hiç rota tamamlanmadı'}
      </Text>
      {activeTab === 'UPCOMING' && (
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('IterinaryBuilder')}
        >
          <Text style={styles.createButtonText}>+ Yeni Rota Oluştur</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const displayTrips = activeTab === 'UPCOMING' ? upcomingTrips : pastTrips;
  const isLoading = tripsLoading;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Rotalarım</Text>
          <Text style={styles.headerSubtitle}>
            {user?.full_name || 'Kullanıcı'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.createTopButton}
          onPress={() => navigation.navigate('IterinaryBuilder')}
        >
          <Text style={styles.createTopButtonText}>+ Yeni</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {['UPCOMING', 'PAST'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && styles.tabActive,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              activeTab === tab && styles.tabTextActive,
            ]}>
              {tab === 'UPCOMING' ? 'Yaklaşan' : 'Geçmiş'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trips List */}
      {isLoading && displayTrips.length === 0 ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : displayTrips.length === 0 ? (
        <FlatList
          data={[{}]}
          renderItem={renderEmptyState}
          keyExtractor={() => 'empty'}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
        />
      ) : (
        <FlatList
          data={displayTrips}
          renderItem={renderTripCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
        />
      )}

      {/* Trip Details Modal */}
      <Modal
        visible={showTripDetails}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTripDetails(false)}
      >
        <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowTripDetails(false)}>
                <Text style={styles.modalCloseText}>← Geri</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Rota Detayları</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTripDetails(false);
                  setShowActionMenu(true);
                }}
              >
                <Text style={styles.modalMenuText}>⋮</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollContent}>
              {isLoadingDetails ? (
                <View style={styles.centerContent}>
                  <ActivityIndicator size="small" color="#1a1a2e" />
                </View>
              ) : selectedTrip && (
                <>
                  <Text style={styles.detailTitle}>{selectedTrip.title}</Text>
                  <View
                    style={[
                      styles.detailStatusBadge,
                      { backgroundColor: TRIP_STATUS[selectedTrip.status].bgColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.detailStatusText,
                        { color: STATUS_TEXT_COLORS[selectedTrip.status] },
                      ]}
                    >
                      {TRIP_STATUS[selectedTrip.status].label}
                    </Text>
                  </View>

                  <Text style={styles.detailDate}>
                    📅 {formatDate(selectedTrip.start_date)}
                  </Text>

                  {selectedTrip.stops && selectedTrip.stops.length > 0 && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Duraklar</Text>
                      {selectedTrip.stops.map((stop, index) => (
                        <View key={stop.id} style={styles.detailStopItem}>
                          <View style={styles.detailStopNumber}>{index + 1}</View>
                          <View style={styles.detailStopInfo}>
                            <Text style={styles.detailStopName}>
                              {stop.poi?.name || 'POI'}
                            </Text>
                            {stop.poi?.address && (
                              <Text style={styles.detailStopAddress}>
                                📍 {stop.poi.address}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {selectedTrip.estimated_cost && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Tahmin Edilen Maliyet</Text>
                      <Text style={styles.detailCost}>
                        ₺{selectedTrip.estimated_cost}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleEditTrip}
              >
                <Text style={styles.primaryButtonText}>✏️ Düzenle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleShareTrip}
              >
                <Text style={styles.secondaryButtonText}>📤 Paylaş</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Menu Modal */}
      <Modal
        visible={showActionMenu}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableOpacity
          style={styles.actionMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowActionMenu(false)}
        >
          <View style={styles.actionMenu}>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                handleEditTrip();
                setShowActionMenu(false);
              }}
            >
              <Text style={styles.actionMenuIcon}>✏️</Text>
              <Text style={styles.actionMenuText}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                handleShareTrip();
                setShowActionMenu(false);
              }}
            >
              <Text style={styles.actionMenuIcon}>📤</Text>
              <Text style={styles.actionMenuText}>Paylaş</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                handleCloneTrip();
                setShowActionMenu(false);
              }}
            >
              <Text style={styles.actionMenuIcon}>📋</Text>
              <Text style={styles.actionMenuText}>Kopyala</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                handleExportToCalendar();
                setShowActionMenu(false);
              }}
            >
              <Text style={styles.actionMenuIcon}>📅</Text>
              <Text style={styles.actionMenuText}>Takvime Ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionMenuItem, styles.actionMenuItemDanger]}
              onPress={() => {
                handleDeleteTrip();
                setShowActionMenu(false);
              }}
            >
              <Text style={styles.actionMenuIcon}>🗑️</Text>
              <Text style={[styles.actionMenuText, styles.actionMenuTextDanger]}>
                Sil
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  createTopButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createTopButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#1a1a2e',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tripCardTitleSection: {
    flex: 1,
  },
  tripTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  moreButton: {
    padding: 4,
    marginLeft: 8,
  },
  moreButtonText: {
    fontSize: 18,
    color: '#999',
  },
  tripDate: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
  },
  tripStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  tripStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripStatIcon: {
    fontSize: 14,
  },
  tripStatText: {
    fontSize: 12,
    color: '#555',
  },
  stopsPreview: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 10,
  },
  stopsPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  stopsPreviewList: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  stopPreviewBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  stopPreviewName: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  stopPreviewArrow: {
    fontSize: 11,
    color: '#aaa',
    marginHorizontal: 2,
  },
  stopsPreviewMore: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalContent: {
    flex: 1,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  modalMenuText: {
    fontSize: 18,
    color: '#999',
  },
  modalScrollContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  detailTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  detailStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  detailStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailDate: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
  },
  detailSection: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  detailStopItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  detailStopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  detailStopInfo: {
    flex: 1,
  },
  detailStopName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  detailStopAddress: {
    fontSize: 12,
    color: '#888',
  },
  detailCost: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secondaryButtonText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '600',
  },
  actionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionMenu: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  actionMenuItemDanger: {
    borderBottomWidth: 0,
  },
  actionMenuIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  actionMenuText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a2e',
  },
  actionMenuTextDanger: {
    color: '#e74c3c',
  },
});
