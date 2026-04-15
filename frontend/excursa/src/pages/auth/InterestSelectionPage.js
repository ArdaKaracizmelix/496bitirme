import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Platform
} from 'react-native';
import AuthManager from '../../services/AuthManager';
import useAuthStore from '../../store/authStore';

/**
 * InterestSelectionScreen
 * Allows users to select their interest categories/tags during onboarding
 */
export default function InterestSelectionScreen({ route, navigation }) {
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [healthData, setHealthData] = useState(null);
  const [healthError, setHealthError] = useState('');
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const isEditMode = route?.params?.mode === 'edit';

  /**
   * Fetch available interest tags from backend on component mount
   */
  useEffect(() => {
    fetchInterests();
    if (isEditMode) {
      fetchHealth();
    }
  }, []);

  /**
   * Fetches the list of available interest categories from the backend
   */
  const fetchInterests = async () => {
    setIsLoading(true);
    setError('');
    try {
      const interests = await AuthManager.fetchAvailableInterests();
      setAvailableTags(interests);

      if (isEditMode) {
        const existingInterests = AuthManager.userProfile?.interests || [];
        const existingNames = new Set(
          existingInterests.map((item) => {
            if (typeof item === 'string') return item.toUpperCase();
            if (item?.name) return String(item.name).toUpperCase();
            return '';
          }).filter(Boolean)
        );
        const presetIds = interests
          .filter((tag) => existingNames.has(String(tag.name || '').toUpperCase()))
          .map((tag) => tag.id);
        setSelectedTagIds(new Set(presetIds));
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'İlgi alanları yüklenemedi. Lütfen tekrar dene.';
      setError(errorMsg);
      console.error('Failed to fetch interests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHealth = async () => {
    setIsHealthLoading(true);
    setHealthError('');
    try {
      const health = await AuthManager.fetchInterestSourceHealth();
      setHealthData(health);
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Health verisi alınamadı.';
      setHealthError(msg);
    } finally {
      setIsHealthLoading(false);
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
      setError('Lütfen en az bir ilgi alanı seçin.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await AuthManager.submitInterestPreferences(Array.from(selectedTagIds));
      
      // Update auth store with user info from AuthManager
      const userProfile = AuthManager.userProfile;
      const token = AuthManager.accessToken;
      
      setAuth(userProfile, token);
      if (isEditMode) {
        navigation.goBack();
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Tercihler kaydedilemedi. Lütfen tekrar dene.';
      setError(errorMsg);
      console.error('Failed to submit preferences:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text style={styles.loadingText}>İlgi alanları yükleniyor...</Text>
        </View>
      </View>
    );
  }

  // Render tags in a grid format
  const renderTagGrid = () => {
    const rows = [];
    for (let i = 0; i < availableTags.length; i += 2) {
      const rowTags = availableTags.slice(i, i + 2);
      rows.push(
        <View key={i} style={styles.tagRow}>
          {rowTags.map((tag) => (
            <TouchableOpacity
              key={tag.id}
              style={[
                styles.tagButton,
                selectedTagIds.has(tag.id) && styles.tagButtonSelected,
              ]}
              onPress={() => toggleInterest(tag.id)}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.tagText,
                  selectedTagIds.has(tag.id) && styles.tagTextSelected,
                ]}
              >
                {tag.title || tag.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    return rows;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
      >
        <Text style={styles.title}>İlgi Alanlarını Seç</Text>
        <Text style={styles.subtitle}>
          {isEditMode
            ? 'İlgi alanlarını güncelle'
            : 'Seyahatini kişiselleştirmek için ilgi alanlarını seçin'}
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {isEditMode ? (
          <View style={styles.debugCard}>
            <View style={styles.debugHeader}>
              <Text style={styles.debugTitle}>Interest Source Debug</Text>
              <TouchableOpacity
                style={styles.debugRefresh}
                onPress={fetchHealth}
                disabled={isHealthLoading}
              >
                <Text style={styles.debugRefreshText}>
                  {isHealthLoading ? 'Yükleniyor...' : 'Yenile'}
                </Text>
              </TouchableOpacity>
            </View>
            {healthError ? <Text style={styles.debugError}>{healthError}</Text> : null}
            {healthData ? (
              <Text style={styles.debugText}>{JSON.stringify(healthData, null, 2)}</Text>
            ) : (
              <Text style={styles.debugText}>No data</Text>
            )}
          </View>
        ) : null}

        <View style={styles.tagsContainer}>
          {renderTagGrid()}
        </View>

        <Text style={styles.selectionInfo}>
          {selectedTagIds.size > 0
            ? `${selectedTagIds.size} ilgi alanı seçildi`
            : 'Lütfen en az bir ilgi alanı seçin'}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (isSubmitting || selectedTagIds.size === 0) && styles.buttonDisabled,
          ]}
          onPress={submitPreferences}
          disabled={isSubmitting || selectedTagIds.size === 0}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>{isEditMode ? 'Kaydet' : 'Devam Et'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    height: Platform.OS === 'web' ? '100vh' : '100%',
    maxHeight: Platform.OS === 'web' ? '100vh' : '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    flexGrow: 1,
  },
  tagsContainer: {
    marginVertical: 16,
    width: '100%',
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    lineHeight: 22,
  },
  errorContainer: {
    width: '100%',
    backgroundColor: '#ffe6e6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#cc0000',
  },
  errorText: {
    color: '#cc0000',
    fontSize: 14,
  },
  debugCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 10,
    backgroundColor: '#fafafa',
    padding: 12,
    marginBottom: 20,
  },
  debugHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  debugTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#222',
  },
  debugRefresh: {
    borderWidth: 1,
    borderColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debugRefreshText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: '600',
  },
  debugText: {
    fontSize: 11,
    color: '#333',
    lineHeight: 16,
  },
  debugError: {
    fontSize: 12,
    color: '#cc0000',
    marginBottom: 6,
  },
  tagButton: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    marginHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagButtonSelected: {
    borderColor: '#1a1a2e',
    backgroundColor: '#1a1a2e',
  },
  tagText: {
    fontSize: 16,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  tagTextSelected: {
    color: '#fff',
  },
  selectionInfo: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    width: '100%',
  },
  submitButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});
