import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const envApiUrl =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) || '';
const envApiPort =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_PORT) || '8000';
const DEFAULT_PROD_API_URL = 'https://excursa.onrender.com/api';

const normalizeApiUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizeApiPath = (pathname = '') => {
  const trimmed = String(pathname || '').replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') {
    return '/api';
  }
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const parseApiUrl = (value) => {
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
};

const getExpoDevHost = () => {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants?.manifest?.debuggerHost ||
    '';
  const host = String(hostUri).split(':')[0].trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return '';
  }
  return host;
};

const isLoopbackHost = (hostname = '') =>
  hostname === 'localhost' || hostname === '127.0.0.1';

const resolveApiUrl = () => {
  const normalizedEnvUrl = normalizeApiUrl(envApiUrl);
  const envUrl = parseApiUrl(normalizedEnvUrl);
  if (envUrl) {
    // Expo Go on a physical phone cannot access computer backend via localhost.
    if (Platform.OS !== 'web' && isLoopbackHost(envUrl.hostname)) {
      const expoHost = getExpoDevHost();
      if (expoHost) {
        envUrl.hostname = expoHost;
        envUrl.port = envUrl.port || envApiPort;
      }
    }
    envUrl.pathname = normalizeApiPath(envUrl.pathname);
    return envUrl.toString().replace(/\/+$/, '');
  }

  if (normalizedEnvUrl && typeof console !== 'undefined') {
    console.warn('[API] Invalid EXPO_PUBLIC_API_URL. Falling back to auto host detection.');
  }

  // Standalone builds can miss local dev host detection; prefer stable production backend.
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return DEFAULT_PROD_API_URL;
  }

  if (Platform.OS !== 'web') {
    const expoHost = getExpoDevHost();
    if (expoHost) {
      return `http://${expoHost}:${envApiPort}/api`;
    }
  }

  // Web fallback: keep host/protocol, but point to backend port (default 8000),
  // so requests don't accidentally hit Expo dev server port (e.g. 8081/19006).
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${envApiPort}/api`;
  }

  return 'http://localhost:8000/api';
};

const API_URL = resolveApiUrl();
if (typeof console !== 'undefined') {
  console.info('[API] baseURL:', API_URL);
}
const ACCESS_TOKEN_KEY = '@excursa_access_token';
const REFRESH_TOKEN_KEY = '@excursa_refresh_token';
const USER_PROFILE_KEY = '@excursa_user_profile';

let refreshPromise = null;

const sanitizeToken = (value) => {
  if (!value || typeof value !== 'string') return null;
  return value.replace(/^['"]+|['"]+$/g, '').trim() || null;
};

const clearAuthState = async () => {
  global.accessToken = null;
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_PROFILE_KEY]);

  try {
    const useAuthStore = (await import('../store/authStore')).default;
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  } catch (err) {
    // Store import can fail in some test/runtime contexts; storage cleanup is still enough.
  }
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add authorization token to requests
 */
api.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};

  // Let axios/runtime set multipart boundaries for FormData payloads.
  const isMultipartPayload =
    config?.forceMultipart === true ||
    (typeof FormData !== 'undefined' && config.data instanceof FormData) ||
    !!(config?.data && typeof config.data === 'object' && Array.isArray(config.data._parts));

  if (isMultipartPayload) {
    if (config.headers['Content-Type']) {
      delete config.headers['Content-Type'];
    }
    if (config.headers['content-type']) {
      delete config.headers['content-type'];
    }
  }

  if (config.skipAuth) {
    if (config.headers.Authorization) {
      delete config.headers.Authorization;
    }
    return config;
  }

  let token = sanitizeToken(global.accessToken);

  // Fallback for app refresh / hot reload where in-memory token is lost.
  if (!token) {
    token = sanitizeToken(await AsyncStorage.getItem(ACCESS_TOKEN_KEY));
    if (token) {
      global.accessToken = token;
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * Response interceptor: Handle token expiration and refresh
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config || {};

    if (originalRequest?.skipAuth) {
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized (token expired)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !String(originalRequest.url || '').includes('/user/token/refresh/')
    ) {
      originalRequest._retry = true;

      try {
        // Ensure parallel 401s share one refresh flow.
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const refreshToken = sanitizeToken(await AsyncStorage.getItem(REFRESH_TOKEN_KEY));
            if (!refreshToken) {
              throw new Error('No refresh token available');
            }

            const response = await axios.post(
              `${API_URL}/user/token/refresh/`,
              { refresh: refreshToken },
              {
                timeout: 12000,
                headers: { 'Content-Type': 'application/json' },
              }
            );

            const access = sanitizeToken(response?.data?.access);
            if (!access) {
              throw new Error('Refresh response did not include access token');
            }

            global.accessToken = access;
            await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access);
            return access;
          })().finally(() => {
            refreshPromise = null;
          });
        }

        const access = await refreshPromise;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${access}`;
        return api(originalRequest);
      } catch (refreshError) {
        await clearAuthState();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
