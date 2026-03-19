import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add authorization token to requests
 */
api.interceptors.request.use(async (config) => {
  let token = global.accessToken;

  // Fallback for app refresh / hot reload where in-memory token is lost.
  if (!token) {
    token = await AsyncStorage.getItem('@excursa_access_token');
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
    const originalRequest = error.config;

    // Handle 401 Unauthorized (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the token
        const refreshToken = await AsyncStorage.getItem('@excursa_refresh_token');
        
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/user/token/refresh/`, {
            refresh: refreshToken,
          });

          const { access } = response.data;
          
          // Update global access token
          global.accessToken = access;
          
          // Save new token
          await AsyncStorage.setItem('@excursa_access_token', access);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${access}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, user needs to login again
        global.accessToken = null;
        await AsyncStorage.removeItem('@excursa_access_token');
        await AsyncStorage.removeItem('@excursa_refresh_token');
        await AsyncStorage.removeItem('@excursa_user_profile');
        
        // Dispatch logout action - you might want to emit an event here
        // For now, the app will handle this through the auth check
      }
    }

    return Promise.reject(error);
  }
);

export default api;
