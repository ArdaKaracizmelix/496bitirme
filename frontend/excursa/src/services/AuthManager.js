import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

/**
 * AuthManager - Singleton Service for Authentication & Session Management
 * 
 * Acts as a bridge between UI components and the Backend API.
 * Handles:
 * - Login/Registration/Logout
 * - Token storage and retrieval
 * - Token refresh logic
 * - Session persistence
 */
class AuthManager {
  // Storage Keys
  static STORAGE_KEY_TOKEN = '@excursa_access_token';
  static STORAGE_KEY_REFRESH = '@excursa_refresh_token';
  static STORAGE_KEY_USER = '@excursa_user_profile';

  // Instance variables
  userProfile = null;
  accessToken = null;
  refreshToken = null;

  /**
   * Login with credentials
   * @param {Object} credentials - { email, password }
   * @returns {Promise<{user: Object, access: String, refresh: String}>}
   */
  async login(credentials) {
    try {
      const response = await api.post(
        '/user/login/',
        {
          email: credentials.email,
          password: credentials.password,
        },
        { skipAuth: true }
      );

      const { user, access, refresh } = response.data;

      // Save tokens and user data
      await this.saveSession({ user, access, refresh });

      return { user, access, refresh };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Register new user
   * @param {Object} data - { full_name, email, password }
   * @returns {Promise<{detail: String, email: String}>}
   */
  async register(data) {
    try {
      const response = await api.post(
        '/user/register/',
        {
          full_name: data.fullName,
          email: data.email,
          password: data.password,
          confirm_password: data.confirmPassword,
        },
        { skipAuth: true }
      );

      const { user, access, refresh } = response.data || {};
      if (user && access) {
        await this.saveSession({ user, access, refresh });
      }

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Submit user interest preferences
   * @param {Array<Number>} tagIds - Array of selected interest tag IDs
   * @returns {Promise<Object>}
   */
  async submitInterestPreferences(tagIds) {
    try {
      const response = await api.post('/user/interests/', {
        interest_ids: tagIds,
      });

      // Update local user profile
      const preferenceKeys = response.data.preference_keys ||
        (response.data.interests || []).map((item) => item?.name || item).filter(Boolean);

      this.userProfile = {
        ...this.userProfile,
        interests: preferenceKeys,
        has_interests: true,
      };

      // Update stored user profile
      await AsyncStorage.setItem(
        AuthManager.STORAGE_KEY_USER,
        JSON.stringify(this.userProfile)
      );

      return {
        ...response.data,
        user: this.userProfile,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch available interest tags from backend
   * @returns {Promise<Array>}
   */
  async fetchAvailableInterests() {
    try {
      const response = await api.get('/user/interests/available/');
      return response.data.interests || response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch diagnostics for interest source (live Table A vs snapshot fallback).
   * Temporary debug helper.
   */
  async fetchInterestSourceHealth() {
    try {
      const response = await api.get('/user/interests/health/');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update current user's editable profile fields.
   * @param {Object} data - { full_name?, bio?, avatar_url? }
   * @returns {Promise<Object>} updated user payload
   */
  async updateProfile(data) {
    try {
      const response = await api.patch('/user/me/', data);
      const updatedUser = response?.data?.user;
      if (!updatedUser) {
        throw new Error('Invalid profile update response');
      }

      this.userProfile = updatedUser;
      await AsyncStorage.setItem(
        AuthManager.STORAGE_KEY_USER,
        JSON.stringify(updatedUser)
      );

      return updatedUser;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Logout and clear session
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      const refresh = this.refreshToken || await AsyncStorage.getItem(AuthManager.STORAGE_KEY_REFRESH);
      // Call logout endpoint if backend requires it
      await api.post('/user/logout/', { refresh });
    } catch (error) {
      // Continue logout even if API call fails
      console.warn('Logout API call failed:', error);
    }

    // Clear local state
    await this.clearSession();
  }

  /**
   * Save session tokens and user profile to persistent storage
   * @param {Object} data - { user, access, refresh }
   * @returns {Promise<void>}
   */
  async saveSession(data) {
    try {
      const { user, access, refresh } = data;

      this.userProfile = user;
      this.accessToken = access;
      this.refreshToken = refresh;

      // Store in AsyncStorage for persistence
      await AsyncStorage.multiSet([
        [AuthManager.STORAGE_KEY_TOKEN, access],
        [AuthManager.STORAGE_KEY_REFRESH, refresh || ''],
        [AuthManager.STORAGE_KEY_USER, JSON.stringify(user)],
      ]);

      // Update global token for api interceptors
      global.accessToken = access;
    } catch (error) {
      console.error('Failed to save session:', error);
      throw error;
    }
  }

  /**
   * Clear session data
   * @returns {Promise<void>}
   */
  async clearSession() {
    try {
      await AsyncStorage.multiRemove([
        AuthManager.STORAGE_KEY_TOKEN,
        AuthManager.STORAGE_KEY_REFRESH,
        AuthManager.STORAGE_KEY_USER,
      ]);

      this.userProfile = null;
      this.accessToken = null;
      this.refreshToken = null;
      global.accessToken = null;
    } catch (error) {
      console.error('Failed to clear session:', error);
      throw error;
    }
  }

  /**
   * Retrieve valid access token
   * If current token is expired, attempts to refresh it
   * @returns {Promise<String|null>}
   */
  async getToken() {
    try {
      // Check if we have a valid token in memory
      if (this.accessToken) {
        return this.accessToken;
      }

      // Try to retrieve from storage
      const storedToken = await AsyncStorage.getItem(AuthManager.STORAGE_KEY_TOKEN);
      if (storedToken) {
        this.accessToken = storedToken;
        global.accessToken = storedToken;
        return storedToken;
      }

      // Token is missing/expired
      return null;
    } catch (error) {
      console.error('Failed to get token:', error);
      return null;
    }
  }

  /**
   * Refresh the access token using refresh token
   * @returns {Promise<Boolean>}
   */
  async refreshToken() {
    try {
      let refreshToken = this.refreshToken;

      // Try to get refresh token from storage if not in memory
      if (!refreshToken) {
        refreshToken = await AsyncStorage.getItem(AuthManager.STORAGE_KEY_REFRESH);
      }

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await api.post(
        '/user/token/refresh/',
        {
          refresh: refreshToken,
        },
        { skipAuth: true }
      );

      const { access } = response.data;

      // Update tokens
      this.accessToken = access;
      global.accessToken = access;

      // Store new access token
      await AsyncStorage.setItem(AuthManager.STORAGE_KEY_TOKEN, access);

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      // If refresh fails, clear session
      await this.clearSession();
      return false;
    }
  }

  /**
   * Check if user is authenticated
   * Does a quick check for token existence
   * @returns {Promise<Boolean>}
   */
  async isAuthenticated() {
    try {
      const token = await AsyncStorage.getItem(AuthManager.STORAGE_KEY_TOKEN);
      return !!token;
    } catch (error) {
      return false;
    }
  }

  /**
   * Restore user session from persistent storage
   * Called on app launch
   * @returns {Promise<{user: Object|null, isAuthenticated: Boolean}>}
   */
  async restoreSession() {
    try {
      const [storedToken, storedUser, storedRefresh] = await AsyncStorage.multiGet([
        AuthManager.STORAGE_KEY_TOKEN,
        AuthManager.STORAGE_KEY_USER,
        AuthManager.STORAGE_KEY_REFRESH,
      ]);

      if (storedToken[1]) {
        this.accessToken = storedToken[1];
        this.refreshToken = storedRefresh[1] || null;
        global.accessToken = storedToken[1];

        if (storedUser[1]) {
          this.userProfile = JSON.parse(storedUser[1]);
        }

        return {
          user: this.userProfile,
          isAuthenticated: true,
        };
      }

      return {
        user: null,
        isAuthenticated: false,
      };
    } catch (error) {
      console.error('Failed to restore session:', error);
      return {
        user: null,
        isAuthenticated: false,
      };
    }
  }
}

// Export singleton instance
export default new AuthManager();
