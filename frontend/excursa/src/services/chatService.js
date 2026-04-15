/**
 * Chat Service - API calls for chat endpoints
 * 
 * Handles all communication with the backend AI assistant API
 * Manages session creation, message sending, and history retrieval
 */

import api from './api';

export const chatService = {
  /**
   * Create a new chat session
   * 
   * Params:
   * - title (optional): Session title/topic
   * - context_data (optional): GPS coordinates and other context
   * 
   * Returns:
   * {
   *   id: UUID,
   *   session_id: string,
   *   title: string,
   *   context_data: object,
   *   created_at: ISO timestamp,
   *   updated_at: ISO timestamp
   * }
   */
  createSession: async (title = '', contextData = {}) => {
    try {
      const response = await api.post('/ai/sessions/', {
        session_id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title,
        context_data: contextData,
      });
      return response.data;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },

  /**
   * Get a specific chat session with all its messages
   * 
   * Params:
   * - sessionId: The session ID to fetch
   * 
   * Returns:
   * {
   *   id: UUID,
   *   session_id: string,
   *   title: string,
   *   context_data: object,
   *   messages: ChatMessage[],
   *   created_at: ISO timestamp,
   *   updated_at: ISO timestamp
   * }
   */
  getSession: async (sessionId) => {
    try {
      const response = await api.get(`/ai/sessions/${sessionId}/`);
      return response.data;
    } catch (error) {
      console.error('Error fetching session:', error);
      throw error;
    }
  },

  /**
   * Get list of user's chat sessions (paginated)
   * 
   * Params:
   * - page (optional): Page number (default: 1)
   * - pageSize (optional): Items per page (default: 20)
   * 
   * Returns:
   * {
   *   count: number,
   *   next: string (URL),
   *   previous: string (URL),
   *   results: ChatSession[]
   * }
   */
  listSessions: async (page = 1, pageSize = 20) => {
    try {
      const response = await api.get('/ai/sessions/', {
        params: {
          page: page,
          page_size: pageSize,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error listing sessions:', error);
      throw error;
    }
  },

  /**
   * Send a message in a specific session
   * Processes the message and returns bot response
   * 
   * Params:
   * - sessionId: The session to send message to
   * - message: Message object with:
   *   - type: 'user' or 'bot'
   *   - content: Message text
   *   - messageType: 'text', 'card', etc.
   *   - metadata (optional): Additional data
   * 
   * Returns:
   * {
   *   user_message: ChatMessage,
   *   bot_message: ChatMessage (if sender is user)
   * }
   */
  sendMessage: async (sessionId, message) => {
    try {
      const response = await api.post(
        `/ai/sessions/${sessionId}/send_message/`,
        {
          sender: message.type,
          message_type: message.messageType || 'text',
          content: message.content,
          metadata: message.metadata || {},
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  },

  /**
   * Get messages for a session with pagination
   * 
   * Params:
   * - sessionId: The session ID
   * - page (optional): Page number (default: 1)
   * - pageSize (optional): Items per page (default: 50)
   * 
   * Returns:
   * {
   *   count: number,
   *   page: number,
   *   page_size: number,
   *   results: ChatMessage[]
   * }
   */
  getMessages: async (sessionId, page = 1, pageSize = 50) => {
    try {
      const response = await api.get(
        `/ai/sessions/${sessionId}/messages/`,
        {
          params: {
            page: page,
            page_size: pageSize,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  },

  /**
   * Clear all messages in a session
   * 
   * Params:
   * - sessionId: The session ID to clear
   * 
   * Returns:
   * { status: 'History cleared' }
   */
  clearHistory: async (sessionId) => {
    try {
      const response = await api.post(
        `/ai/sessions/${sessionId}/clear_history/`
      );
      return response.data;
    } catch (error) {
      console.error('Error clearing history:', error);
      throw error;
    }
  },

  /**
   * Update session title or context_data
   * 
   * Params:
   * - sessionId: The session ID
   * - data: { title, context_data }
   * 
   * Returns:
   * Updated ChatSession object
   */
  updateSession: async (sessionId, data) => {
    try {
      const response = await api.patch(`/ai/sessions/${sessionId}/`, data);
      return response.data;
    } catch (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  },

  /**
   * Delete a chat session
   * 
   * Params:
   * - sessionId: The session ID to delete
   * 
   * Returns:
   * HTTP 204 (No Content)
   */
  deleteSession: async (sessionId) => {
    try {
      await api.delete(`/ai/sessions/${sessionId}/`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  },

  /**
   * Legacy endpoint for backward compatibility
   * Send message to chat API (non-session based)
   * 
   * Params:
   * - message: Message text
   * 
   * Returns:
   * {
   *   intent: string,
   *   response: string,
   *   history: array
   * }
   */
  legacyChatAPI: async (message) => {
    try {
      const response = await api.post('/ai/chat/', {
        message: message,
      }, { skipAuth: true });
      return response.data;
    } catch (error) {
      console.error('Error in legacy chat API:', error);
      throw error;
    }
  },

  /**
   * Batch fetch multiple messages by IDs
   * 
   * Params:
   * - messageIds: Array of message IDs to fetch
   * 
   * Returns:
   * {
   *   count: number,
   *   results: ChatMessage[]
   * }
   */
  getMessagesByIds: async (messageIds) => {
    try {
      const params = messageIds.map(id => `ids=${id}`).join('&');
      const response = await api.get(`/ai/messages/by_ids/?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching messages by IDs:', error);
      throw error;
    }
  },

  /**
   * Search chat history
   * 
   * Params:
   * - query: Search string
   * - sessionId (optional): Limit to specific session
   * 
   * Returns:
   * {
   *   count: number,
   *   results: ChatMessage[]
   * }
   */
  searchHistory: async (query, sessionId = null) => {
    try {
      const params = new URLSearchParams({ q: query });
      if (sessionId) {
        params.append('session_id', sessionId);
      }

      const response = await api.get(`/ai/messages/search/?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error searching history:', error);
      throw error;
    }
  },
};

export default chatService;
