import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import AuthManager from '../../services/AuthManager';
import useAuthStore from '../../store/authStore';

const normalizeApiErrorItem = (item) => {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (item.message) return item.message;
  if (item.detail) return item.detail;
  if (Array.isArray(item)) return normalizeApiErrorItem(item[0]);
  if (typeof item === 'object') {
    return Object.values(item).map(normalizeApiErrorItem).filter(Boolean).join(' ');
  }
  return String(item);
};

const normalizeApiErrors = (data) => {
  if (!data) return { general: 'Kayit basarisiz. Tekrar dene.' };
  if (typeof data === 'string') return { general: data };
  if (data.detail || data.message) {
    return { general: data.detail || data.message };
  }

  return Object.entries(data).reduce((acc, [field, value]) => {
    const message = normalizeApiErrorItem(value);
    if (!message) return acc;
    acc[field] = message;
    return acc;
  }, {});
};

export default function RegisterPage({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const setAuth = useAuthStore((state) => state.setAuth);

  const validateEmail = (text) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text);
  };

  const validateForm = () => {
    const errors = {};

    if (!fullName.trim()) {
      errors.fullName = 'Ad Soyad gerekli';
    } else if (fullName.trim().length < 2) {
      errors.fullName = 'Ad Soyad en az 2 karakter olmali';
    }

    if (!email.trim()) {
      errors.email = 'Email adresi gerekli';
    } else if (!validateEmail(email)) {
      errors.email = 'Gecerli bir email adresi girin';
    }

    if (!password) {
      errors.password = 'Sifre gerekli';
    } else if (password.length < 8) {
      errors.password = 'Sifre en az 8 karakter olmali';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Sifre tekrari gerekli';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Sifreler eslesmiyor';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setSuccessMessage('');

    try {
      const result = await AuthManager.register({
        fullName,
        email,
        password,
        confirmPassword,
      });

      setValidationErrors({});
      if (result.verification_url && typeof console !== 'undefined') {
        console.info('[DEV] Verification URL:', result.verification_url);
      }

      if (result.user && result.access) {
        setAuth(result.user, result.access);
        return;
      }

      setSuccessMessage(
        result.detail || 'Kaydin tamamlandi. Devam etmek icin giris yapabilirsin.'
      );
      navigation.navigate('Login', { email });
    } catch (error) {
      const apiErrors = normalizeApiErrors(error.response?.data);

      setValidationErrors({
        ...validationErrors,
        ...apiErrors,
      });
      setSuccessMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    const fieldSetters = {
      fullName: setFullName,
      email: setEmail,
      password: setPassword,
      confirmPassword: setConfirmPassword,
    };

    if (fieldSetters[field]) {
      fieldSetters[field](value);
      const newErrors = { ...validationErrors };
      delete newErrors[field];
      setValidationErrors(newErrors);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>EXCURSA</Text>
        <Text style={styles.subtitle}>Hesap olustur</Text>

        {validationErrors.general ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{validationErrors.general}</Text>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        <View>
          <TextInput
            style={[styles.input, validationErrors.fullName && styles.inputError]}
            placeholder="Ad Soyad"
            value={fullName}
            onChangeText={(text) => handleFieldChange('fullName', text)}
            autoCapitalize="words"
            editable={!isLoading}
            placeholderTextColor="#999"
          />
          {validationErrors.fullName ? (
            <Text style={styles.fieldError}>{validationErrors.fullName}</Text>
          ) : null}
        </View>

        <View>
          <TextInput
            style={[styles.input, validationErrors.email && styles.inputError]}
            placeholder="Email"
            value={email}
            onChangeText={(text) => handleFieldChange('email', text)}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!isLoading}
            placeholderTextColor="#999"
          />
          {validationErrors.email ? (
            <Text style={styles.fieldError}>{validationErrors.email}</Text>
          ) : null}
        </View>

        <View>
          <TextInput
            style={[styles.input, validationErrors.password && styles.inputError]}
            placeholder="Sifre"
            value={password}
            onChangeText={(text) => handleFieldChange('password', text)}
            secureTextEntry
            editable={!isLoading}
            placeholderTextColor="#999"
          />
          {validationErrors.password ? (
            <Text style={styles.fieldError}>{validationErrors.password}</Text>
          ) : null}
        </View>

        <View>
          <TextInput
            style={[styles.input, validationErrors.confirmPassword && styles.inputError]}
            placeholder="Sifre Tekrar"
            value={confirmPassword}
            onChangeText={(text) => handleFieldChange('confirmPassword', text)}
            secureTextEntry
            editable={!isLoading}
            placeholderTextColor="#999"
          />
          {validationErrors.confirmPassword ? (
            <Text style={styles.fieldError}>{validationErrors.confirmPassword}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Kayit Ol</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Zaten hesabin var mi? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isLoading}>
            <Text style={styles.link}>Giris yap</Text>
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
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  errorContainer: {
    width: '100%',
    backgroundColor: '#ffe6e6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#cc0000',
  },
  errorText: {
    color: '#cc0000',
    fontSize: 14,
  },
  successContainer: {
    width: '100%',
    backgroundColor: '#e7f8ec',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#1f8a4c',
  },
  successText: {
    color: '#1f8a4c',
    fontSize: 14,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  inputError: {
    borderColor: '#cc0000',
  },
  fieldError: {
    color: '#cc0000',
    fontSize: 12,
    marginBottom: 12,
    marginLeft: 4,
  },
  button: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  link: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
