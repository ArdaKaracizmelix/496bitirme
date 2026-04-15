import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Image, FlatList
} from 'react-native';
import useAuthStore from '../../store/authStore';

const MOCK_USER = {
  name: 'Mehmet Yekta Pamuk',
  username: '@ykpam',
  avatar: 'https://i.pravatar.cc/150?img=11',
  bio: 'Gezgin | Fotoğrafçı | İstanbul sevdalısı 🌍',
  followers: 1240,
  following: 380,
  posts: 47,
  stats: {
    countries: 12,
    cities: 38,
    totalKm: '4,200 km',
  },
};

const MOCK_POSTS = [
  { id: '1', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hagia_Sophia_Mars_2013.jpg/640px-Hagia_Sophia_Mars_2013.jpg' },
  { id: '2', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Galata_tower_and_bridge.jpg/640px-Galata_tower_and_bridge.jpg' },
  { id: '3', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Großer_Bazar_Istanbul.jpg/640px-Großer_Bazar_Istanbul.jpg' },
  { id: '4', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hagia_Sophia_Mars_2013.jpg/640px-Hagia_Sophia_Mars_2013.jpg' },
  { id: '5', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Galata_tower_and_bridge.jpg/640px-Galata_tower_and_bridge.jpg' },
  { id: '6', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Großer_Bazar_Istanbul.jpg/640px-Großer_Bazar_Istanbul.jpg' },
];

const MOCK_TRIPS = [
  { id: '1', title: 'İstanbul Tarihi Yarımada', date: '20 Mart 2026', stops: 3 },
  { id: '2', title: 'Boğaz Turu', date: '25 Mart 2026', stops: 2 },
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState('GÖNDERILER');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logout = useAuthStore((state) => state.logout);
  const tabs = ['GÖNDERILER', 'ROTALAR'];

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const renderPostGrid = () => (
    <View style={styles.grid}>
      {MOCK_POSTS.map((post) => (
        <TouchableOpacity key={post.id} style={styles.gridItem}>
          <Image source={{ uri: post.image }} style={styles.gridImage} />
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderTrips = () => (
    <View style={styles.tripsList}>
      {MOCK_TRIPS.map((trip) => (
        <TouchableOpacity key={trip.id} style={styles.tripItem}>
          <View style={styles.tripIcon}>
            <Text style={styles.tripIconText}>🗺️</Text>
          </View>
          <View style={styles.tripInfo}>
            <Text style={styles.tripTitle}>{trip.title}</Text>
            <Text style={styles.tripMeta}>📅 {trip.date} · 📍 {trip.stops} durak</Text>
          </View>
          <Text style={styles.tripArrow}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Info */}
      <View style={styles.profileSection}>
        <Image source={{ uri: MOCK_USER.avatar }} style={styles.avatar} />
        <Text style={styles.name}>{MOCK_USER.name}</Text>
        <Text style={styles.username}>{MOCK_USER.username}</Text>
        <Text style={styles.bio}>{MOCK_USER.bio}</Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{MOCK_USER.posts}</Text>
            <Text style={styles.statLabel}>Gönderi</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{MOCK_USER.followers.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Takipçi</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{MOCK_USER.following}</Text>
            <Text style={styles.statLabel}>Takip</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Profili Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton}>
            <Text style={styles.shareButtonText}>🔗</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Travel Stats */}
      <View style={styles.travelStats}>
        <View style={styles.travelStat}>
          <Text style={styles.travelStatValue}>{MOCK_USER.stats.countries}</Text>
          <Text style={styles.travelStatLabel}>Ülke</Text>
        </View>
        <View style={styles.travelStatDivider} />
        <View style={styles.travelStat}>
          <Text style={styles.travelStatValue}>{MOCK_USER.stats.cities}</Text>
          <Text style={styles.travelStatLabel}>Şehir</Text>
        </View>
        <View style={styles.travelStatDivider} />
        <View style={styles.travelStat}>
          <Text style={styles.travelStatValue}>{MOCK_USER.stats.totalKm}</Text>
          <Text style={styles.travelStatLabel}>Toplam Yol</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'GÖNDERILER' ? '⊞' : '🗺️'} {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'GÖNDERILER' ? renderPostGrid() : renderTrips()}

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={isLoggingOut}
      >
        <Text style={styles.logoutText}>
          {isLoggingOut ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'flex-end', padding: 16 },
  settingsButton: { padding: 4 },
  settingsIcon: { fontSize: 22 },
  profileSection: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 12, borderWidth: 3, borderColor: '#1a1a2e' },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 2 },
  username: { fontSize: 14, color: '#888', marginBottom: 8 },
  bio: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  stat: { alignItems: 'center', paddingHorizontal: 24 },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#eee' },
  actionButtons: { flexDirection: 'row', gap: 8, width: '100%' },
  editButton: { flex: 1, borderWidth: 1.5, borderColor: '#1a1a2e', borderRadius: 10, padding: 10, alignItems: 'center' },
  editButtonText: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  shareButton: { borderWidth: 1.5, borderColor: '#1a1a2e', borderRadius: 10, padding: 10, paddingHorizontal: 14 },
  shareButtonText: { fontSize: 16 },
  travelStats: { flexDirection: 'row', margin: 16, backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20 },
  travelStat: { flex: 1, alignItems: 'center' },
  travelStatValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  travelStatLabel: { fontSize: 12, color: '#aaa', marginTop: 2 },
  travelStatDivider: { width: 1, backgroundColor: '#333' },
  tabsContainer: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1a1a2e' },
  tabText: { fontSize: 13, color: '#888', fontWeight: '500' },
  tabTextActive: { color: '#1a1a2e', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '33.33%', aspectRatio: 1 },
  gridImage: { width: '100%', height: '100%', borderWidth: 1, borderColor: '#fff' },
  tripsList: { padding: 16 },
  tripItem: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f8f8f8', borderRadius: 12, marginBottom: 8 },
  tripIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  tripIconText: { fontSize: 20 },
  tripInfo: { flex: 1 },
  tripTitle: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  tripMeta: { fontSize: 12, color: '#888' },
  tripArrow: { fontSize: 24, color: '#ccc' },
  logoutButton: { margin: 16, padding: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#e74c3c', alignItems: 'center', marginBottom: 32 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#e74c3c' },
});
