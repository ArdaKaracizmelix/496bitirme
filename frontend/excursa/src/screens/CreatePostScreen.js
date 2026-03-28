import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCreatePost, useGetPresignedUrl, useUploadToS3 } from '../hooks/useSocial';
import useAuthStore from '../store/authStore';

/**
 * CreatePostScreen Component
 * Allows users to compose a new social post with media, location, and visibility settings
 */
export default function CreatePostScreen({ route }) {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const createPostMutation = useCreatePost();
  const presignedUrlMutation = useGetPresignedUrl();
  const uploadToS3Mutation = useUploadToS3();

  // Form state
  const [caption, setCaption] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [taggedLocation, setTaggedLocation] = useState(null);
  const [visibility, setVisibility] = useState('PUBLIC');
  const [tags, setTags] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showVisibilityOptions, setShowVisibilityOptions] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');

  const visibilityOptions = [
    { label: 'Herkese Açık', value: 'PUBLIC', icon: '🌍' },
    { label: 'Sadece Takipçiler', value: 'FOLLOWERS', icon: '👥' },
    { label: 'Özel', value: 'PRIVATE', icon: '🔒' },
  ];

  const showImagePickerUnavailable = () => {
    Alert.alert(
      'Özellik Geçici Olarak Kullanılamıyor',
      'Medya seçimi için gerekli paket (expo-image-picker) bu kurulumda bulunamadı.'
    );
  };

  /**
   * Handle media selection from device gallery
   */
  const handlePickMedia = async () => {
    showImagePickerUnavailable();
  };

  /**
   * Handle capturing photo with camera
   */
  const handleTakePhoto = async () => {
    showImagePickerUnavailable();
  };

  /**
   * Remove media item from selected list
   */
  const handleRemoveMedia = (index) => {
    setSelectedMedia(selectedMedia.filter((_, i) => i !== index));
  };

  /**
   * Handle location tagging
   */
  const handleTagLocation = async () => {
    // In a real app, this would search for POIs from the locations API
    // For now, show a simple search modal
    setShowLocationSearch(true);
  };

  /**
   * Search for locations (mock implementation)
   */
  const handleLocationSearch = async (query) => {
    // TODO: Implement actual location search using locations API
    setLocationSearch(query);
  };

  /**
   * Handle form submission
   */
  const handleSubmitPost = async () => {
    // Validate input
    if (!caption.trim() && selectedMedia.length === 0) {
      Alert.alert('Hata', 'Lütfen en az bir yazı veya medya ekleyin');
      return;
    }

    if (caption.length > 5000) {
      Alert.alert('Hata', 'Yazı 5000 karakteri aşamaz');
      return;
    }

    setIsLoading(true);

    try {
      // Upload media to S3
      const mediaUrls = [];

      for (const media of selectedMedia) {
        try {
          // Get presigned URL
          const fileExtension = media.fileName?.split('.').pop() || 'jpg';
          const contentType =
            media.type === 'video' ? `video/${fileExtension}` : `image/${fileExtension}`;

          const presignedData = await presignedUrlMutation.mutateAsync({
            filename: media.fileName,
            contentType,
          });

          // Upload file to S3
          const fileBlob = await fetch(media.uri).then((r) => r.blob());
          await uploadToS3Mutation.mutateAsync({
            presignedUrl: presignedData.presigned_url,
            fileData: fileBlob,
            contentType,
          });

          mediaUrls.push(presignedData.file_url);
        } catch (error) {
          console.error('Error uploading media:', error);
          throw new Error('Medya yüklenirken hata oluştu');
        }
      }

      // Create post
      const postData = {
        content: caption,
        media_urls: mediaUrls,
        location: taggedLocation?.name || null,
        visibility,
        tags,
      };

      await createPostMutation.mutateAsync(postData);
      navigation.navigate('CommunityFeed');
      Alert.alert('Başarılı', 'Gönderiniz paylaşıldı!');
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Hata', error.message || 'Gönderi oluşturularken bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButton}>İptal</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yeni Gönderi</Text>
        <TouchableOpacity
          style={[styles.shareButton, isLoading && styles.shareButtonDisabled]}
          onPress={handleSubmitPost}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.shareButtonText}>Paylaş</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Info */}
        <View style={styles.userSection}>
          <Image source={{ uri: user?.avatar_url }} style={styles.userAvatar} />
          <View>
            <Text style={styles.userName}>{user?.full_name}</Text>
            <Text style={styles.visibilityLabel}>{visibility}</Text>
          </View>
          <TouchableOpacity
            style={styles.visibilitySelector}
            onPress={() => setShowVisibilityOptions(true)}
          >
            <Text style={styles.selectorIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Caption Input */}
        <TextInput
          style={styles.captionInput}
          placeholder="Deneyimini paylaş..."
          placeholderTextColor="#999"
          multiline
          value={caption}
          onChangeText={setCaption}
          maxLength={5000}
        />
        <Text style={styles.characterCount}>{caption.length}/5000</Text>

        {/* Selected Media Display */}
        {selectedMedia.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={styles.sectionTitle}>Seçilen Medya ({selectedMedia.length})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mediaList}
            >
              {selectedMedia.map((media, index) => (
                <View key={index} style={styles.mediaItem}>
                  <Image source={{ uri: media.uri }} style={styles.mediaPreview} />
                  <TouchableOpacity
                    style={styles.removeMediaButton}
                    onPress={() => handleRemoveMedia(index)}
                  >
                    <Text style={styles.removeMediaIcon}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Media Selection Buttons */}
        <View style={styles.mediaButtons}>
          <TouchableOpacity style={styles.mediaButton} onPress={handlePickMedia}>
            <Text style={styles.mediaButtonIcon}>🖼️</Text>
            <Text style={styles.mediaButtonText}>Galeri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaButton} onPress={handleTakePhoto}>
            <Text style={styles.mediaButtonIcon}>📷</Text>
            <Text style={styles.mediaButtonText}>Kamera</Text>
          </TouchableOpacity>
        </View>

        {/* Location Section */}
        <View style={styles.optionSection}>
          <TouchableOpacity
            style={styles.optionButton}
            onPress={handleTagLocation}
          >
            <Text style={styles.optionIcon}>📍</Text>
            <Text style={styles.optionText}>
              {taggedLocation ? taggedLocation.name : 'Yer Etiketle'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tags Section */}
        <View style={styles.optionSection}>
          <TextInput
            style={styles.tagsInput}
            placeholder="Etiketler ekle (virgülle ayırın)"
            placeholderTextColor="#999"
            onChangeText={(text) => {
              const tagArray = text.split(',').map((tag) => tag.trim());
              setTags(tagArray.filter((tag) => tag.length > 0));
            }}
          />
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsDisplay}>
            {tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Visibility Options Modal */}
      <Modal
        visible={showVisibilityOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowVisibilityOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.visibilityModal}>
            <Text style={styles.modalTitle}>Gönderinizi Kimler Görebilir?</Text>
            {visibilityOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.visibilityOption,
                  visibility === option.value && styles.visibilityOptionSelected,
                ]}
                onPress={() => {
                  setVisibility(option.value);
                  setShowVisibilityOptions(false);
                }}
              >
                <Text style={styles.visibilityOptionIcon}>{option.icon}</Text>
                <View style={styles.visibilityOptionContent}>
                  <Text style={styles.visibilityOptionLabel}>{option.label}</Text>
                </View>
                {visibility === option.value && (
                  <Text style={styles.selectedCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowVisibilityOptions(false)}
            >
              <Text style={styles.closeButtonText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  cancelButton: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  shareButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  visibilityLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  visibilitySelector: {
    marginLeft: 'auto',
    padding: 8,
  },
  selectorIcon: {
    fontSize: 18,
  },
  captionInput: {
    fontSize: 16,
    color: '#1a1a2e',
    textAlignVertical: 'top',
    marginBottom: 4,
    minHeight: 120,
    paddingVertical: 0,
  },
  characterCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginBottom: 16,
  },
  mediaSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  mediaList: {
    marginBottom: 12,
  },
  mediaItem: {
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaPreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeMediaButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeMediaIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mediaButtons: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  mediaButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  mediaButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  mediaButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  optionSection: {
    marginBottom: 16,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 8,
  },
  optionIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  optionText: {
    fontSize: 14,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  tagsInput: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 8,
    fontSize: 14,
    color: '#1a1a2e',
  },
  tagsDisplay: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  tagText: {
    fontSize: 12,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  visibilityModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  visibilityOptionSelected: {
    backgroundColor: '#f5f5f5',
    borderColor: '#1a1a2e',
  },
  visibilityOptionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  visibilityOptionContent: {
    flex: 1,
  },
  visibilityOptionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a2e',
  },
  selectedCheckmark: {
    fontSize: 18,
    color: '#1a1a2e',
    fontWeight: 'bold',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 12,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    textAlign: 'center',
  },
});
