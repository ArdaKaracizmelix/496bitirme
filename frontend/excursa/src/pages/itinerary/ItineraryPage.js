import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Modal, TextInput, ScrollView
} from 'react-native';

const MOCK_TRIPS = [
  {
    id: '1',
    title: 'İstanbul Tarihi Yarımada',
    date: '20 Mart 2026',
    status: 'YAKLAŞAN',
    stops: [
      { id: '1', name: 'Ayasofya', category: 'TARİHİ', duration: '2 saat', order: 1 },
      { id: '2', name: 'Topkapı Sarayı', category: 'TARİHİ', duration: '3 saat', order: 2 },
      { id: '3', name: 'Kapalıçarşı', category: 'ALIŞVERİŞ', duration: '1.5 saat', order: 3 },
    ],
    totalDistance: '3.2 km',
    estimatedDuration: '6.5 saat',
  },
  {
    id: '2',
    title: 'Boğaz Turu',
    date: '25 Mart 2026',
    status: 'TASLAK',
    stops: [
      { id: '1', name: 'Galata Kulesi', category: 'TARİHİ', duration: '1 saat', order: 1 },
      { id: '2', name: 'Boğaz Köprüsü', category: 'DOĞA', duration: '1 saat', order: 2 },
    ],
    totalDistance: '8.5 km',
    estimatedDuration: '2 saat',
  },
  {
    id: '3',
    title: 'Kadıköy Keşfi',
    date: '10 Mart 2026',
    status: 'TAMAMLANDI',
    stops: [
      { id: '1', name: 'Moda Sahili', category: 'DOĞA', duration: '2 saat', order: 1 },
      { id: '2', name: 'Kadıköy Çarşısı', category: 'ALIŞVERİŞ', duration: '2 saat', order: 2 },
    ],
    totalDistance: '2.1 km',
    estimatedDuration: '4 saat',
  },
];

const STATUS_COLORS = {
  'YAKLAŞAN': { bg: '#e8f5e9', text: '#27ae60' },
  'TASLAK': { bg: '#fff3e0', text: '#f39c12' },
  'TAMAMLANDI': { bg: '#e3f2fd', text: '#2980b9' },
};

const CATEGORY_COLORS = {
  'TARİHİ': '#e74c3c',
  'DOĞA': '#27ae60',
  'ALIŞVERİŞ': '#f39c12',
};

export default function ItineraryPage() {
  const [trips, setTrips] = useState(MOCK_TRIPS);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTripModal, setNewTripModal] = useState(false);
  const [newTripTitle, setNewTripTitle] = useState('');
  const [newTripDate, setNewTripDate] = useState('');
  const [activeTab, setActiveTab] = useState('TÜMÜ');

  const tabs = ['TÜMÜ', 'YAKLAŞAN', 'TASLAK', 'TAMAMLANDI'];

  const filteredTrips = activeTab === 'TÜMÜ'
    ? trips
    : trips.filter(t => t.status === activeTab);

  const createTrip = () => {
    if (!newTripTitle || !newTripDate) return;
    const newTrip = {
      id: String(trips.length + 1),
      title: newTripTitle,
      date: newTripDate,
      status: 'TASLAK',
      stops: [],
      totalDistance: '0 km',
      estimatedDuration: '0 saat',
    };
    setTrips([newTrip, ...trips]);
    setNewTripTitle('');
    setNewTripDate('');
    setNewTripModal(false);
  };

  const renderStop = (stop) => (
    <View key={stop.id} style={styles.stopItem}>
      <View style={styles.stopNumber}>
        <Text style={styles.stopNumberText}>{stop.order}</Text>
      </View>
      <View style={styles.stopLine} />
      <View style={styles.stopInfo}>
        <Text style={styles.stopName}>{stop.name}</Text>
        <View style={styles.stopMeta}>
          <View style={[styles.stopCategory, { backgroundColor: CATEGORY_COLORS[stop.category] || '#888' }]}>
            <Text style={styles.stopCategoryText}>{stop.category}</Text>
          </View>
          <Text style={styles.stopDuration}>⏱ {stop.duration}</Text>
        </View>
      </View>
    </View>
  );

  const renderTrip = ({ item }) => (
    <TouchableOpacity
      style={styles.tripCard}
      onPress={() => { setSelectedTrip(item); setModalVisible(true); }}
    >
      <View style={styles.tripHeader}>
        <Text style={styles.tripTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status]?.bg }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status]?.text }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <Text style={styles.tripDate}>📅 {item.date}</Text>

      <View style={styles.tripStats}>
        <Text style={styles.tripStat}>📍 {item.stops.length} durak</Text>
        <Text style={styles.tripStat}>🗺 {item.totalDistance}</Text>
        <Text style={styles.tripStat}>⏱ {item.estimatedDuration}</Text>
      </View>

      <View style={styles.stopsPreview}>
        {item.stops.slice(0, 3).map((stop, index) => (
          <View key={stop.id} style={styles.stopPreviewItem}>
            <View style={[styles.stopDot, { backgroundColor: CATEGORY_COLORS[stop.category] || '#888' }]} />
            <Text style={styles.stopPreviewName} numberOfLines={1}>{stop.name}</Text>
            {index < item.stops.length - 1 && index < 2 && (
              <Text style={styles.stopArrow}>→</Text>
            )}
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rotalarım</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setNewTripModal(true)}
        >
          <Text style={styles.createButtonText}>+ Yeni Rota</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredTrips}
        keyExtractor={(item) => item.id}
        renderItem={renderTrip}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Trip Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTrip && (
              <ScrollView>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedTrip.title}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalDate}>📅 {selectedTrip.date}</Text>

                <View style={styles.modalStats}>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatValue}>{selectedTrip.stops.length}</Text>
                    <Text style={styles.modalStatLabel}>Durak</Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatValue}>{selectedTrip.totalDistance}</Text>
                    <Text style={styles.modalStatLabel}>Mesafe</Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatValue}>{selectedTrip.estimatedDuration}</Text>
                    <Text style={styles.modalStatLabel}>Süre</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Duraklar</Text>
                {selectedTrip.stops.map(renderStop)}

                <TouchableOpacity style={styles.optimizeButton}>
                  <Text style={styles.optimizeButtonText}>🔀 Rotayı Optimize Et</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* New Trip Modal */}
      <Modal
        visible={newTripModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setNewTripModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Rota Oluştur</Text>
              <TouchableOpacity onPress={() => setNewTripModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Rota adı"
              value={newTripTitle}
              onChangeText={setNewTripTitle}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Tarih (örn: 25 Mart 2026)"
              value={newTripDate}
              onChangeText={setNewTripDate}
            />

            <TouchableOpacity style={styles.createTripButton} onPress={createTrip}>
              <Text style={styles.createTripButtonText}>Oluştur</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e' },
  createButton: { backgroundColor: '#1a1a2e', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tabsContainer: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8, maxHeight: 50 },
  tab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginRight: 8, backgroundColor: '#f0f0f0' },
  tabActive: { backgroundColor: '#1a1a2e' },
  tabText: { fontSize: 13, color: '#666', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  listContent: { padding: 12 },
  tripCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  tripTitle: { fontSize: 17, fontWeight: 'bold', color: '#1a1a2e', flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  tripDate: { fontSize: 13, color: '#888', marginBottom: 10 },
  tripStats: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  tripStat: { fontSize: 13, color: '#555' },
  stopsPreview: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  stopPreviewItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stopDot: { width: 8, height: 8, borderRadius: 4 },
  stopPreviewName: { fontSize: 12, color: '#555', maxWidth: 80 },
  stopArrow: { fontSize: 12, color: '#aaa' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', flex: 1 },
  closeButton: { fontSize: 20, color: '#999' },
  modalDate: { fontSize: 14, color: '#888', marginBottom: 16 },
  modalStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f8f8f8', borderRadius: 12, padding: 16, marginBottom: 20 },
  modalStat: { alignItems: 'center' },
  modalStatValue: { fontSize: 18, fontWeight: 'bold', color: '#1a1a2e' },
  modalStatLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e', marginBottom: 12 },
  stopItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  stopNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  stopNumberText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  stopLine: { position: 'absolute', left: 13, top: 28, width: 2, height: 40, backgroundColor: '#ddd' },
  stopInfo: { flex: 1, marginLeft: 12 },
  stopName: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginBottom: 4 },
  stopMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopCategory: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  stopCategoryText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  stopDuration: { fontSize: 12, color: '#888' },
  optimizeButton: { backgroundColor: '#1a1a2e', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  optimizeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  createTripButton: { backgroundColor: '#1a1a2e', padding: 16, borderRadius: 12, alignItems: 'center' },
  createTripButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});