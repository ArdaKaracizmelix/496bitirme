import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppAvatar from '../components/AppAvatar';
import useAuthStore from '../store/authStore';
import AuthManager from '../services/AuthManager';
import api from '../services/api';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const contentMaxWidth = width >= 900 ? 720 : 640;

  const [username, setUsername] = useState(user?.username || user?.email?.split('@')[0] || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [selectedAvatarAsset, setSelectedAvatarAsset] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const profileName = fullName.trim() || 'Gezgin profili';
  const profileHandle = username.trim() ? `@${username.trim()}` : '@kullanici_adi';

  const isLocalAvatarUri = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return (
      normalized.startsWith('file:') ||
      normalized.startsWith('content:') ||
      normalized.startsWith('blob:')
    );
  };

  const uploadSelectedAvatar = async () => {
    if (!selectedAvatarAsset?.uri) {
      return avatarUrl.trim();
    }

    try {
      const fileName = selectedAvatarAsset.fileName || `avatar-${Date.now()}.jpg`;
      const contentType =
        selectedAvatarAsset.mimeType ||
        (selectedAvatarAsset.type ? `image/${selectedAvatarAsset.type}` : null) ||
        'image/jpeg';
      const formData = new FormData();

      if (Platform.OS === 'web') {
        if (selectedAvatarAsset.file) {
          formData.append('file', selectedAvatarAsset.file, fileName);
        } else {
          const blob = await fetch(selectedAvatarAsset.uri).then((res) => res.blob());
          const file = new File([blob], fileName, { type: contentType });
          formData.append('file', file, fileName);
        }
      } else {
        formData.append('file', {
          uri: selectedAvatarAsset.uri,
          name: fileName,
          type: contentType,
        });
      }

      formData.append('optimize', 'true');
      const response = await api.post('/media_storage/images/', formData, {
        timeout: 60000,
        forceMultipart: true,
      });
      const uploadedUrl = response?.data?.url;
      if (!uploadedUrl) {
        throw new Error('Avatar yukleme yanitinda url bulunamadi.');
      }
      return uploadedUrl;
    } catch (error) {
      const backendMessage =
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        (Array.isArray(error?.response?.data?.file) ? error.response.data.file[0] : null) ||
        error?.message;
      throw new Error(backendMessage || 'Avatar yuklenemedi.');
    }
  };

  const handlePickAvatar = async () => {
    setErrorMessage('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Galeri izni olmadan profil fotografi secilemez.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const [asset] = result.assets;
      setSelectedAvatarAsset(asset);
      setAvatarUrl(asset.uri || '');
    } catch (error) {
      setErrorMessage('Fotograf secilirken bir hata olustu.');
    }
  };

  const handleSave = async () => {
    setErrorMessage('');
    if (!username.trim() || username.trim().length < 3) {
      setErrorMessage('Kullanici adi en az 3 karakter olmali.');
      return;
    }
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Ad soyad en az 2 karakter olmali.');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setErrorMessage('Yeni sifreler eslesmiyor.');
      return;
    }
    if (newPassword && !currentPassword) {
      setErrorMessage('Sifre degistirmek icin mevcut sifre gerekli.');
      return;
    }

    setIsSaving(true);
    try {
      let resolvedAvatarUrl = avatarUrl.trim();
      if (isLocalAvatarUri(resolvedAvatarUrl)) {
        resolvedAvatarUrl = await uploadSelectedAvatar();
      }

      const payload = {
        username: username.trim(),
        full_name: fullName.trim(),
        bio: bio.trim(),
        avatar_url: resolvedAvatarUrl,
      };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      const updatedUser = await AuthManager.updateProfile(payload);

      updateUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      navigation.goBack();
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.error ||
        (Array.isArray(error?.response?.data?.file) ? error.response.data.file[0] : null) ||
        error?.response?.data?.message ||
        error?.message ||
        'Profil guncellenemedi.';
      setErrorMessage(message);
      if (Platform.OS !== 'web') {
        Alert.alert('Hata', message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    const runDelete = async () => {
      setErrorMessage('');
      setIsDeleting(true);
      try {
        await deleteAccount();
      } catch (error) {
        const message =
          error?.response?.data?.detail ||
          error?.response?.data?.error ||
          'Hesap silinirken bir hata olustu.';
        setErrorMessage(message);
        if (Platform.OS !== 'web') {
          Alert.alert('Hata', message);
        }
      } finally {
        setIsDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm(
              'Hesabin kalici olarak silinecek. Bu islem geri alinamaz. Devam etmek istiyor musun?'
            )
          : false;
      if (confirmed) runDelete();
      return;
    }

    Alert.alert(
      'Hesabi Sil',
      'Hesabin kalici olarak silinecek. Bu islem geri alinamaz.',
      [
        { text: 'Iptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: runDelete },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.contentContainer,
            {
              maxWidth: contentMaxWidth,
              paddingTop: 12 + (insets.top > 0 ? 0 : 8),
              paddingBottom: 36 + Math.max(insets.bottom, 0),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.goBack()}
              disabled={isSaving}
            >
              <Text style={styles.iconButtonText}>{'<'}</Text>
            </TouchableOpacity>
            <View style={styles.topTitleWrap}>
              <Text style={styles.kicker}>PROFIL AYARLARI</Text>
              <Text style={styles.title}>Profili Duzenle</Text>
            </View>
            <View style={styles.iconButtonGhost} />
          </View>

          <View style={styles.previewCard}>
            <View style={styles.avatarWrap}>
              <AppAvatar uri={avatarUrl} style={styles.avatarPreview} />
              <TouchableOpacity
                style={styles.avatarAction}
                onPress={handlePickAvatar}
                disabled={isSaving}
              >
                <Text style={styles.avatarActionText}>Degistir</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.previewTextWrap}>
              <Text style={styles.previewName} numberOfLines={1}>{profileName}</Text>
              <Text style={styles.previewHandle} numberOfLines={1}>{profileHandle}</Text>
              <Text style={styles.previewBio} numberOfLines={2}>
                {bio.trim() || 'Kisa bir bio, profiline daha net bir kesif kimligi verir.'}
              </Text>
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.formCard}>
            <SectionHeader
              title="Kimlik"
              subtitle="Profilde gorunen temel bilgileri duzenle."
            />
            <Field
              label="Ad Soyad"
              value={fullName}
              onChangeText={setFullName}
              editable={!isSaving}
              placeholder="Ad Soyad"
            />
            <Field
              label="Kullanici Adi"
              value={username}
              onChangeText={setUsername}
              editable={!isSaving}
              placeholder="kullanici_adi"
              autoCapitalize="none"
            />
            <Field
              label="Biyografi"
              value={bio}
              onChangeText={setBio}
              editable={!isSaving}
              placeholder="Seyahat tarzini kisaca anlat..."
              multiline
              style={styles.textArea}
            />
          </View>

          <View style={styles.formCard}>
            <SectionHeader
              title="Profil Fotografi"
              subtitle="Galeriden secerek profil fotografini guncelle."
            />
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={handlePickAvatar}
              disabled={isSaving}
            >
              <Text style={styles.secondaryActionText}>Galeriden Sec</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formCard}>
            <SectionHeader
              title="Gizlilik"
              subtitle="Sifre degistirmek istemiyorsan bu alanlari bos birak."
            />
            <Field
              label="Mevcut Sifre"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              editable={!isSaving}
              placeholder="Mevcut sifre"
              secureTextEntry
            />
            <Field
              label="Yeni Sifre"
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!isSaving}
              placeholder="Yeni sifre"
              secureTextEntry
            />
            <Field
              label="Yeni Sifre Tekrar"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!isSaving}
              placeholder="Yeni sifre tekrar"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.interestButton}
            onPress={() => navigation.navigate('InterestSelection', { mode: 'edit' })}
            disabled={isSaving}
          >
            <View>
              <Text style={styles.interestButtonTitle}>Ilgi Alanlari</Text>
              <Text style={styles.interestButtonSubtitle}>Akis ve onerilerini daha iyi ayarla</Text>
            </View>
            <Text style={styles.interestArrow}>{'>'}</Text>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => navigation.goBack()}
              disabled={isSaving || isDeleting}
            >
              <Text style={styles.cancelButtonText}>Vazgec</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.saveButton, isSaving && styles.disabled]}
              onPress={handleSave}
              disabled={isSaving || isDeleting}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Kaydet</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.deleteAccountButton, isDeleting && styles.disabled]}
            onPress={handleDeleteAccount}
            disabled={isSaving || isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteAccountText}>Hesabi Sil</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Field({ label, style, ...props }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, style]}
        placeholderTextColor="#9d8f78"
        selectionColor="#1a1a2e"
        cursorColor="#1a1a2e"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  contentContainer: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 14,
  },
  topBar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
  },
  iconButtonText: {
    color: '#1a1a2e',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
  iconButtonGhost: {
    width: 40,
    height: 40,
  },
  topTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  kicker: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    color: '#1a1a2e',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 2,
  },
  previewCard: {
    borderRadius: 28,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 2,
    marginBottom: 14,
  },
  avatarWrap: {
    alignItems: 'center',
    marginRight: 14,
  },
  avatarPreview: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#d7c49e',
    backgroundColor: '#eee5d7',
  },
  avatarAction: {
    marginTop: -12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1a1a2e',
  },
  avatarActionText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  previewTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  previewName: {
    color: '#1a1a2e',
    fontSize: 22,
    fontWeight: '900',
  },
  previewHandle: {
    color: '#9b8356',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  previewBio: {
    color: '#746b5e',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 8,
  },
  formCard: {
    borderRadius: 24,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#1a1a2e',
    fontSize: 17,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: '#746b5e',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 13,
  },
  label: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1d5bf',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a2e',
    backgroundColor: '#f7f3ea',
    fontWeight: '700',
    outlineWidth: 0,
  },
  textArea: {
    minHeight: 104,
    textAlignVertical: 'top',
    lineHeight: 21,
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    marginBottom: 13,
  },
  secondaryActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  interestButton: {
    minHeight: 68,
    borderRadius: 22,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  interestButtonTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '900',
  },
  interestButtonSubtitle: {
    color: '#746b5e',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  interestArrow: {
    color: '#9b8356',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 12,
  },
  actions: {
    marginTop: 2,
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#1a1a2e',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#e1d5bf',
    backgroundColor: '#fffdf8',
  },
  cancelButtonText: {
    color: '#746b5e',
    fontSize: 15,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.7,
  },
  deleteAccountButton: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#b3413a',
    borderWidth: 1,
    borderColor: '#9f3731',
  },
  deleteAccountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  errorContainer: {
    backgroundColor: '#fff1ee',
    borderWidth: 1,
    borderColor: '#dfb3ad',
    padding: 13,
    borderRadius: 18,
    marginBottom: 12,
  },
  errorText: {
    color: '#b94a3f',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
});
