import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import locationService from '../../services/locationService';
import { getCategoryColor, getCategoryName } from '../../utils/mapUtils';

/**
 * POIDetailScreen - Comprehensive detail view for a Point of Interest
 * Displays full information, reviews, gallery, and interactions
 */
export default function POIDetailScreen({ route, navigation }) {
  const { poiId } = route.params;
  const insets = useSafeAreaInsets();

  // State
  const [details, setDetails] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [userRating, setUserRating] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Interaction state
  const [isFavorited, setIsFavorited] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [addToItineraryModalVisible, setAddToItineraryModalVisible] = useState(false);
  const [selectedItinerary, setSelectedItinerary] = useState(null);
  const [itineraries, setItineraries] = useState([]);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [submittingReview, setSubmittingReview] = useState(false);

  /**
   * Fetch POI details on mount
   */
  useEffect(() => {
    fetchPOIDetails();
  }, [poiId]);

  /**
   * Fetch POI details and reviews
   */
  const fetchPOIDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch POI details
      const poiDetails = await locationService.fetchPOIDetails(poiId);
      setDetails(poiDetails);

      // Fetch reviews
      const reviewsData = await locationService.fetchPOIReviews(poiId);
      setReviews(reviewsData.results || []);

      // Mock gallery images from metadata
      if (poiDetails.metadata?.images) {
        setGalleryImages(poiDetails.metadata.images);
      }

      // Check favorite status
      const favorited = await locationService.isFavorited(poiId);
      setIsFavorited(favorited);

      // Fetch itineraries for "add to itinerary"
      const itinerariesData = await locationService.fetchUserItineraries();
      const editableItineraries = (itinerariesData.results || []).filter(
        (itinerary) => itinerary.status === 'DRAFT' || itinerary.status === 'ACTIVE'
      );
      setItineraries(editableItineraries);
    } catch (err) {
      console.error('Error fetching POI details:', err);
      setError('Failed to load details');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Open navigation app with destination coordinates
   */
  const openNavigationApp = () => {
    if (!details) return;

    const scheme = Platform.select({
      ios: 'maps:0,0?q=',
      android: 'geo:0,0?q=',
    });
    const latLng = `${details.latitude},${details.longitude}`;
    const label = details.name;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
    });

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        return Linking.openURL(url);
      } else {
        Alert.alert('Harita uygulaması bulunamadı');
      }
    });
  };

  /**
   * Toggle favorite status
   */
  const toggleFavorite = async () => {
    try {
      await locationService.toggleFavorite(poiId);
      setIsFavorited(!isFavorited);
    } catch (err) {
      Alert.alert('Hata', 'Favori durumu güncellenemedi');
    }
  };

  /**
   * Submit review
   */
  const submitReview = async () => {
    try {
      setSubmittingReview(true);
      await locationService.submitReview(poiId, reviewRating, reviewText);
      
      // Reset form and close modal
      setReviewText('');
      setReviewRating(5);
      setReviewModalVisible(false);
      
      // Refresh reviews
      await fetchPOIDetails();
      Alert.alert('Başarılı', 'Yorum başarıyla gönderildi');
    } catch (err) {
      Alert.alert('Hata', 'Yorum gönderilemedi');
    } finally {
      setSubmittingReview(false);
    }
  };

  /**
   * Add to itinerary
   */
  const addToItinerary = async () => {
    if (!selectedItinerary) {
      Alert.alert('Hata', 'Lütfen bir tur seçin');
      return;
    }

    try {
      // Use list serializer's total_stops when stops array is not available.
      // order_index is zero-based, so next index equals current stop count.
      const existingStops = selectedItinerary.total_stops ?? selectedItinerary.stops?.length ?? 0;
      const nextOrder = existingStops;
      
      await locationService.addPOIToItinerary(
        selectedItinerary.id,
        poiId,
        nextOrder
      );

      Alert.alert('Başarılı', 'Yer tura eklendi');
      setAddToItineraryModalVisible(false);
      setSelectedItinerary(null);
    } catch (err) {
      Alert.alert('Hata', 'Yer tura eklenemedi');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !details) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Yer bilgisi bulunamadı'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchPOIDetails}
          >
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, insets.top > 0 && styles.headerInset]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{details.name}</Text>
        <TouchableOpacity onPress={toggleFavorite}>
          <Text style={styles.favoriteButton}>{isFavorited ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Category Badge */}
        <View style={styles.section}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: getCategoryColor(details.category) },
            ]}
          >
            <Text style={styles.categoryBadgeText}>
              {getCategoryName(details.category)}
            </Text>
          </View>
        </View>

        {/* Gallery */}
        {galleryImages.length > 0 && (
          <View style={styles.gallerySection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.gallery}
            >
              {galleryImages.map((image, index) => (
                <View key={index} style={styles.galleryItem}>
                  {image.startsWith('http') ? (
                    <Image
                      source={{ uri: image }}
                      style={styles.galleryImage}
                      onError={() => {
                        // Fallback for broken images
                      }}
                    />
                  ) : (
                    <View style={[styles.galleryImage, styles.placeholderImage]}>
                      <Text style={styles.placeholderText}>📷</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Basic Info */}
        <View style={styles.section}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>⭐ Rating</Text>
            <Text style={styles.infoValue}>
              {details.average_rating?.toFixed(1)}/5.0 ({reviews.length} reviews)
            </Text>
          </View>

          {details.address && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>📬 Address</Text>
              <Text style={styles.infoValue}>{details.address}</Text>
            </View>
          )}

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>📍 Coordinates</Text>
            <Text style={styles.infoValue}>
              {details.latitude?.toFixed(4)}, {details.longitude?.toFixed(4)}
            </Text>
          </View>
        </View>

        {/* Description/Metadata */}
        {details.metadata?.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Açıklama</Text>
            <Text style={styles.description}>{details.metadata.description}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={openNavigationApp}
          >
            <Text style={styles.actionButtonText}>Yol Tarifi Al</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => setAddToItineraryModalVisible(true)}
          >
            <Text style={styles.actionButtonTextSecondary}>Tura Ekle</Text>
          </TouchableOpacity>
        </View>

        {/* Reviews Section */}
        <View style={styles.section}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>Yorumlar</Text>
            <TouchableOpacity
              style={styles.addReviewButton}
              onPress={() => setReviewModalVisible(true)}
            >
              <Text style={styles.addReviewButtonText}>+ Yorum Ekle</Text>
            </TouchableOpacity>
          </View>

          {reviews.length === 0 ? (
            <Text style={styles.noReviewsText}>Henüz yorum yok</Text>
          ) : (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>
                    {review.user?.user?.first_name || 'Anonymous'}
                  </Text>
                  <Text style={styles.reviewRating}>⭐ {review.rating}/5</Text>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                )}
                <Text style={styles.reviewDate}>
                  {new Date(review.created_at).toLocaleDateString('tr-TR')}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Spacing for scroll */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Review Modal */}
      <Modal
        visible={reviewModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yorum Ekle</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.ratingSelector}>
              <Text style={styles.ratingLabel}>Rating</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setReviewRating(star)}
                  >
                    <Text
                      style={[
                        styles.star,
                        star <= reviewRating && styles.starSelected,
                      ]}
                    >
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TextInput
              style={styles.reviewInput}
              placeholder="Yorumunuzu yazın..."
              multiline
              numberOfLines={4}
              value={reviewText}
              onChangeText={setReviewText}
            />

            <TouchableOpacity
              style={[
                styles.submitButton,
                submittingReview && styles.submitButtonDisabled,
              ]}
              onPress={submitReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Gönder</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add to Itinerary Modal */}
      <Modal
        visible={addToItineraryModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tura Ekle</Text>
              <TouchableOpacity
                onPress={() => setAddToItineraryModalVisible(false)}
              >
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {itineraries.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Henüz tur oluşturmadınız
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.itineraryList}>
                {itineraries.map((itinerary) => (
                  <TouchableOpacity
                    key={itinerary.id}
                    style={[
                      styles.itineraryOption,
                      selectedItinerary?.id === itinerary.id &&
                        styles.itineraryOptionSelected,
                    ]}
                    onPress={() => setSelectedItinerary(itinerary)}
                  >
                    <View>
                      <Text style={styles.itineraryTitle}>
                        {itinerary.title}
                      </Text>
                      <Text style={styles.itineraryDate}>
                        {new Date(itinerary.start_date).toLocaleDateString(
                          'tr-TR'
                        )}
                      </Text>
                    </View>
                    {selectedItinerary?.id === itinerary.id && (
                      <Text style={styles.selectedCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                !selectedItinerary && styles.submitButtonDisabled,
              ]}
              onPress={addToItinerary}
              disabled={!selectedItinerary}
            >
              <Text style={styles.submitButtonText}>Ekle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  headerInset: {
    paddingTop: 12,
  },
  backButton: {
    fontSize: 16,
    color: '#3498db',
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginHorizontal: 12,
  },
  favoriteButton: {
    fontSize: 20,
  },
  content: {
    flex: 1,
    paddingVertical: 12,
  },
  section: {
    backgroundColor: '#fff',
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  gallerySection: {
    marginVertical: 8,
  },
  gallery: {
    paddingHorizontal: 16,
  },
  galleryItem: {
    marginRight: 12,
  },
  galleryImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#ecf0f1',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 40,
  },
  infoItem: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#2c3e50',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#34495e',
    lineHeight: 20,
  },
  actionButtonsContainer: {
    paddingHorizontal: 16,
    marginVertical: 12,
    gap: 10,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3498db',
  },
  secondaryButton: {
    backgroundColor: '#ecf0f1',
    borderWidth: 1,
    borderColor: '#3498db',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionButtonTextSecondary: {
    color: '#3498db',
    fontWeight: '600',
    fontSize: 14,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addReviewButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8f4f8',
    borderRadius: 16,
  },
  addReviewButtonText: {
    color: '#3498db',
    fontSize: 12,
    fontWeight: '600',
  },
  noReviewsText: {
    color: '#95a5a6',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 16,
  },
  reviewItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reviewerName: {
    fontWeight: '600',
    color: '#2c3e50',
    fontSize: 13,
  },
  reviewRating: {
    fontSize: 12,
    color: '#f39c12',
  },
  reviewComment: {
    color: '#34495e',
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
  reviewDate: {
    color: '#95a5a6',
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3498db',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: 'auto',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#95a5a6',
  },
  ratingSelector: {
    marginVertical: 16,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 12,
  },
  star: {
    fontSize: 32,
    color: '#bdc3c7',
  },
  starSelected: {
    color: '#f39c12',
  },
  reviewInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginVertical: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#3498db',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 12,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#95a5a6',
    fontSize: 14,
  },
  itineraryList: {
    maxHeight: 300,
    marginVertical: 16,
  },
  itineraryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  itineraryOptionSelected: {
    backgroundColor: '#e8f4f8',
    borderWidth: 1,
    borderColor: '#3498db',
  },
  itineraryTitle: {
    fontWeight: '600',
    color: '#2c3e50',
    fontSize: 14,
  },
  itineraryDate: {
    color: '#95a5a6',
    fontSize: 12,
    marginTop: 4,
  },
  selectedCheck: {
    color: '#27ae60',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
