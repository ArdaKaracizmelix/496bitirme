import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Animated
} from 'react-native';
import useAuthStore from '../../store/authStore';
import AuthManager from '../../services/AuthManager';

export default function LoginPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const setAuth = useAuthStore((state) => state.setAuth);

  /**
   * Validates email format using regex
   */
  const validateEmail = (text) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(text);
  };

  /**
   * Toggles password visibility
   */
  const toggleVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  /**
   * Handles login submission
   */
  const handleLogin = async () => {
    setErrorMessage('');

    // Validation
    if (!email.trim()) {
      setErrorMessage('Email adresi gerekli');
      return;
    }

    if (!validateEmail(email)) {
      setErrorMessage('Geçerli bir email adresi girin');
      return;
    }

    if (!password) {
      setErrorMessage('Şifre gerekli');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Şifre en az 6 karakter olmalı');
      return;
    }

    setIsLoading(true);
    try {
      const result = await AuthManager.login({ email, password });
      setAuth(result.user, result.access);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 
                       error.response?.data?.message ||
                       'Giriş başarısız. Bilgilerini kontrol et.';
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>EXCURSA</Text>
      <Text style={styles.subtitle}>Seyahatini keşfet</Text>

      {errorMessage ? (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{errorMessage}</Text>
        </View>
      ) : null}

      <TextInput
        style={[styles.input, email && !validateEmail(email) && styles.inputError]}
        placeholder="Email"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setErrorMessage('');
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor="#999"
        editable={!isLoading}
      />

      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Şifre"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setErrorMessage('');
          }}
          secureTextEntry={!isPasswordVisible}
          placeholderTextColor="#999"
          editable={!isLoading}
        />
        <TouchableOpacity
          onPress={toggleVisibility}
          style={styles.visibilityToggle}
          disabled={!password}
        >
          <Text style={styles.visibilityText}>
            {isPasswordVisible ? '👁️' : '👁️‍🗨️'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>Giriş Yap</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Hesabın yok mu? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isLoading}>
          <Text style={styles.link}>Kayıt ol</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
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
  error: {
    color: '#cc0000',
    fontSize: 14,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  inputError: {
    borderColor: '#cc0000',
  },
  passwordContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingRight: 12,
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
  },
  visibilityToggle: {
    padding: 8,
  },
  visibilityText: {
    fontSize: 20,
  },
  button: {
    width: '100%',
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
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