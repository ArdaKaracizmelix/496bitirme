import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthManager from '../services/AuthManager';

/**
 * Auth Store using Zustand
 * Manages authentication state and user session data
 */
const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isInitializing: true, // Track app initialization

  /**
   * Set authentication state with user and token
   */
  setAuth: (user, token) => {
    global.accessToken = token;
    set({ 
      user, 
      token, 
      isAuthenticated: true,
      isInitializing: false,
    });
  },

  /**
   * Logout and clear authentication
   */
  logout: async () => {
    global.accessToken = null;
    set({ 
      user: null, 
      token: null, 
      isAuthenticated: false 
    });
    
    // Clear session from AuthManager
    await AuthManager.logout();
  },

  /**
   * Initialize authentication state from persistent storage
   * Called on app launch
   */
  initializeAuth: async () => {
    try {
      const { user, isAuthenticated } = await AuthManager.restoreSession();
      
      set({
        user,
        token: AuthManager.accessToken,
        isAuthenticated,
        isInitializing: false,
      });
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isInitializing: false,
      });
    }
  },

  /**
   * Update user profile in store
   */
  updateUser: (userData) => {
    set((state) => ({
      user: {
        ...state.user,
        ...userData,
      },
    }));
  },

  /**
   * Refresh token and update state
   */
  refreshUserToken: async () => {
    try {
      const success = await AuthManager.refreshToken();
      if (success) {
        set({ token: AuthManager.accessToken });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  },
}));

export default useAuthStore;
