import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Pressable,
  ScrollView
} from "react-native";
import AuthManager from "../../services/AuthManager";
import useAuthStore from "../../store/authStore";

/**
 * InterestSelectionScreen
 * Allows users to select their interest categories/tags during onboarding
 */
export default function InterestSelectionScreen({ navigation, route }) {
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const setAuth = useAuthStore((state) => state.setAuth);

  const user = route.params?.user;

  /**
   * Fetch available interest tags from backend on component mount
   */
  useEffect(() => {
    fetchInterests();
  }, []);

  /**
   * Fetches the list of available interest categories from the backend
   */
  const fetchInterests = async () => {
    setIsLoading(true);
    setError("");
    try {
      const interests = await AuthManager.fetchAvailableInterests();
      setAvailableTags(interests);
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "İlgi alanları yüklenemedi. Lütfen tekrar dene.";
      setError(errorMsg);
      console.error("Failed to fetch interests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Toggles the selection state of an interest tag
   */
  const toggleInterest = (id) => {
    const newSelected = new Set(selectedTagIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTagIds(newSelected);
  };

  /**
   * Submits the selected interests to the backend and navigates to main app
   */
  const submitPreferences = async () => {
    if (selectedTagIds.size === 0) {
      setError("Lütfen en az bir ilgi alanı seçin.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await AuthManager.submitInterestPreferences(Array.from(selectedTagIds));

      // Update auth store with user info from AuthManager
      const userProfile = AuthManager.userProfile;
      const token = AuthManager.accessToken;

      setAuth(userProfile, token);

      // Navigation will be handled by AppNavigator when isAuthenticated changes
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Tercihler kaydedilemedi. Lütfen tekrar dene.";
      setError(errorMsg);
      console.error("Failed to submit preferences:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Skip interest selection and proceed to main app
   */
  const skipSelection = () => {
    // Update auth store with user info
    const userProfile = AuthManager.userProfile;
    const token = AuthManager.accessToken;

    setAuth(userProfile, token);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text style={styles.loadingText}>İlgi alanları yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>İlgi Alanlarını Seç</Text>
        <Text style={styles.subtitle}>
          Soyahatini kişiselleştirmek için ilgi alanlarını seçin
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Interest Tags Grid */}
        <View style={styles.tagsContainer}>
          {availableTags.map((tag) => (
            <TouchableOpacity
              key={tag.id}
              style={[
                styles.tagButton,
                selectedTagIds.has(tag.id) && styles.tagButtonSelected
              ]}
              onPress={() => toggleInterest(tag.id)}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.tagText,
                  selectedTagIds.has(tag.id) && styles.tagTextSelected
                ]}
              >
                {tag.name || tag.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected Count */}
        <Text style={styles.selectionInfo}>
          {selectedTagIds.size > 0
            ? `${selectedTagIds.size} ilgi alanı seçildi`
            : "Lütfen en az bir ilgi alanı seçin"}
        </Text>
      </ScrollView>

      {/* Footer Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.skipButton, isSubmitting && styles.buttonDisabled]}
          onPress={skipSelection}
          disabled={isSubmitting}
        >
          <Text style={styles.skipButtonText}>Atla</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.submitButton,
            (isSubmitting || selectedTagIds.size === 0) && styles.buttonDisabled
          ]}
          onPress={submitPreferences}
          disabled={isSubmitting || selectedTagIds.size === 0}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Devam Et</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 120
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a2e",
    marginBottom: 12
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    lineHeight: 22
  },
  errorContainer: {
    width: "100%",
    backgroundColor: "#ffe6e6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#cc0000"
  },
  errorText: {
    color: "#cc0000",
    fontSize: 14
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20
  },
  tagButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
    marginBottom: 8
  },
  tagButtonSelected: {
    borderColor: "#1a1a2e",
    backgroundColor: "#1a1a2e"
  },
  tagText: {
    fontSize: 16,
    color: "#1a1a2e",
    fontWeight: "500"
  },
  tagTextSelected: {
    color: "#fff"
  },
  selectionInfo: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 24,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    gap: 12
  },
  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  skipButtonText: {
    color: "#1a1a2e",
    fontSize: 16,
    fontWeight: "600"
  },
  submitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666"
  }
});
