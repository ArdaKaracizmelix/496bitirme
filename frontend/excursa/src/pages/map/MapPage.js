import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Platform } from 'react-native';

const MOCK_POIS = [
  { id: '1', name: 'Ayasofya', category: 'TARİHİ', rating: 4.8, address: 'Sultanahmet, İstanbul', latitude: 41.0086, longitude: 28.9802, description: 'Dünyanın en önemli tarihi yapılarından biri.' },
  { id: '2', name: 'Galata Kulesi', category: 'TARİHİ', rating: 4.6, address: 'Beyoğlu, İstanbul', latitude: 41.0256, longitude: 28.9741, description: 'İstanbul\'un simgesi olan ortaçağ kulesi.' },
  { id: '3', name: 'Kapalıçarşı', category: 'ALIŞVERİŞ', rating: 4.5, address: 'Fatih, İstanbul', latitude: 41.0106, longitude: 28.9681, description: 'Dünyanın en büyük kapalı çarşılarından biri.' },
  { id: '4', name: 'Boğaz Köprüsü', category: 'DOĞA', rating: 4.7, address: 'Ortaköy, İstanbul', latitude: 41.0461, longitude: 29.0337, description: 'Avrupa ile Asya\'yı birleştiren köprü.' },
  { id: '5', name: 'Topkapı Sarayı', category: 'TARİHİ', rating: 4.7, address: 'Sultanahmet, İstanbul', latitude: 41.0115, longitude: 28.9833, description: 'Osmanlı İmparatorluğu\'nun yönetim merkezi.' },
];

const CATEGORY_COLORS = {
  'TARİHİ': '#e74c3c',
  'DOĞA': '#27ae60',
  'ALIŞVERİŞ': '#f39c12',
};

function WebMap({ pois, onSelectPOI }) {
  const markers = pois.map(poi =>
    `var marker${poi.id} = L.marker([${poi.latitude}, ${poi.longitude}]).addTo(map);
     marker${poi.id}.on('click', function() {
       window.parent.postMessage(JSON.stringify(${JSON.stringify(poi)}), '*');
     });
     marker${poi.id}.bindPopup('<b>${poi.name}</b>');`
  ).join('\n');

  // TODO: Su an OpenStreetMap kullaniyoruz, ileride Google Places ve Foursquare API'lerini kullanacagiz OSM yine de güzel bir alternatif.
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { margin: 0; padding: 0; }
        #map { height: 100vh; width: 100%; }
        .leaflet-control-attribution { display: none; }
        .leaflet-control-zoom { margin-top: 16px !important; margin-right: 16px !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([41.0082, 28.9784], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        ${markers}
      </script>
    </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    return (
      <iframe
        srcDoc={html}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="map"
      />
    );
  }

  return null;
}

export default function MapPage() {
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const filteredPOIs = MOCK_POIS.filter(poi =>
    poi.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        <WebMap
          pois={filteredPOIs}
          onSelectPOI={(poi) => {
            setSelectedPOI(poi);
            setModalVisible(true);
          }}
        />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Mekan ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPOI && (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>{selectedPOI.name}</Text>
                    <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_COLORS[selectedPOI.category] || '#1a1a2e' }]}>
                      <Text style={styles.categoryText}>{selectedPOI.category}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalAddress}>📍 {selectedPOI.address}</Text>
                <Text style={styles.modalRating}>⭐ {selectedPOI.rating} / 5.0</Text>
                <Text style={styles.modalDescription}>{selectedPOI.description}</Text>
                <TouchableOpacity style={styles.addButton}>
                  <Text style={styles.addButtonText}>+ Rotama Ekle</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  searchContainer: { position: 'absolute', top: 16, left: 16, right: 16 },
  searchInput: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 6 },
  categoryBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  categoryText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  closeButton: { fontSize: 20, color: '#999' },
  modalAddress: { fontSize: 14, color: '#666', marginBottom: 6 },
  modalRating: { fontSize: 14, color: '#666', marginBottom: 12 },
  modalDescription: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 20 },
  addButton: { backgroundColor: '#1a1a2e', padding: 16, borderRadius: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});