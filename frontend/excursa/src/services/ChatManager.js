/**
 * ChatManager - Singleton Service for Chat Session Management
 * 
 * Responsibilities:
 * - Initialize and manage chat sessions
 * - Handle voice input/output coordination
 * - Persist conversation history to AsyncStorage
 * - Manage session lifecycle
 * 
 * Usage:
 * const manager = ChatManager.getInstance();
 * const session = await manager.startNewSession();
 * await manager.startVoiceSession();
 * await manager.saveHistory(messages);
 * await manager.clearHistory();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

class ChatManager {
  constructor() {
    this.sessionId = null;
    this.voiceListenerActive = false;
    this.conversationHistory = [];
    this.contextData = {}; // GPS coordinates and other context
  }

  /**
   * Singleton pattern - Get or create instance
   */
  static instance = null;

  static getInstance() {
    if (!ChatManager.instance) {
      ChatManager.instance = new ChatManager();
    }
    return ChatManager.instance;
  }

  /**
   * Initialize a new chat session
   * Generates unique session ID and stores it locally
   * 
   * Returns:
   * {
   *   sessionId: string (UUID)
   *   createdAt: ISO timestamp
   *   context: object with GPS data
   * }
   */
  async startNewSession(contextData = {}) {
    try {
      this.sessionId = uuidv4();
      this.contextData = contextData;
      this.conversationHistory = [];

      // Store session info locally
      const sessionInfo = {
        sessionId: this.sessionId,
        createdAt: new Date().toISOString(),
        context: contextData,
      };

      await AsyncStorage.setItem(
        `@chat_session_${this.sessionId}`,
        JSON.stringify(sessionInfo)
      );

      // Update last active session
      await AsyncStorage.setItem('@last_session_id', this.sessionId);

      console.log(`[ChatManager] New session started: ${this.sessionId}`);
      return sessionInfo;
    } catch (error) {
      console.error('[ChatManager] Error starting new session:', error);
      throw error;
    }
  }

  /**
   * Set current session to an existing backend session ID
   */
  async setActiveSession(sessionId, contextData = {}) {
    try {
      this.sessionId = sessionId;
      this.contextData = contextData;

      const sessionInfo = {
        sessionId: this.sessionId,
        createdAt: new Date().toISOString(),
        context: contextData,
      };

      await AsyncStorage.setItem(
        `@chat_session_${this.sessionId}`,
        JSON.stringify(sessionInfo)
      );
      await AsyncStorage.setItem('@last_session_id', this.sessionId);
      return sessionInfo;
    } catch (error) {
      console.error('[ChatManager] Error setting active session:', error);
      throw error;
    }
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Set GPS context for recommendations
   * Called when user location changes
   */
  setLocation(latitude, longitude) {
    this.contextData.location = {
      latitude,
      longitude,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Start voice input session
   * Coordinates microphone listening and speech-to-text
   */
  async startVoiceSession() {
    try {
      if (this.voiceListenerActive) {
        console.warn('[ChatManager] Voice session already active');
        return;
      }

      this.voiceListenerActive = true;
      console.log('[ChatManager] Voice session started');

      // Will trigger voice input - actual implementation depends on
      // react-native-speech-recognition or expo-speech-recognition
      // For now, just flag it as active
      return { success: true };
    } catch (error) {
      console.error('[ChatManager] Error starting voice session:', error);
      this.voiceListenerActive = false;
      throw error;
    }
  }

  /**
   * Stop voice input session
   */
  async stopVoiceSession() {
    try {
      this.voiceListenerActive = false;
      console.log('[ChatManager] Voice session stopped');
      return { success: true };
    } catch (error) {
      console.error('[ChatManager] Error stopping voice session:', error);
      throw error;
    }
  }

  /**
   * Check if voice session is active
   */
  isVoiceActive() {
    return this.voiceListenerActive;
  }

  /**
   * Save conversation history to AsyncStorage for offline access
   * 
   * Params:
   * - messages: Array of message objects
   */
  async saveHistory(messages) {
    try {
      if (!this.sessionId) {
        throw new Error('No active session');
      }

      const historyKey = `@chat_history_${this.sessionId}`;
      const history = {
        sessionId: this.sessionId,
        messages: messages,
        lastUpdated: new Date().toISOString(),
      };

      await AsyncStorage.setItem(historyKey, JSON.stringify(history));
      this.conversationHistory = messages;

      console.log(`[ChatManager] History saved: ${messages.length} messages`);
    } catch (error) {
      console.error('[ChatManager] Error saving history:', error);
      throw error;
    }
  }

  /**
   * Load conversation history from AsyncStorage
   * 
   * Params:
   * - sessionId: The session ID to load history for
   * 
   * Returns:
   * - Array of messages or empty array if not found
   */
  async loadHistory(sessionId) {
    try {
      const historyKey = `@chat_history_${sessionId}`;
      const data = await AsyncStorage.getItem(historyKey);

      if (!data) {
        return [];
      }

      const history = JSON.parse(data);
      this.conversationHistory = history.messages;

      console.log(`[ChatManager] History loaded: ${history.messages.length} messages`);
      return history.messages;
    } catch (error) {
      console.error('[ChatManager] Error loading history:', error);
      return [];
    }
  }

  /**
   * Clear entire conversation history
   * Removes both local storage and in-memory history
   */
  async clearHistory() {
    try {
      if (!this.sessionId) {
        throw new Error('No active session');
      }

      const historyKey = `@chat_history_${this.sessionId}`;
      await AsyncStorage.removeItem(historyKey);
      this.conversationHistory = [];

      console.log('[ChatManager] History cleared');
      return { success: true };
    } catch (error) {
      console.error('[ChatManager] Error clearing history:', error);
      throw error;
    }
  }

  /**
   * Get all saved sessions from AsyncStorage
   * Useful for session list/history view
   */
  async getAllSessions() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(key => key.startsWith('@chat_session_'));

      const sessions = await Promise.all(
        sessionKeys.map(async (key) => {
          const data = await AsyncStorage.getItem(key);
          return JSON.parse(data);
        })
      );

      return sessions.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );
    } catch (error) {
      console.error('[ChatManager] Error getting sessions:', error);
      return [];
    }
  }

  /**
   * Delete a specific session
   */
  async deleteSession(sessionId) {
    try {
      const sessionKey = `@chat_session_${sessionId}`;
      const historyKey = `@chat_history_${sessionId}`;

      await AsyncStorage.removeItem(sessionKey);
      await AsyncStorage.removeItem(historyKey);

      if (this.sessionId === sessionId) {
        this.sessionId = null;
        this.conversationHistory = [];
      }

      console.log(`[ChatManager] Session deleted: ${sessionId}`);
      return { success: true };
    } catch (error) {
      console.error('[ChatManager] Error deleting session:', error);
      throw error;
    }
  }

  /**
   * Send message (legacy - for backward compatibility)
   * Now handled by chatService.sendMessage()
   */
  async sendMessage(text) {
    // This is now handled by chatService and backend
    // Kept for backward compatibility
    console.warn('[ChatManager] sendMessage deprecated - use chatService.sendMessage()');
  }

  /**
   * Get context data for recommendations
   */
  getContextData() {
    return this.contextData;
  }

  /**
   * Update context data
   */
  setContextData(data) {
    this.contextData = { ...this.contextData, ...data };
  }

  /**
   * Get current session info
   */
  async getSessionInfo() {
    if (!this.sessionId) {
      return null;
    }

    try {
      const key = `@chat_session_${this.sessionId}`;
      const data = await AsyncStorage.getItem(key);
      return JSON.parse(data);
    } catch (error) {
      console.error('[ChatManager] Error getting session info:', error);
      return null;
    }
  }

  /**
   * Restore last session if available
   */
  async restoreLastSession() {
    try {
      const lastSessionId = await AsyncStorage.getItem('@last_session_id');
      if (!lastSessionId) {
        return null;
      }

      const sessionKey = `@chat_session_${lastSessionId}`;
      const data = await AsyncStorage.getItem(sessionKey);
      const sessionInfo = JSON.parse(data);

      this.sessionId = lastSessionId;
      this.contextData = sessionInfo.context || {};

      console.log(`[ChatManager] Last session restored: ${lastSessionId}`);
      return sessionInfo;
    } catch (error) {
      console.error('[ChatManager] Error restoring last session:', error);
      return null;
    }
  }
}

export default ChatManager;
