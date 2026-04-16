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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../store/authStore';
import AuthManager from '../services/AuthManager';
import api from '../services/api';

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [username, setUsername] = useState(user?.username || user?.email?.split('@')[0] || '');
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [selectedAvatarAsset, setSelectedAvatarAsset] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

    const fileName = selectedAvatarAsset.fileName || `avatar-${Date.now()}.jpg`;
    const contentType = selectedAvatarAsset.mimeType || 'image/jpeg';
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
    const response = await api.post('/media_storage/images/', formData);

    return response?.data?.url || '';
  };

  const handlePickAvatar = async () => {
    setErrorMessage('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Galeri izni olmadan profil fotoğrafı seçilemez.');
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
      setErrorMessage('Fotoğraf seçilirken bir hata oluştu.');
    }
  };

  const handleSave = async () => {
    setErrorMessage('');
    if (!username.trim() || username.trim().length < 3) {
      setErrorMessage('Kullanıcı adı en az 3 karakter olmalı.');
      return;
    }
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Ad soyad en az 2 karakter olmalı.');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setErrorMessage('Yeni şifreler eşleşmiyor.');
      return;
    }
    if (newPassword && !currentPassword) {
      setErrorMessage('Şifre değiştirmek için mevcut şifre gerekli.');
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

      const updatedUser = await AuthManager.updateProfile({
        ...payload,
      });

      updateUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      navigation.goBack();
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        'Profil güncellenemedi.';
      setErrorMessage(message);
      if (Platform.OS !== 'web') {
        Alert.alert('Hata', message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Profili Düzenle</Text>

        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Ad Soyad</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          editable={!isSaving}
          placeholder="Ad Soyad"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Kullanıcı Adı</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          editable={!isSaving}
          placeholder="kullanici_adi"
          placeholderTextColor="#999"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Biyografi</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          editable={!isSaving}
          placeholder="Kendinden bahset..."
          placeholderTextColor="#999"
          multiline
        />

        <Text style={styles.label}>Profil Fotoğrafı URL</Text>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} /> : null}
        <TouchableOpacity
          style={styles.pickButton}
          onPress={handlePickAvatar}
          disabled={isSaving}
        >
          <Text style={styles.pickButtonText}>Galeriden Seç</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={avatarUrl}
          onChangeText={(value) => {
            setAvatarUrl(value);
            if (!isLocalAvatarUri(value)) {
              setSelectedAvatarAsset(null);
            }
          }}
          editable={!isSaving}
          placeholder="https://..."
          placeholderTextColor="#999"
          autoCapitalize="none"
        />

        <View style={styles.sectionDivider} />
        <Text style={styles.sectionTitle}>Şifre Değiştir (Opsiyonel)</Text>

        <Text style={styles.label}>Mevcut Şifre</Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          editable={!isSaving}
          placeholder="Mevcut şifre"
          placeholderTextColor="#999"
          secureTextEntry
        />

        <Text style={styles.label}>Yeni Şifre</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          editable={!isSaving}
          placeholder="Yeni şifre"
          placeholderTextColor="#999"
          secureTextEntry
        />

        <Text style={styles.label}>Yeni Şifre (Tekrar)</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!isSaving}
          placeholder="Yeni şifre tekrar"
          placeholderTextColor="#999"
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.interestButton}
          onPress={() => navigation.navigate('InterestSelection', { mode: 'edit' })}
          disabled={isSaving}
        >
          <Text style={styles.interestButtonText}>İlgi Alanlarını Düzenle</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => navigation.goBack()}
            disabled={isSaving}
          >
            <Text style={styles.cancelButtonText}>Vazgeç</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton, isSaving && styles.disabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Kaydet</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fafafa',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  avatarPreview: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 10,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pickButton: {
    borderWidth: 1,
    borderColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  pickButtonText: {
    color: '#1a1a2e',
    fontWeight: '600',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
    marginBottom: 10,
  },
  interestButton: {
    marginTop: 2,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1a1a2e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  interestButtonText: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#1a1a2e',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.7,
  },
  errorContainer: {
    backgroundColor: '#ffe6e6',
    borderLeftWidth: 4,
    borderLeftColor: '#cc0000',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: '#cc0000',
    fontSize: 14,
  },
});
