import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AuthManager from '../../services/AuthManager';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (data.detail || data.message) return { general: data.detail || data.message };

  return Object.entries(data).reduce((acc, [field, value]) => {
    const message = normalizeApiErrorItem(value);
    if (message) acc[field] = message;
    return acc;
  }, {});
};

const translateError = (message) => {
  const value = String(message || '');
  const lower = value.toLowerCase();
  if (lower.includes('email already exists')) return 'Bu email adresi ile kayitli bir hesap var.';
  if (lower.includes('uppercase')) return 'Sifre en az bir buyuk harf icermeli.';
  if (lower.includes('number')) return 'Sifre en az bir rakam icermeli.';
  if (lower.includes('passwords do not match')) return 'Sifreler eslesmiyor.';
  if (lower.includes('full name')) return 'Ad soyad alanini kontrol et.';
  return value;
};

export default function RegisterPage({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [registeredEmail, setRegisteredEmail] = useState('');
  const { width } = useWindowDimensions();

  const cardWidth = useMemo(() => Math.min(width - 32, 480), [width]);
  const isSuccess = !!registeredEmail;

  const validateForm = () => {
    const errors = {};
    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim()) {
      errors.fullName = 'Ad soyad gerekli.';
    } else if (fullName.trim().length < 2) {
      errors.fullName = 'Ad soyad en az 2 karakter olmali.';
    }

    if (!normalizedEmail) {
      errors.email = 'Email adresi gerekli.';
    } else if (!EMAIL_REGEX.test(normalizedEmail)) {
      errors.email = 'Gecerli bir email adresi gir.';
    }

    if (!password) {
      errors.password = 'Sifre gerekli.';
    } else if (password.length < 8) {
      errors.password = 'Sifre en az 8 karakter olmali.';
    } else if (!/[A-Z]/.test(password)) {
      errors.password = 'Sifre en az bir buyuk harf icermeli.';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'Sifre en az bir rakam icermeli.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Sifre tekrari gerekli.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Sifreler eslesmiyor.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (isLoading || !validateForm()) return;

    setIsLoading(true);
    setValidationErrors({});

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await AuthManager.register({
        fullName: fullName.trim(),
        email: normalizedEmail,
        password,
        confirmPassword,
      });

      if (result?.verification_url && typeof console !== 'undefined') {
        console.info('[DEV] Verification URL:', result.verification_url);
      }

      setRegisteredEmail(result?.email || normalizedEmail);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      const apiErrors = normalizeApiErrors(error.response?.data);
      const translated = Object.entries(apiErrors).reduce((acc, [field, message]) => {
        acc[field] = translateError(message);
        return acc;
      }, {});

      setValidationErrors(translated);
      setRegisteredEmail('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    const setters = {
      fullName: setFullName,
      email: setEmail,
      password: setPassword,
      confirmPassword: setConfirmPassword,
    };

    setters[field]?.(value);
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.general;
      return next;
    });
  };

  const goToLogin = () => {
    navigation.navigate('Login', {
      email: registeredEmail || email.trim().toLowerCase(),
      message: 'Hesabini olusturduk. Giris yapabilmek icin e-postana gelen dogrulama baglantisini onayla.',
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, { width: cardWidth }]}>
            <View style={styles.topPill}>
              <Text style={styles.topPillText}>Yeni yolculuk</Text>
            </View>
            <Text style={styles.brand}>EXCURSA</Text>
            <Text style={styles.title}>
              {isSuccess ? 'Mailini kontrol et' : 'Hesap olustur'}
            </Text>
            <Text style={styles.subtitle}>
              {isSuccess
                ? 'Kaydini aldik. Guvenlik icin giris yapmadan once e-posta dogrulamani tamamlamalisin.'
                : 'Seyahat akisina katil, rotalarini kaydet ve gezginlerle paylas.'}
            </Text>

            {isSuccess ? (
              <View style={styles.successPanel}>
                <View style={styles.mailIcon}>
                  <Text style={styles.mailIconText}>@</Text>
                </View>
                <Text style={styles.successTitle}>Dogrulama e-postasi gonderildi</Text>
                <Text style={styles.successText}>
                  {registeredEmail} adresine gelen dogrulama baglantisini onayla.
                  Onaydan sonra login ekranindan giris yapabilirsin.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={goToLogin} activeOpacity={0.9}>
                  <Text style={styles.primaryButtonText}>Login ekranina git</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {validationErrors.general ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{validationErrors.general}</Text>
                  </View>
                ) : null}

                <AuthField
                  label="Ad Soyad"
                  value={fullName}
                  error={validationErrors.fullName}
                  editable={!isLoading}
                  onChangeText={(text) => handleFieldChange('fullName', text)}
                  autoCapitalize="words"
                />

                <AuthField
                  label="Email"
                  value={email}
                  error={validationErrors.email}
                  editable={!isLoading}
                  onChangeText={(text) => handleFieldChange('email', text)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />

                <PasswordField
                  label="Sifre"
                  value={password}
                  placeholder="En az 8 karakter"
                  error={validationErrors.password}
                  editable={!isLoading}
                  visible={isPasswordVisible}
                  onToggleVisible={() => setIsPasswordVisible((value) => !value)}
                  onChangeText={(text) => handleFieldChange('password', text)}
                />

                <PasswordField
                  label="Sifre Tekrar"
                  value={confirmPassword}
                  placeholder="Sifreni tekrar gir"
                  error={validationErrors.confirmPassword}
                  editable={!isLoading}
                  visible={isConfirmVisible}
                  onToggleVisible={() => setIsConfirmVisible((value) => !value)}
                  onChangeText={(text) => handleFieldChange('confirmPassword', text)}
                />

                <View style={styles.hintBox}>
                  <Text style={styles.hintText}>
                    Kayit sonrasi otomatik giris yapilmaz. Once e-postani dogrulaman gerekir.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleRegister}
                  disabled={isLoading}
                  activeOpacity={0.9}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Kayit Ol</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Zaten hesabin var mi?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={isLoading}>
                <Text style={styles.footerLink}>Giris yap</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthField({ label, error, ...inputProps }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholderTextColor="#9a9184"
        {...inputProps}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PasswordField({ label, error, visible, onToggleVisible, ...inputProps }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordShell, error && styles.inputError]}>
        <TextInput
          style={styles.passwordInput}
          secureTextEntry={!visible}
          placeholderTextColor="#9a9184"
          {...inputProps}
        />
        <TouchableOpacity
          style={styles.visibilityButton}
          onPress={onToggleVisible}
          disabled={!inputProps.value || !inputProps.editable}
        >
          <Text style={styles.visibilityText}>{visible ? 'Gizle' : 'Goster'}</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    paddingVertical: 28,
  },
  card: {
    borderRadius: 32,
    padding: 24,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#ebe1d1',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 5,
  },
  topPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1a1a2e',
    marginBottom: 18,
  },
  topPillText: {
    color: '#d7c49e',
    fontSize: 12,
    fontWeight: '900',
  },
  brand: {
    color: '#9b8356',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  title: {
    color: '#1a1a2e',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },
  errorBox: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#ffe8e8',
    borderWidth: 1,
    borderColor: '#ffd0d0',
    marginBottom: 14,
  },
  errorText: {
    color: '#bd2b2b',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  fieldGroup: {
    marginBottom: 13,
  },
  label: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2d7c7',
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: '#1a1a2e',
    fontSize: 15,
    backgroundColor: '#f7f3ea',
  },
  inputError: {
    borderColor: '#d84a4a',
  },
  fieldError: {
    color: '#bd2b2b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  passwordShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2d7c7',
    borderRadius: 18,
    backgroundColor: '#f7f3ea',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: '#1a1a2e',
    fontSize: 15,
  },
  visibilityButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  visibilityText: {
    color: '#9b8356',
    fontSize: 12,
    fontWeight: '900',
  },
  hintBox: {
    borderRadius: 18,
    padding: 13,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#eadfce',
    marginTop: 2,
    marginBottom: 14,
  },
  hintText: {
    color: '#746b5e',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    marginTop: 4,
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  successPanel: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#eef7ef',
    borderWidth: 1,
    borderColor: '#c8e6cf',
  },
  mailIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f7a43',
    marginBottom: 14,
  },
  mailIconText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  successTitle: {
    color: '#1f7a43',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 7,
  },
  successText: {
    color: '#2f6844',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
  },
  footerText: {
    color: '#81786b',
    fontSize: 13,
    fontWeight: '700',
  },
  footerLink: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
