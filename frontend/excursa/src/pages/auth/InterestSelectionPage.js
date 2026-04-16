import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import InterestCard from '../../components/InterestCard';
import AuthManager from '../../services/AuthManager';
import useAuthStore from '../../store/authStore';

const MAX_SELECTIONS = 10;

export default function InterestSelectionScreen({ route, navigation }) {
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { width } = useWindowDimensions();
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);
  const updateUser = useAuthStore((state) => state.updateUser);
  const isEditMode = route?.params?.mode === 'edit';

  const cardBasis = useMemo(() => {
    if (Platform.OS === 'web' && width >= 900) return '31%';
    if (width >= 620) return '48%';
    return '100%';
  }, [width]);

  useEffect(() => {
    fetchInterests();
  }, []);

  const fetchInterests = async () => {
    setIsLoading(true);
    setError('');
    setNotice('');
    try {
      const interests = await AuthManager.fetchAvailableInterests();
      const normalizedInterests = Array.isArray(interests) ? interests : [];
      setAvailableTags(normalizedInterests);

      if (isEditMode) {
        const existingInterests = AuthManager.userProfile?.interests || [];
        const existingNames = new Set(
          existingInterests
            .map((item) => {
              if (typeof item === 'string') return item.toLowerCase();
              if (item?.name) return String(item.name).toLowerCase();
              return '';
            })
            .filter(Boolean)
        );
        const presetIds = normalizedInterests
          .filter((tag) => existingNames.has(String(tag.name || tag.key || '').toLowerCase()))
          .map((tag) => tag.id);
        setSelectedTagIds(new Set(presetIds));
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Ilgi alanlari yuklenemedi. Baglantini kontrol edip tekrar dene.';
      setError(errorMsg);
      console.error('Failed to fetch interests:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleInterest = (id) => {
    setNotice('');
    setError('');

    setSelectedTagIds((current) => {
      const nextSelected = new Set(current);

      if (nextSelected.has(id)) {
        nextSelected.delete(id);
        return nextSelected;
      }

      if (nextSelected.size >= MAX_SELECTIONS) {
        setNotice(`En fazla ${MAX_SELECTIONS} ilgi alani secebilirsin.`);
        return nextSelected;
      }

      nextSelected.add(id);
      return nextSelected;
    });
  };

  const submitPreferences = async () => {
    if (selectedTagIds.size === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      const result = await AuthManager.submitInterestPreferences(Array.from(selectedTagIds));
      const updatedUser = result.user || {
        interests: result.preference_keys || [],
        has_interests: true,
      };

      if (isEditMode) {
        updateUser(updatedUser);
        setNotice('Ilgi alanlarin guncellendi.');
        navigation.goBack();
        return;
      }

      completeOnboarding(updatedUser);
    } catch (err) {
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Tercihler kaydedilemedi. Lutfen tekrar dene.';
      setError(errorMsg);
      console.error('Failed to submit preferences:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLoadingState = () => (
    <View style={styles.stateWrap}>
      <ActivityIndicator size="large" color="#1a1a2e" />
      <Text style={styles.stateTitle}>Ilgi alanlari hazirlaniyor</Text>
      <Text style={styles.stateText}>Sana uygun seyahat kategorilerini yukluyoruz.</Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.stateWrap}>
      <Text style={styles.stateTitle}>Liste su an bos gorunuyor</Text>
      <Text style={styles.stateText}>
        Backend katalog verisi donmedi. Migration calistiysa tekrar dene.
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={fetchInterests}>
        <Text style={styles.retryButtonText}>Tekrar dene</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>ONBOARDING</Text>
          </View>
          <Text style={styles.title}>Seyahat tarzini sec</Text>
          <Text style={styles.subtitle}>
            Sana daha iyi rota, mekan ve sosyal akis onermek icin ilgilerini belirleyelim.
          </Text>
          <Text style={styles.helperText}>Bunlari daha sonra profilinden degistirebilirsin.</Text>
        </View>

        <View style={styles.counterRow}>
          <Text style={styles.counterText}>
            {selectedTagIds.size}/{MAX_SELECTIONS} secildi
          </Text>
          <Text style={styles.counterHint}>
            En az 1 ilgi alani sec
          </Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {notice ? (
          <View style={styles.noticeContainer}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {isLoading ? renderLoadingState() : null}

        {!isLoading && availableTags.length === 0 ? renderEmptyState() : null}

        {!isLoading && availableTags.length > 0 ? (
          <View style={styles.grid}>
            {availableTags.map((tag) => {
              const selected = selectedTagIds.has(tag.id);
              const disabled = isSubmitting || (!selected && selectedTagIds.size >= MAX_SELECTIONS);
              return (
                <View key={tag.id} style={[styles.cardWrap, { flexBasis: cardBasis }]}>
                  <InterestCard
                    item={tag}
                    selected={selected}
                    disabled={disabled}
                    onPress={() => toggleInterest(tag.id)}
                  />
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (isSubmitting || selectedTagIds.size === 0) && styles.buttonDisabled,
          ]}
          onPress={submitPreferences}
          disabled={isSubmitting || selectedTagIds.size === 0}
          activeOpacity={0.9}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>
              {isEditMode ? 'Degisiklikleri Kaydet' : 'Devam Et'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 128,
    maxWidth: 1040,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    backgroundColor: '#1a1a2e',
    borderRadius: 30,
    padding: 24,
    marginBottom: 18,
    overflow: 'hidden',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: 'rgba(215,196,158,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
  },
  heroBadgeText: {
    color: '#d7c49e',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    color: '#fff',
    fontSize: 31,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#dedbea',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 620,
  },
  helperText: {
    color: '#d7c49e',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 16,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  counterText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '900',
  },
  counterHint: {
    color: '#786f61',
    fontSize: 13,
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: '#ffe6e6',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#cc0000',
  },
  errorText: {
    color: '#b30000',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeContainer: {
    backgroundColor: '#fff4d7',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#d9a321',
  },
  noticeText: {
    color: '#795b0c',
    fontSize: 14,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardWrap: {
    flexGrow: 1,
  },
  stateWrap: {
    minHeight: 260,
    borderRadius: 24,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e7dfd1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginTop: 10,
  },
  stateTitle: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  stateText: {
    color: '#786f61',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#f7f3ea',
    borderTopWidth: 1,
    borderTopColor: '#e5ddce',
  },
  submitButton: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingVertical: 17,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.52,
  },
});
