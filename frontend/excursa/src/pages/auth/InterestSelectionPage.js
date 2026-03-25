import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Animated,
  StatusBar
} from "react-native";
import * as Haptics from "expo-haptics";
import AuthManager from "../../services/AuthManager";
import useAuthStore from "../../store/authStore";

const { width } = Dimensions.get("window");

const CATEGORY_ASSETS = {
  MUSEUM: { icon: "🏛️", color: "#E8F1FF", label: "Müzeler" },
  PARK: { icon: "🌳", color: "#E8F5E9", label: "Doğa" },
  RESTAURANT: { icon: "🍴", color: "#FFF3E0", label: "Gurme" },
  CAFE: { icon: "☕", color: "#EFEBE9", label: "Kahve" },
  HISTORIC: { icon: "🏰", color: "#F3E5F5", label: "Tarih" },
  BEACH: { icon: "🏖️", color: "#E0F7FA", label: "Deniz" },
  NIGHTLIFE: { icon: "✨", color: "#EDE7F6", label: "Eğlence" },
  SHOPPING: { icon: "🛍️", color: "#FCE4EC", label: "Alışveriş" },
  DEFAULT: { icon: "📍", color: "#F5F5F5", label: "Diğer" }
};

export default function InterestSelectionScreen({ navigation }) {
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Animasyon Değerleri
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    fetchInterests();
  }, []);

  // İlerleme çubuğu animasyonu
  useEffect(() => {
    const progress = Math.min(selectedTagIds.size / 3, 1);
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false
    }).start();
  }, [selectedTagIds]);

  const fetchInterests = async () => {
    try {
      const interests = await AuthManager.fetchAvailableInterests();
      setAvailableTags(interests);
      // Veri gelince içeriği soldan sağa/aşağıdan yukarıya uçur
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true
      }).start();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleInterest = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newSelected = new Set(selectedTagIds);
    newSelected.has(id) ? newSelected.delete(id) : newSelected.add(id);
    setSelectedTagIds(newSelected);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* İlerleme Çubuğu */}
      <View style={styles.progressBarBackground}>
        <Animated.View
          style={[
            styles.progressBarFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"]
              })
            }
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.title}>İlgi alanlarını seç</Text>
          <Text style={styles.subtitle}>
            Sana en uygun deneyimi hazırlamamız için{" "}
            <Text style={styles.highlight}>en az 3 kategori</Text> seçmelisin.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.grid, { opacity: fadeAnim }]}>
          {availableTags.map((tag, index) => {
            const isSelected = selectedTagIds.has(tag.id);
            const asset = CATEGORY_ASSETS[tag.name] || CATEGORY_ASSETS.DEFAULT;

            return (
              <TouchableOpacity
                key={tag.id}
                activeOpacity={0.8}
                onPress={() => toggleInterest(tag.id)}
                style={[
                  styles.card,
                  { backgroundColor: isSelected ? "#1a1a2e" : "#fff" },
                  isSelected && styles.cardSelected
                ]}
              >
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: isSelected
                        ? "rgba(255,255,255,0.2)"
                        : asset.color
                    }
                  ]}
                >
                  <Text style={styles.cardIcon}>{asset.icon}</Text>
                </View>
                <Text
                  style={[
                    styles.cardText,
                    isSelected && styles.cardTextSelected
                  ]}
                >
                  {tag.title}
                </Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <Text style={styles.counterText}>
            {selectedTagIds.size < 3
              ? `${3 - selectedTagIds.size} tane daha seç`
              : "Harika seçim!"}
          </Text>

          <TouchableOpacity
            style={[
              styles.nextButton,
              selectedTagIds.size < 3 && styles.buttonDisabled
            ]}
            disabled={selectedTagIds.size < 3}
            onPress={() =>
              setAuth(AuthManager.userProfile, AuthManager.accessToken)
            }
          >
            <Text style={styles.nextButtonText}>Devam Et</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FB" },
  progressBarBackground: {
    height: 6,
    backgroundColor: "#E0E0E0",
    width: "100%"
  },
  progressBarFill: { height: 6, backgroundColor: "#4CAF50" },
  scrollContent: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 120 },
  header: { marginBottom: 40 },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: "#1a1a2e",
    letterSpacing: -1
  },
  subtitle: { fontSize: 17, color: "#666", marginTop: 12, lineHeight: 24 },
  highlight: { color: "#1a1a2e", fontWeight: "700" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  card: {
    width: (width - 64) / 2,
    height: 160,
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    backgroundColor: "#fff",
    alignItems: "flex-start",
    justifyContent: "space-between",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F0F0F0"
  },
  cardSelected: {
    borderColor: "#1a1a2e",
    transform: [{ scale: 0.98 }]
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center"
  },
  cardIcon: { fontSize: 26 },
  cardText: { fontSize: 17, fontWeight: "700", color: "#1a1a2e" },
  cardTextSelected: { color: "#fff" },
  checkBadge: {
    position: "absolute",
    top: 15,
    right: 15,
    backgroundColor: "#4CAF50",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center"
  },
  checkText: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    padding: 24,
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 20
  },
  footerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  counterText: { fontSize: 15, fontWeight: "600", color: "#666" },
  nextButton: {
    backgroundColor: "#1a1a2e",
    paddingHorizontal: 35,
    paddingVertical: 18,
    borderRadius: 20
  },
  nextButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  buttonDisabled: { backgroundColor: "#E0E0E0" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" }
});
