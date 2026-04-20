import React, { useEffect, useMemo, useState } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useCreatePost } from '../hooks/useSocial';
import useAuthStore from '../store/authStore';
import SocialService from '../services/SocialService';
import TripService from '../services/TripService';
import AppAvatar from '../components/AppAvatar';
import RouteShareCard from '../components/RouteShareCard';
import { buildRouteShareData } from '../utils/routeShareUtils';

const C = {
  ink: '#1a1a2e',
  text: '#2d3142',
  muted: '#7b8190',
  subtle: '#a2a8b5',
  line: '#e9edf3',
  panel: '#ffffff',
  page: '#f6f7fb',
  soft: '#f0f3f8',
  brandSoft: '#eef1f8',
  danger: '#d64545',
  success: '#188f62',
};

const MAX_MEDIA = 6;
const CAPTION_LIMIT = 5000;
const QUICK_LOCATIONS = ['İstanbul', 'Kapadokya', 'Izmir', 'Antalya', 'Bodrum'];
const VISIBILITY = [
  { label: 'Herkese Acik', value: 'PUBLIC', icon: 'W', hint: 'Topluluk akışinda görünür.' },
  { label: 'Takipçiler', value: 'FOLLOWERS', icon: 'F', hint: 'Sadece seni takip edenler görür.' },
  { label: 'Ozel', value: 'PRIVATE', icon: 'P', hint: 'Profilinde gizli kalir.' },
];

const normalizeTags = (value) =>
  value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean);

const errorMessage = (error) =>
  error?.response?.data?.detail ||
  error?.response?.data?.error ||
  error?.message ||
  'Gönderi olusturulurken bir hata oluştu.';

function Header({ canSubmit, submitting, onBack, onSubmit }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerGhost} onPress={onBack} disabled={submitting}>
        <Text style={styles.headerGhostText}>İptal</Text>
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>Yeni Gönderi</Text>
        <Text style={styles.headerSubtitle}>Anini toplulukla paylaş</Text>
      </View>
      <TouchableOpacity
        style={[styles.headerShare, (!canSubmit || submitting) && styles.headerShareDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.headerShareText}>Paylaş</Text>}
      </TouchableOpacity>
    </View>
  );
}

function Author({ user, visibility, onPress }) {
  const active = VISIBILITY.find((item) => item.value === visibility);
  const name = user?.full_name || user?.username || user?.email || 'Gezgin';
  const avatar = user?.avatar_url || null;

  return (
    <View style={styles.author}>
      <AppAvatar uri={avatar} style={styles.avatar} />
      <View style={styles.authorCopy}>
        <Text style={styles.authorName} numberOfLines={1}>{name}</Text>
        <TouchableOpacity style={styles.visibilityMini} onPress={onPress}>
          <Text style={styles.visibilityMiniText}>{active?.label || 'Gorunurluk'}</Text>
          <Text style={styles.chevron}>v</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CaptionCard({ caption, error, onChange }) {
  const countColor = CAPTION_LIMIT - caption.length < 120 ? C.danger : C.subtle;
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Paylasim metni</Text>
      <TextInput
        style={styles.captionInput}
        placeholder="Bugun nerede, ne kesfettin?"
        placeholderTextColor="#9aa1ad"
        multiline
        value={caption}
        onChangeText={onChange}
        maxLength={CAPTION_LIMIT}
        textAlignVertical="top"
      />
      <View style={styles.metaRow}>
        <Text style={[styles.inlineError, !error && styles.hidden]}>{error || ' '}</Text>
        <Text style={[styles.count, { color: countColor }]}>{caption.length}/{CAPTION_LIMIT}</Text>
      </View>
    </View>
  );
}

function MediaCard({ media, tileSize, progress, onPick, onCamera, onRemove }) {
  const remaining = MAX_MEDIA - media.length;
  return (
    <View style={styles.card}>
      <View style={styles.sectionTop}>
        <View>
          <Text style={styles.eyebrow}>Medya</Text>
          <Text style={styles.sectionTitle}>{media.length ? `${media.length}/${MAX_MEDIA} secildi` : 'Fotoğraf ekle'}</Text>
        </View>
        {media.length > 0 && remaining > 0 && (
          <TouchableOpacity style={styles.compactAction} onPress={onPick}>
            <Text style={styles.compactActionText}>Ekle</Text>
          </TouchableOpacity>
        )}
      </View>

      {media.length === 0 ? (
        <TouchableOpacity style={styles.dropzone} onPress={onPick}>
          <View style={styles.dropIcon}><Text style={styles.dropIconText}>+</Text></View>
          <Text style={styles.dropTitle}>Galeriden fotoğraf sec</Text>
          <Text style={styles.dropText}>Paylasimini guclendirmek icin en fazla {MAX_MEDIA} görsel ekleyebilirsin.</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.mediaGrid}>
          {media.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={[styles.mediaTile, { width: tileSize, height: tileSize }]}>
              <Image source={{ uri: item.uri }} style={styles.mediaPreview} resizeMode="cover" />
              <View style={styles.mediaBadge}><Text style={styles.mediaBadgeText}>{index + 1}</Text></View>
              <TouchableOpacity style={styles.removeMedia} onPress={() => onRemove(index)}>
                <Text style={styles.removeMediaText}>x</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.secondaryAction, remaining <= 0 && styles.disabled]} onPress={onPick} disabled={remaining <= 0}>
          <Text style={styles.secondaryIcon}>IMG</Text>
          <Text style={styles.secondaryText}>Galeri</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryAction, remaining <= 0 && styles.disabled]} onPress={onCamera} disabled={remaining <= 0}>
          <Text style={styles.secondaryIcon}>CAM</Text>
          <Text style={styles.secondaryText}>Kamera</Text>
        </TouchableOpacity>
      </View>

      {!!progress.total && (
        <View style={styles.uploadPanel}>
          <View style={styles.uploadRow}>
            <Text style={styles.uploadTitle}>Medya yukleniyor</Text>
            <Text style={styles.uploadCount}>{progress.current}/{progress.total}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(6, progress.percent)}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

function DetailsCard({
  location,
  trip,
  routePreview,
  tagsText,
  onLocation,
  onClearLocation,
  onTrip,
  onClearTrip,
  onTags,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Detaylar</Text>
      <TouchableOpacity style={styles.detailRow} onPress={onLocation}>
        <View style={styles.detailIcon}><Text style={styles.detailIconText}>LOC</Text></View>
        <View style={styles.detailCopy}>
          <Text style={styles.detailTitle}>{location ? location.name : 'Yer etiketle'}</Text>
          <Text style={styles.detailText}>{location ? 'Konum gönderiye eklendi.' : 'Şehir, mekan veya rota noktasi ekle.'}</Text>
        </View>
        {location && <TouchableOpacity style={styles.clearPill} onPress={onClearLocation}><Text style={styles.clearText}>Kaldir</Text></TouchableOpacity>}
      </TouchableOpacity>
      <View style={styles.divider} />
      <TouchableOpacity style={styles.detailRow} onPress={onTrip}>
        <View style={styles.detailIcon}><Text style={styles.detailIconText}>MAP</Text></View>
        <View style={styles.detailCopy}>
          <Text style={styles.detailTitle} numberOfLines={1}>{trip ? trip.title : 'Rota paylaş'}</Text>
          <Text style={styles.detailText}>{trip ? routePreview?.summary || 'Rota detayları eklendi.' : 'Kayitli rotalarından birini gönderiye bagla.'}</Text>
        </View>
        {trip && <TouchableOpacity style={styles.clearPill} onPress={onClearTrip}><Text style={styles.clearText}>Kaldir</Text></TouchableOpacity>}
      </TouchableOpacity>
      {routePreview ? <RouteShareCard routeData={routePreview} compact /> : null}
      <TextInput
        style={styles.tagsInput}
        placeholder="Etiketler: kahve, galata, gunbatimi"
        placeholderTextColor="#9aa1ad"
        value={tagsText}
        onChangeText={onTags}
      />
    </View>
  );
}

function VisibilityCard({ value, onSelect }) {
  const active = VISIBILITY.find((item) => item.value === value);
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Gorunurluk</Text>
      <View style={styles.visibilityChips}>
        {VISIBILITY.map((item) => {
          const selected = item.value === value;
          return (
            <TouchableOpacity
              key={item.value}
              style={[styles.visibilityChip, selected && styles.visibilityChipSelected]}
              onPress={() => onSelect(item.value)}
            >
              <Text style={[styles.visibilityIcon, selected && styles.visibilityIconSelected]}>{item.icon}</Text>
              <Text style={[styles.visibilityLabel, selected && styles.visibilityLabelSelected]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.visibilityHint}>{active?.hint}</Text>
    </View>
  );
}

function BottomBar({ bottom, canSubmit, submitting, error, onSubmit }) {
  const isDisabled = !canSubmit || submitting;
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(bottom, 12) }]}>
      <View style={styles.bottomCopy}>
        <Text style={styles.bottomTitle}>{error ? 'Paylasima hazır degil' : 'Paylasima hazır'}</Text>
        <Text style={styles.bottomText} numberOfLines={1}>{error || 'Topluluga temiz ve akıcı bir gönderi olarak gidecek.'}</Text>
      </View>
      <TouchableOpacity
        style={[styles.primaryCta, isDisabled && styles.primaryCtaDisabled]}
        onPress={onSubmit}
        disabled={isDisabled}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={[styles.primaryCtaText, isDisabled && styles.primaryCtaTextDisabled]}>
            Paylaş
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function CreatePostScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuthStore();
  const createPostMutation = useCreatePost();
  const openTripPicker = !!route?.params?.openTripPicker;

  const [caption, setCaption] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [taggedLocation, setTaggedLocation] = useState(null);
  const [visibility, setVisibility] = useState('PUBLIC');
  const [tagsText, setTagsText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [availableTrips, setAvailableTrips] = useState([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [formError, setFormError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, percent: 0 });

  const submitting = isLoading || createPostMutation.isPending;
  const tags = useMemo(() => normalizeTags(tagsText), [tagsText]);
  const tripStops = useMemo(() => selectedTrip?.stops?.length ?? selectedTrip?.total_stops ?? 0, [selectedTrip]);
  const routePreview = useMemo(
    () =>
      selectedTrip
        ? buildRouteShareData(
            selectedTrip,
            null,
            user?.full_name || user?.username || user?.email || null
          )
        : null,
    [selectedTrip, user]
  );
  const hasContent = !!caption.trim() || selectedMedia.length > 0 || !!selectedTrip;
  const captionError = caption.length >= CAPTION_LIMIT ? 'Maksimum karakter sinirina ulastin.' : '';
  const validationError = !hasContent ? 'En az bir metin, medya veya rota ekle.' : captionError;
  const canSubmit = !validationError && !submitting;
  const contentWidth = Math.min(width - 32, 760);
  const tileSize = Math.max(132, Math.floor((contentWidth - 48) / (width >= 700 ? 3 : 2)));

  const fetchTrips = async () => {
    setIsLoadingTrips(true);
    try {
      const payload = await TripService.fetchTrips();
      const trips = Array.isArray(payload?.results) ? payload.results : payload || [];
      const ownTrips = user?.username ? trips.filter((trip) => trip?.username === user.username) : trips;
      setAvailableTrips(ownTrips);
    } catch (error) {
      Alert.alert('Hata', 'Rotalar yüklenemedi.');
    } finally {
      setIsLoadingTrips(false);
    }
  };

  useEffect(() => {
    if (openTripPicker) {
      fetchTrips();
      setShowTripPicker(true);
    }
  }, [openTripPicker]);

  const appendMedia = (assets = []) => {
    if (!assets.length) return;
    setFormError('');
    setSelectedMedia((prev) => {
      const next = [...prev, ...assets];
      if (next.length > MAX_MEDIA) {
        Alert.alert('Bilgi', `En fazla ${MAX_MEDIA} fotoğraf ekleyebilirsiniz.`);
      }
      return next.slice(0, MAX_MEDIA);
    });
  };

  const captureImageFromWeb = () =>
    new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Web document is not available'));
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.opacity = '0';
      input.onchange = () => {
        try {
          const file = input.files && input.files[0];
          resolve(file ? {
            uri: URL.createObjectURL(file),
            file,
            fileName: file.name || `camera-${Date.now()}.jpg`,
            mimeType: file.type || 'image/jpeg',
            type: 'image',
          } : null);
        } catch (err) {
          reject(err);
        } finally {
          input.remove();
        }
      };
      input.onerror = (err) => {
        input.remove();
        reject(err);
      };
      document.body.appendChild(input);
      input.click();
    });

  const handlePickMedia = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Gerekli', 'Galeriye erisim izni vermelisiniz.');
        return;
      }
      const remaining = MAX_MEDIA - selectedMedia.length;
      if (remaining <= 0) {
        Alert.alert('Bilgi', `En fazla ${MAX_MEDIA} fotoğraf ekleyebilirsiniz.`);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
        exif: true,
      });
      if (!result.canceled && result.assets?.length) appendMedia(result.assets);
    } catch (error) {
      console.error('Error picking media:', error);
      Alert.alert('Hata', 'Medya seçimi su an kullanilamiyor.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      if (Platform.OS === 'web') {
        const captured = await captureImageFromWeb();
        if (captured) appendMedia([captured]);
        else Alert.alert('Bilgi', 'Tarayici kamera acmadi. Lutfen galeri secenegini kullanin.');
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Gerekli', 'Kamera izni vermelisiniz.');
        return;
      }
      if (selectedMedia.length >= MAX_MEDIA) {
        Alert.alert('Bilgi', `En fazla ${MAX_MEDIA} fotoğraf ekleyebilirsiniz.`);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        exif: true,
      });
      if (!result.canceled && result.assets?.length) appendMedia(result.assets.slice(0, 1));
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Hata', 'Medya seçimi su an kullanilamiyor.');
    }
  };

  const formatTripDate = (dateValue) => {
    if (!dateValue) return 'Tarih belirtilmedi';
    try {
      return new Date(dateValue).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return 'Tarih belirtilmedi';
    }
  };

  const ensureTripShareLink = async (trip) => {
    try {
      const result = await TripService.shareTrip(trip.id);
      return result?.share_link || null;
    } catch (error) {
      const message = error?.response?.data?.error || error?.response?.data?.detail || error?.message || '';
      if (!message.toLowerCase().includes('public itineraries')) {
        throw new Error(message || 'Rota paylasim bağlantısı oluşturulamadı.');
      }
      await TripService.updateTrip(trip.id, { visibility: 'PUBLIC' });
      const refreshed = await TripService.fetchTripById(trip.id);
      setSelectedTrip(refreshed);
      const retry = await TripService.shareTrip(trip.id);
      return retry?.share_link || null;
    }
  };

  const handleOpenTripPicker = async () => {
    if (availableTrips.length === 0) await fetchTrips();
    setShowTripPicker(true);
  };

  const handleSubmitPost = async () => {
    if (submitting) return;
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setIsLoading(true);
    setFormError('');
    setUploadProgress({ current: 0, total: selectedMedia.length, percent: 0 });
    try {
      const mediaUrls = [];
      for (let index = 0; index < selectedMedia.length; index += 1) {
        const uploadedUrl = await SocialService.uploadPostImage(selectedMedia[index]);
        mediaUrls.push(uploadedUrl);
        const current = index + 1;
        setUploadProgress({ current, total: selectedMedia.length, percent: Math.round((current / selectedMedia.length) * 100) });
      }
      let routeData = routePreview;
      if (selectedTrip?.id) {
        const tripShareLink = await ensureTripShareLink(selectedTrip);
        routeData = buildRouteShareData(
          selectedTrip,
          tripShareLink,
          user?.full_name || user?.username || user?.email || null
        );
      }
      const postData = {
        content: caption.trim(),
        media_urls: mediaUrls,
        location: taggedLocation?.name || null,
        visibility,
        tags: selectedTrip?.id ? Array.from(new Set([...tags, 'trip-share'])) : tags,
      };
      if (routeData) {
        postData.route_data = routeData;
      }

      await createPostMutation.mutateAsync(postData);
      Alert.alert('Başarılı', 'Gonderiniz paylaşıldı.');
      navigation.navigate('CommunityFeed');
    } catch (error) {
      console.error('Error creating post:', error);
      setFormError(errorMessage(error));
    } finally {
      setUploadProgress({ current: 0, total: 0, percent: 0 });
      setIsLoading(false);
    }
  };

  const chooseLocation = (name) => {
    const clean = name.trim();
    if (!clean) return;
    setTaggedLocation({ name: clean });
    setLocationSearch('');
    setShowLocation(false);
    setFormError('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboardRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={8}>
        <Header canSubmit={canSubmit} submitting={submitting} onBack={() => navigation.goBack()} onSubmit={handleSubmitPost} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 12) + 104 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.contentShell}>
            <Author user={user} visibility={visibility} onPress={() => setShowVisibility(true)} />
            <CaptionCard
              caption={caption}
              error={formError || captionError}
              onChange={(value) => {
                setCaption(value);
                if (formError) setFormError('');
              }}
            />
            <MediaCard
              media={selectedMedia}
              tileSize={tileSize}
              progress={uploadProgress}
              onPick={handlePickMedia}
              onCamera={handleTakePhoto}
              onRemove={(index) => setSelectedMedia((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
            />
            <DetailsCard
              location={taggedLocation}
              trip={selectedTrip}
              routePreview={routePreview}
              tagsText={tagsText}
              onLocation={() => setShowLocation(true)}
              onClearLocation={() => setTaggedLocation(null)}
              onTrip={handleOpenTripPicker}
              onClearTrip={() => setSelectedTrip(null)}
              onTags={setTagsText}
            />
            {tags.length > 0 && (
              <View style={styles.tagWrap}>
                {tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>)}
              </View>
            )}
            <VisibilityCard value={visibility} onSelect={setVisibility} />
          </View>
        </ScrollView>
        <BottomBar bottom={insets.bottom} canSubmit={canSubmit} submitting={submitting} error={validationError} onSubmit={handleSubmitPost} />

        <Modal visible={showVisibility} transparent animationType="fade" onRequestClose={() => setShowVisibility(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Gonderiyi kimler gorebilir?</Text>
              {VISIBILITY.map((item) => {
                const selected = visibility === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.sheetOption, selected && styles.sheetOptionSelected]}
                    onPress={() => {
                      setVisibility(item.value);
                      setShowVisibility(false);
                    }}
                  >
                    <View style={[styles.sheetOptionIcon, selected && styles.sheetOptionIconSelected]}>
                      <Text style={[styles.sheetOptionIconText, selected && styles.sheetOptionIconTextSelected]}>{item.icon}</Text>
                    </View>
                    <View style={styles.sheetOptionCopy}>
                      <Text style={styles.sheetOptionLabel}>{item.label}</Text>
                      <Text style={styles.sheetOptionText}>{item.hint}</Text>
                    </View>
                    {selected && <Text style={styles.sheetCheck}>Secili</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Modal>

        <Modal visible={showLocation} transparent animationType="slide" onRequestClose={() => setShowLocation(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Yer etiketle</Text>
              <TextInput
                style={styles.locationInput}
                placeholder="Mekan, şehir veya rota noktasi yaz"
                placeholderTextColor="#9aa1ad"
                value={locationSearch}
                onChangeText={setLocationSearch}
                autoFocus
              />
              {!!locationSearch.trim() && (
                <TouchableOpacity style={styles.locationUse} onPress={() => chooseLocation(locationSearch)}>
                  <Text style={styles.locationUseTitle}>{locationSearch.trim()}</Text>
                  <Text style={styles.locationUseText}>Bu konumu kullan</Text>
                </TouchableOpacity>
              )}
              <View style={styles.quickWrap}>
                {QUICK_LOCATIONS.map((item) => (
                  <TouchableOpacity key={item} style={styles.quickChip} onPress={() => chooseLocation(item)}>
                    <Text style={styles.quickText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setShowLocation(false)}>
                <Text style={styles.sheetCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showTripPicker} transparent animationType="slide" onRequestClose={() => setShowTripPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.sheet, styles.tripSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Paylasilacak rota</Text>
              {isLoadingTrips ? (
                <View style={styles.sheetLoader}>
                  <ActivityIndicator size="small" color={C.ink} />
                  <Text style={styles.sheetLoaderText}>Rotalar yukleniyor...</Text>
                </View>
              ) : (
                <FlatList
                  data={availableTrips}
                  keyExtractor={(item) => String(item.id)}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={<Text style={styles.emptyTrip}>Henüz paylaşılacak rota yok.</Text>}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.tripItem, selectedTrip?.id === item.id && styles.tripItemSelected]}
                      onPress={async () => {
                        try {
                          setIsLoadingTrips(true);
                          const detailedTrip = await TripService.fetchTripById(item.id);
                          setSelectedTrip(detailedTrip);
                          setShowTripPicker(false);
                          setFormError('');
                        } catch (error) {
                          Alert.alert('Hata', 'Rota detayları yüklenemedi.');
                        } finally {
                          setIsLoadingTrips(false);
                        }
                      }}
                    >
                      <Text style={styles.tripTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.tripMeta}>{formatTripDate(item.start_date)} - {item.total_stops ?? item.stops?.length ?? 0} durak</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
              <TouchableOpacity style={styles.sheetClose} onPress={() => setShowTripPicker(false)}>
                <Text style={styles.sheetCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.page },
  keyboardRoot: { flex: 1 },
  header: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerGhost: { minWidth: 64, minHeight: 40, justifyContent: 'center' },
  headerGhostText: { color: C.muted, fontSize: 14, fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { color: C.ink, fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: C.muted, fontSize: 12, marginTop: 2 },
  headerShare: {
    minWidth: 76,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  headerShareDisabled: {
    backgroundColor: '#9da3b0',
  },
  headerShareText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.58 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, alignItems: 'center' },
  contentShell: { width: '100%', maxWidth: 760 },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.soft },
  authorCopy: { flex: 1, marginLeft: 12 },
  authorName: { color: C.ink, fontSize: 15, fontWeight: '800' },
  visibilityMini: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
  },
  visibilityMiniText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  chevron: { color: C.muted, fontSize: 11, fontWeight: '800', marginLeft: 6 },
  card: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  eyebrow: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  captionInput: { minHeight: 150, color: C.text, fontSize: 18, lineHeight: 26, padding: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  inlineError: { flex: 1, color: C.danger, fontSize: 12, fontWeight: '700' },
  hidden: { opacity: 0 },
  count: { fontSize: 12, fontWeight: '700' },
  sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  compactAction: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.ink },
  compactActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dropzone: {
    minHeight: 190,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cfd6e3',
    borderRadius: 8,
    backgroundColor: '#fbfcff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dropIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dropIconText: { color: '#fff', fontSize: 28, fontWeight: '500', lineHeight: 31 },
  dropTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  dropText: { color: C.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 330 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mediaTile: { borderRadius: 8, overflow: 'hidden', backgroundColor: C.soft, position: 'relative' },
  mediaPreview: { width: '100%', height: '100%' },
  mediaBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 26, 46, 0.76)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  mediaBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  removeMedia: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMediaText: { color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: C.soft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryIcon: { color: C.ink, fontSize: 11, fontWeight: '900', marginRight: 8 },
  secondaryText: { color: C.ink, fontSize: 14, fontWeight: '800' },
  uploadPanel: { marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: C.brandSoft },
  uploadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  uploadTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  uploadCount: { color: C.muted, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: '#dbe1ec', overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: C.ink },
  detailRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  detailIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  detailIconText: { color: C.ink, fontSize: 10, fontWeight: '900' },
  detailCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  detailTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  detailText: { color: C.muted, fontSize: 12, marginTop: 3 },
  clearPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: C.soft },
  clearText: { color: C.muted, fontSize: 12, fontWeight: '800' },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 8 },
  tagsInput: {
    minHeight: 48,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    color: C.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fbfcff',
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: C.ink },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  visibilityChips: { flexDirection: 'row', gap: 8 },
  visibilityChip: {
    flex: 1,
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#fbfcff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  visibilityChipSelected: { backgroundColor: C.ink, borderColor: C.ink },
  visibilityIcon: { color: C.ink, fontSize: 12, fontWeight: '900', marginBottom: 4 },
  visibilityIconSelected: { color: '#fff' },
  visibilityLabel: { color: C.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  visibilityLabelSelected: { color: '#fff' },
  visibilityHint: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 82,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomCopy: { flex: 1, minWidth: 0 },
  bottomTitle: { color: C.ink, fontSize: 14, fontWeight: '900' },
  bottomText: { color: '#5c6371', fontSize: 12, marginTop: 3 },
  primaryCta: {
    minWidth: 116,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryCtaDisabled: {
    backgroundColor: '#9da3b0',
  },
  primaryCtaText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  primaryCtaTextDisabled: { color: '#f5f7ff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(10, 12, 18, 0.46)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: C.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#d5dae4', marginBottom: 16 },
  sheetTitle: { color: C.ink, fontSize: 18, fontWeight: '900', marginBottom: 14 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fbfcff',
  },
  sheetOptionSelected: { borderColor: C.ink, backgroundColor: C.brandSoft },
  sheetOptionIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  sheetOptionIconSelected: { backgroundColor: C.ink },
  sheetOptionIconText: { color: C.ink, fontSize: 13, fontWeight: '900' },
  sheetOptionIconTextSelected: { color: '#fff' },
  sheetOptionCopy: { flex: 1, marginLeft: 12 },
  sheetOptionLabel: { color: C.ink, fontSize: 15, fontWeight: '900' },
  sheetOptionText: { color: C.muted, fontSize: 12, marginTop: 3 },
  sheetCheck: { color: C.success, fontSize: 12, fontWeight: '900' },
  locationInput: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    fontSize: 15,
    paddingHorizontal: 14,
    backgroundColor: '#fbfcff',
  },
  locationUse: { marginTop: 12, borderRadius: 8, backgroundColor: C.ink, padding: 14 },
  locationUseTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  locationUseText: { color: '#d9deea', fontSize: 12, marginTop: 3 },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: C.soft },
  quickText: { color: C.ink, fontSize: 13, fontWeight: '800' },
  sheetClose: { marginTop: 14, minHeight: 48, borderRadius: 8, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: C.ink, fontSize: 14, fontWeight: '900' },
  tripSheet: { maxHeight: '76%' },
  sheetLoader: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  sheetLoaderText: { color: C.muted, fontSize: 13, marginTop: 10 },
  emptyTrip: { color: C.muted, textAlign: 'center', paddingVertical: 24 },
  tripItem: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 13, marginBottom: 10, backgroundColor: '#fbfcff' },
  tripItemSelected: { borderColor: C.ink, backgroundColor: C.brandSoft },
  tripTitle: { color: C.ink, fontSize: 15, fontWeight: '900' },
  tripMeta: { color: C.muted, fontSize: 12, marginTop: 5 },
});
