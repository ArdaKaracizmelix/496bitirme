import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://localhost:8000/api';
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
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add authorization token to requests
 */
api.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};

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
