import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert
} from "react-native";
import useAuthStore from "../../store/authStore";
import api from "../../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState("GÖNDERILER");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userData, setUserData] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = useAuthStore((state) => state.logout);
  const tabs = ["GÖNDERILER", "ROTALAR"];

  const fetchProfileData = useCallback(async () => {
    try {
      // 1. Get the stored profile object from AsyncStorage
      const storedUserRaw = await AsyncStorage.getItem("@excursa_user_profile");

      if (!storedUserRaw) {
        throw new Error("Local profile not found");
      }

      const storedUser = JSON.parse(storedUserRaw);
      const uuid = storedUser.id;

      const response = await api.get(`/user/${uuid}/`);

      setUserData(response.data);
    } catch (error) {
      console.error("Profile fetch error:", error);
      Alert.alert("Hata", "Profil bilgileri UUID üzerinden alınamadı.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      const refreshToken = await AsyncStorage.getItem("@excursa_refresh_token");
      await api.post("/auth/logout/", { refresh: refreshToken });
    } catch (error) {
      console.log("Cleanup local state...");
    } finally {
      await logout();
      setIsLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Section */}
      <View style={styles.profileSection}>
        <Image
          source={{
            uri: userData?.avatar_url || "https://i.pravatar.cc/150?img=11"
          }}
          style={styles.avatar}
        />
        <Text style={styles.name}>{userData?.full_name}</Text>
        <Text style={styles.username}>@{userData?.email?.split("@")[0]}</Text>
        <Text style={styles.bio}>
          {userData?.bio || "Keşfetmeye hazır! 🌍"}
        </Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{userData?.posts_count || 0}</Text>
            <Text style={styles.statLabel}>Gönderi</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {userData?.followers_count || 0}
            </Text>
            <Text style={styles.statLabel}>Takipçi</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {userData?.following_count || 0}
            </Text>
            <Text style={styles.statLabel}>Takip</Text>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editButtonText}>Profili Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareButton}>
            <Text style={styles.shareButtonText}>🔗</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Travel Summary */}
      <View style={styles.travelStats}>
        <View style={styles.travelStat}>
          <Text style={styles.travelStatValue}>
            {Object.keys(userData?.preferences_vector || {}).length}
          </Text>
          <Text style={styles.travelStatLabel}>İlgi Alanı</Text>
        </View>
        <View style={styles.travelStatDivider} />
        <View style={styles.travelStat}>
          <Text style={styles.travelStatValue}>0</Text>
          <Text style={styles.travelStatLabel}>Şehir</Text>
        </View>
        <View style={styles.travelStatDivider} />
        <View style={styles.travelStat}>
          <Text style={styles.travelStatValue}>0 km</Text>
          <Text style={styles.travelStatLabel}>Mesafe</Text>
        </View>
      </View>

      {/* Tabs & Logout remain the same... */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive
              ]}
            >
              {tab === "GÖNDERILER" ? "⊞" : "🗺️"} {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.contentArea}>
        <Text style={styles.emptyStateText}>
          Henüz {activeTab.toLowerCase()} bulunmuyor.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={isLoggingOut}
      >
        <Text style={styles.logoutText}>
          {isLoggingOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ... (Styles from previous response)
  container: { flex: 1, backgroundColor: "#fff" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "flex-end", padding: 16 },
  settingsButton: { padding: 4 },
  settingsIcon: { fontSize: 22 },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#1a1a2e"
  },
  name: { fontSize: 20, fontWeight: "bold", color: "#1a1a2e", marginBottom: 2 },
  username: { fontSize: 14, color: "#888", marginBottom: 8 },
  bio: { fontSize: 14, color: "#555", textAlign: "center", marginBottom: 16 },
  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  stat: { alignItems: "center", paddingHorizontal: 24 },
  statValue: { fontSize: 20, fontWeight: "bold", color: "#1a1a2e" },
  statLabel: { fontSize: 12, color: "#888", marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: "#eee" },
  actionButtons: { flexDirection: "row", gap: 8, width: "100%" },
  editButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#1a1a2e",
    borderRadius: 10,
    padding: 10,
    alignItems: "center"
  },
  editButtonText: { fontSize: 14, fontWeight: "600", color: "#1a1a2e" },
  shareButton: {
    borderWidth: 1.5,
    borderColor: "#1a1a2e",
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 14
  },
  shareButtonText: { fontSize: 16 },
  travelStats: {
    flexDirection: "row",
    margin: 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20
  },
  travelStat: { flex: 1, alignItems: "center" },
  travelStatValue: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  travelStatLabel: { fontSize: 11, color: "#aaa", marginTop: 2 },
  travelStatDivider: { width: 1, backgroundColor: "#333" },
  tabsContainer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#eee"
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#1a1a2e" },
  tabText: { fontSize: 13, color: "#888", fontWeight: "500" },
  tabTextActive: { color: "#1a1a2e", fontWeight: "700" },
  contentArea: { padding: 40, alignItems: "center" },
  emptyStateText: { color: "#aaa", fontSize: 14 },
  logoutButton: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e74c3c",
    alignItems: "center",
    marginBottom: 32
  },
  logoutText: { fontSize: 15, fontWeight: "600", color: "#e74c3c" }
});
