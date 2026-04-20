import React, { useEffect, useMemo, useState } from 'react';
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
import { clearUserScopedCache } from '../../services/queryClient';
import useAuthStore from '../../store/authStore';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const translateLoginError = (error) => {
  if (!error.response) {
    return 'Backend sunucusuna ulasilamadi. Telefon ve bilgisayar ayni Wi-Fi aginda mi kontrol et.';
  }

  const detail = error.response?.data?.detail || error.response?.data?.message;
  if (error.response?.status === 403 || /verify/i.test(String(detail))) {
    return 'Giriş yapmadan önce e-posta adresini dogrulaman gerekiyor. Gelen kutunu kontrol et.';
  }
  if (error.response?.status === 401) {
    return 'Email veya şifre hatali. Bilgilerini kontrol edip tekrar dene.';
  }

  return detail || 'Giriş başarısız. Bilgilerini kontrol et.';
};

export default function LoginPage({ navigation, route }) {
  const [email, setEmail] = useState(route?.params?.email || '');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState(route?.params?.message || '');
  const setAuth = useAuthStore((state) => state.setAuth);
  const { width } = useWindowDimensions();

  const cardWidth = useMemo(() => Math.min(width - 32, 460), [width]);
  const isCompact = width < 380;
  const isNarrow = width < 340;

  useEffect(() => {
    if (route?.params?.email) setEmail(route.params.email);
    if (route?.params?.message) setInfoMessage(route.params.message);
  }, [route?.params?.email, route?.params?.message]);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setErrorMessage('');
    setInfoMessage('');

    if (!normalizedEmail) {
      setErrorMessage('Email adresi gerekli.');
      return;
    }
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setErrorMessage('Gecerli bir email adresi gir.');
      return;
    }
    if (!password) {
      setErrorMessage('Şifre gerekli.');
      return;
    }

    setIsLoading(true);
    try {
      clearUserScopedCache();
      const result = await AuthManager.login({ email: normalizedEmail, password });
      clearUserScopedCache();
      setAuth(result.user, result.access);
    } catch (error) {
      setErrorMessage(translateLoginError(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isCompact && styles.scrollContentCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.card, isCompact && styles.cardCompact, isNarrow && styles.cardNarrow, { width: cardWidth }]}>
            <View style={[styles.brandMark, isCompact && styles.brandMarkCompact]}>
              <Text style={[styles.brandMarkText, isCompact && styles.brandMarkTextCompact]}>E</Text>
            </View>
            <Text style={[styles.brand, isCompact && styles.brandCompact]}>EXCURSA</Text>
            <Text style={[styles.title, isCompact && styles.titleCompact]}>Tekrar hos geldin</Text>
            <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
              Rotalarina, kayitli gezilerine ve seyahat akışina kaldigin yerden devam et.
            </Text>

            {infoMessage ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>E-posta dogrulamasi bekleniyor</Text>
                <Text style={styles.infoText}>{infoMessage}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, email && !EMAIL_REGEX.test(email.trim()) && styles.inputError]}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setErrorMessage('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholderTextColor="#9a9184"
                editable={!isLoading}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Şifre</Text>
              <View style={[styles.passwordShell, isNarrow && styles.passwordShellNarrow]}>
                <TextInput
                  style={[styles.passwordInput, isNarrow && styles.passwordInputNarrow]}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setErrorMessage('');
                  }}
                  secureTextEntry={!isPasswordVisible}
                  placeholderTextColor="#9a9184"
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={[styles.visibilityButton, isNarrow && styles.visibilityButtonNarrow]}
                  onPress={() => setIsPasswordVisible((value) => !value)}
                  disabled={!password || isLoading}
                >
                  <Text style={[styles.visibilityText, isNarrow && styles.visibilityTextNarrow]}>
                    {isPasswordVisible ? 'Gizle' : 'Goster'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Giriş Yap</Text>
              )}
            </TouchableOpacity>

            <View style={[styles.footer, isNarrow && styles.footerCompact]}>
              <Text style={[styles.footerText, isNarrow && styles.footerTextCompact]}>Hesabın yok mu?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isLoading}>
                <Text style={styles.footerLink}>Kayıt ol</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  scrollContentCompact: {
    justifyContent: 'flex-start',
    paddingVertical: 18,
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
  cardCompact: {
    borderRadius: 26,
    padding: 20,
  },
  cardNarrow: {
    padding: 16,
  },
  brandMark: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    marginBottom: 18,
  },
  brandMarkCompact: {
    width: 48,
    height: 48,
    borderRadius: 17,
    marginBottom: 14,
  },
  brandMarkText: {
    color: '#d7c49e',
    fontSize: 22,
    fontWeight: '900',
  },
  brandMarkTextCompact: {
    fontSize: 20,
  },
  brand: {
    color: '#9b8356',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  brandCompact: {
    fontSize: 11,
    letterSpacing: 1.5,
  },
  title: {
    color: '#1a1a2e',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  titleCompact: {
    fontSize: 25,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 22,
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  infoBox: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#eef7ef',
    borderWidth: 1,
    borderColor: '#c8e6cf',
    marginBottom: 14,
  },
  infoTitle: {
    color: '#1f7a43',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3,
  },
  infoText: {
    color: '#2f6844',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
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
    marginBottom: 14,
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
  passwordShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2d7c7',
    borderRadius: 18,
    backgroundColor: '#f7f3ea',
  },
  passwordShellNarrow: {
    alignItems: 'stretch',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 14,
    color: '#1a1a2e',
    fontSize: 15,
  },
  passwordInputNarrow: {
    paddingHorizontal: 12,
  },
  visibilityButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  visibilityButtonNarrow: {
    paddingHorizontal: 10,
  },
  visibilityText: {
    color: '#9b8356',
    fontSize: 12,
    fontWeight: '900',
  },
  visibilityTextNarrow: {
    fontSize: 11,
  },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    marginTop: 6,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
  },
  footerCompact: {
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 18,
  },
  footerText: {
    color: '#81786b',
    fontSize: 13,
    fontWeight: '700',
  },
  footerTextCompact: {
    textAlign: 'center',
  },
  footerLink: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
