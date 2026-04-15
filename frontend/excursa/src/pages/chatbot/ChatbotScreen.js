/**
 * ChatbotScreen - Main UI Component for AI Assistant
 * 
 * Features:
 * - Real-time chat with AI assistant
 * - Voice interaction support
 * - Quick reply suggestions
 * - Message typing indicator
 * - Conversation history management
 * - Rich message rendering (text, cards, suggestions)
 * 
 * State Management:
 * - messages: Array of ChatMessage objects
 * - inputText: Current input field value
 * - isTyping: Indicator for bot typing status
 * - isVoiceActive: Microphone listening state
 * - sessionId: Current conversation session ID
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import ChatManager from '../../services/ChatManager';
import chatService from '../../services/chatService';
import TTSEngine from '../../services/TTSEngine';
import locationService from '../../services/locationService';

const QUICK_REPLIES = [
  'İstanbul\'da ne gezmeliyim?',
  'Yakınımdaki restoranlar',
  'Tarihi yerler öner',
  'Bütçe dostu rotalar',
];

const TABLE_SEPARATOR_REGEX = /^(\s*\|?\s*:?-{3,}:?\s*\|)+\s*$/;
const GENERIC_PLACE_LABELS = new Set([
  'bolge',
  'önerilen yerler',
  'onerilen yerler',
  'neden ziyaret edilmeli',
  'şehir merkezi',
  'sehir merkezi',
  'kültür & sanat',
  'kultur & sanat',
  'kultur sanat',
  'kültür sanat',
]);

const formatBotText = (content) => {
  if (typeof content !== 'string') {
    return '';
  }

  // Normalize common LLM formatting artifacts for plain Text rendering.
  let text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1');

  text = text
    .split('\n')
    .filter((line) => !TABLE_SEPARATOR_REGEX.test(line.trim()))
    .map((line) => {
      const trimmed = line.trim();
      const pipeCount = (trimmed.match(/\|/g) || []).length;

      // Convert markdown table rows into bullet lines.
      if (pipeCount >= 2 && trimmed.includes('|')) {
        const cells = trimmed
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean);
        if (cells.length > 1) {
          return `• ${cells.join(' - ')}`;
        }
      }

      return line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
};

const normalizeKey = (text) =>
  String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s&-]/gu, '')
    .trim();

const extractSuggestedPlaceNames = (content) => {
  if (typeof content !== 'string' || !content.trim()) return [];

  const candidates = [];
  const boldMatches = [...content.matchAll(/\*\*([^*]{2,60})\*\*/g)];
  for (const match of boldMatches) {
    candidates.push(match[1].trim());
  }

  // Fallback extraction from common list patterns (e.g., "• Anıtkabir - ...")
  const lines = content.split('\n');
  for (const line of lines) {
    const bulletMatch = line.match(/^[\s•-]*([^–\-|:]{3,50})\s*[–\-|:]/u);
    if (bulletMatch) candidates.push(bulletMatch[1].trim());
  }

  const deduped = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = normalizeKey(item);
    if (!key || GENERIC_PLACE_LABELS.has(key) || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, 5);
};

/**
 * ChatbotScreen Component
 * 
 * Props:
 * - sessionId (optional): Pre-existing session ID to load
 * - onNavigateToPOI (optional): Callback when user wants to view a POI
 * - onNavigateToItinerary (optional): Callback when user wants to add to itinerary
 */
export default function ChatbotScreen({ sessionId, onNavigateToPOI, onNavigateToItinerary }) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const chatManagerRef = useRef(null);
  const ttsEngineRef = useRef(null);
  const speechRecognitionRef = useRef(null);

  // State Management
  const [messages, setMessages] = useState([
    {
      id: '1',
      type: 'bot',
      messageType: 'text',
      content: 'Merhaba! Ben EXCURSA\'nın AI asistanıyım. 🌍 Size seyahat planlaması, mekan önerileri ve tarihi bilgiler konusunda yardımcı olabilirim. Ne öğrenmek istersiniz?',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      metadata: {},
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(true);
  const [isAutoSpeakEnabled, setIsAutoSpeakEnabled] = useState(false);
  const [isSpeechPlaying, setIsSpeechPlaying] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [addToRouteModalVisible, setAddToRouteModalVisible] = useState(false);
  const [selectedPlaceName, setSelectedPlaceName] = useState('');
  const [itineraries, setItineraries] = useState([]);
  const [selectedItinerary, setSelectedItinerary] = useState(null);
  const [isAddingToRoute, setIsAddingToRoute] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);

  const handleStopSpeech = useCallback(async () => {
    try {
      if (ttsEngineRef.current) {
        await ttsEngineRef.current.stop();
      }
    } catch (error) {
      console.error('Error stopping speech:', error);
    } finally {
      setIsSpeechPlaying(false);
      setSpeakingMessageId(null);
    }
  }, []);

  const speakText = useCallback(async (text, messageId = null) => {
    if (!text || !ttsEngineRef.current) return;
    try {
      setIsSpeechPlaying(true);
      setSpeakingMessageId(messageId);
      await ttsEngineRef.current.speak(text);
    } catch (error) {
      console.error('Error speaking message:', error);
    } finally {
      setIsSpeechPlaying(false);
      setSpeakingMessageId(null);
    }
  }, []);

  // Initialize services
  useEffect(() => {
    chatManagerRef.current = ChatManager.getInstance();
    ttsEngineRef.current = new TTSEngine();

    // Configure browser speech recognition for web.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass();
        recognition.lang = 'tr-TR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsVoiceActive(true);
        };

        recognition.onresult = (event) => {
          const transcript = event?.results?.[0]?.[0]?.transcript?.trim();
          if (!transcript) return;

          setInputText(transcript);
          handleSendMessage(transcript);
        };

        recognition.onerror = async (event) => {
          console.error('Voice recognition error:', event?.error || event);
          setIsVoiceActive(false);
          await chatManagerRef.current?.stopVoiceSession();
        };

        recognition.onend = async () => {
          setIsVoiceActive(false);
          await chatManagerRef.current?.stopVoiceSession();
        };

        speechRecognitionRef.current = recognition;
        setIsVoiceSupported(true);
      } else {
        setIsVoiceSupported(false);
      }
    }

    const bootstrapSession = async () => {
      // Priority: explicit prop session -> last active session -> new session.
      if (sessionId) {
        await loadSession(sessionId);
        return;
      }

      const restoredSession = await chatManagerRef.current.restoreLastSession();
      if (restoredSession?.sessionId) {
        await loadSession(restoredSession.sessionId);
        return;
      }

      await initializeNewSession();
    };

    bootstrapSession();

    return () => {
      // Cleanup on unmount
      if (speechRecognitionRef.current && Platform.OS === 'web') {
        try {
          speechRecognitionRef.current.onresult = null;
          speechRecognitionRef.current.onerror = null;
          speechRecognitionRef.current.onend = null;
          speechRecognitionRef.current.stop();
        } catch (error) {
          console.error('Error cleaning up speech recognition:', error);
        }
      }
      if (ttsEngineRef.current) {
        ttsEngineRef.current.cleanup();
      }
      setIsSpeechPlaying(false);
    };
  }, []);

  // Stop ongoing speech/recognition when screen loses focus (e.g., tab switch).
  useFocusEffect(
    useCallback(() => {
      return () => {
        handleStopSpeech();
        if (speechRecognitionRef.current && Platform.OS === 'web') {
          try {
            speechRecognitionRef.current.stop();
          } catch (error) {
            console.error('Error stopping speech recognition on blur:', error);
          }
        }
        setIsVoiceActive(false);
      };
    }, [handleStopSpeech])
  );

  /**
   * Initialize a new chat session
   */
  const initializeNewSession = async () => {
    try {
      setIsLoading(true);
      const backendSession = await chatService.createSession('AI Chat Session');
      await chatManagerRef.current.setActiveSession(
        backendSession.id,
        backendSession.context_data || {}
      );
      setCurrentSessionId(backendSession.id);
      // Save initial messages to local storage
      await chatManagerRef.current.saveHistory(messages);
    } catch (error) {
      console.error('Error initializing session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load an existing chat session
   */
  const loadSession = async (id) => {
    try {
      setIsLoading(true);
      const sessionData = await chatService.getSession(id);
      
      // Load messages from session
      const formattedMessages = sessionData.messages.map(msg => ({
        id: msg.id,
        type: msg.sender,
        messageType: msg.message_type,
        content: msg.content,
        timestamp: new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        metadata: msg.metadata || {},
        intent: msg.intent,
        confidence: msg.confidence,
      }));

      setMessages(formattedMessages);
      setCurrentSessionId(id);
      await chatManagerRef.current.setActiveSession(id, sessionData.context_data || {});
    } catch (error) {
      console.error('Error loading session:', error);
      await initializeNewSession();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle sending a message
   */
  const handleSendMessage = async (text) => {
    if (!text.trim() || isTyping || !currentSessionId) return;

    // Create user message object
    const userMessage = {
      id: Date.now().toString(),
      type: 'user',
      messageType: 'text',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      metadata: {},
    };

    // Add user message to state
    let nextMessages = [];
    setMessages(prev => {
      nextMessages = [...prev, userMessage];
      return nextMessages;
    });
    setInputText('');
    setIsTyping(true);

    try {
      // Send message to backend
      const response = await chatService.sendMessage(
        currentSessionId,
        userMessage
      );

      // Add bot response to state
      if (response.bot_message) {
        const botMessage = {
          id: response.bot_message.id,
          type: 'bot',
          messageType: response.bot_message.message_type,
          content: response.bot_message.content,
          timestamp: new Date(response.bot_message.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          metadata: response.bot_message.metadata || {},
          intent: response.bot_message.intent,
          confidence: response.bot_message.confidence,
        };

        setMessages(prev => {
          nextMessages = [...prev, botMessage];
          return nextMessages;
        });

        // Speak response only when auto-speak is enabled.
        if (isAutoSpeakEnabled && botMessage.content) {
          await speakText(botMessage.content, botMessage.id);
        }
      }

      // Save conversation history
      await chatManagerRef.current.saveHistory(nextMessages);
    } catch (error) {
      console.error('Error sending message:', error);
      // Show error message in chat
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'bot',
        messageType: 'text',
        content: 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        metadata: {},
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  /**
   * Handle voice input
   */
  const handleStartVoiceSession = async () => {
    try {
      if (!isVoiceSupported) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: 'bot',
            messageType: 'text',
            content: 'Bu tarayıcı sesli girişi desteklemiyor.',
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            metadata: {},
          },
        ]);
        return;
      }

      if (isVoiceActive) {
        if (Platform.OS === 'web' && speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
        }
        await chatManagerRef.current.stopVoiceSession();
        setIsVoiceActive(false);
        return;
      }

      await chatManagerRef.current.startVoiceSession();

      if (Platform.OS === 'web') {
        if (!speechRecognitionRef.current) {
          setIsVoiceActive(false);
          await chatManagerRef.current.stopVoiceSession();
          return;
        }
        speechRecognitionRef.current.start();
        return;
      }

      // Native voice recognition not yet wired; keep explicit active indicator.
      setIsVoiceActive(true);
    } catch (error) {
      console.error('Error starting voice session:', error);
      setIsVoiceActive(false);
    }
  };

  /**
   * Handle quick reply press
   */
  const handleQuickReplyPress = (text) => {
    handleSendMessage(text);
  };

  const handleSpeakMessage = async (messageId, text) => {
    if (isSpeechPlaying && speakingMessageId === messageId) {
      await handleStopSpeech();
      return;
    }

    await speakText(text, messageId);
  };

  const openAddToRouteModal = async (placeName) => {
    try {
      setSelectedPlaceName(placeName);
      setSelectedItinerary(null);
      setAddToRouteModalVisible(true);

      const itinerariesData = await locationService.fetchUserItineraries();
      const editableItineraries = (itinerariesData.results || []).filter(
        (itinerary) => itinerary.status === 'DRAFT' || itinerary.status === 'ACTIVE'
      );
      setItineraries(editableItineraries);
    } catch (error) {
      console.error('Error loading itineraries:', error);
      Alert.alert('Hata', 'Rotalar yüklenemedi.');
    }
  };

  const addPlaceToSelectedRoute = async () => {
    if (!selectedPlaceName || !selectedItinerary) {
      Alert.alert('Hata', 'Lütfen bir rota seçin.');
      return;
    }

    try {
      setIsAddingToRoute(true);
      const searchResult = await locationService.searchPOIs(selectedPlaceName);
      const poiResults = searchResult?.results || [];

      if (poiResults.length === 0) {
        Alert.alert('Bulunamadı', `"${selectedPlaceName}" için uygun bir yer bulunamadı.`);
        return;
      }

      const normalizedTarget = normalizeKey(selectedPlaceName);
      const bestPoi =
        poiResults.find((poi) => normalizeKey(poi.name) === normalizedTarget) ||
        poiResults[0];

      const existingStops = selectedItinerary.total_stops ?? selectedItinerary.stops?.length ?? 0;
      const nextOrder = existingStops;

      await locationService.addPOIToItinerary(
        selectedItinerary.id,
        bestPoi.id,
        nextOrder
      );

      Alert.alert('Başarılı', `${bestPoi.name} rotaya eklendi.`);
      setAddToRouteModalVisible(false);
      setSelectedItinerary(null);
    } catch (error) {
      console.error('Error adding place to route:', error);
      Alert.alert('Hata', 'Yer rotaya eklenemedi.');
    } finally {
      setIsAddingToRoute(false);
    }
  };

  /**
   * Render individual message
   */
  const renderMessageItem = ({ item }) => {
    return (
      <View
        style={[
          styles.messageContainer,
          item.type === 'user' ? styles.userMessageContainer : styles.botMessageContainer,
        ]}
      >
        {item.type === 'bot' && (
          <View style={styles.botAvatar}>
            <Text style={styles.botAvatarText}>🌍</Text>
          </View>
        )}

        <View
          style={[
            styles.messageBubble,
            item.type === 'user' ? styles.userBubble : styles.botBubble,
          ]}
        >
          {renderMessageItem_Content(item)}
        </View>
      </View>
    );
  };

  /**
   * Render message content based on type
   */
  const renderMessageItem_Content = (item) => {
    switch (item.messageType) {
      case 'card':
        return renderCardMessage(item);
      case 'suggestion':
        return renderSuggestionMessage(item);
      default:
        return (
          <>
            <Text
              style={[
                styles.messageText,
                item.type === 'user' ? styles.userMessageText : styles.botMessageText,
              ]}
            >
              {item.type === 'bot' ? formatBotText(item.content) : item.content}
            </Text>
            <View style={styles.messageMetaRow}>
              <Text style={styles.messageTime}>{item.timestamp}</Text>
              {item.type === 'bot' && (
                <TouchableOpacity
                  style={styles.speakButton}
                  onPress={() => handleSpeakMessage(item.id, item.content)}
                >
                  <Text style={styles.speakButtonText}>
                    {isSpeechPlaying && speakingMessageId === item.id ? '⏹' : '🔊'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {item.type === 'bot' && (() => {
              const places = extractSuggestedPlaceNames(item.content);
              if (places.length === 0) return null;
              return (
                <View style={styles.placeActionsRow}>
                  {places.map((place) => (
                    <TouchableOpacity
                      key={`${item.id}-${place}`}
                      style={styles.addToRouteChip}
                      onPress={() => openAddToRouteModal(place)}
                    >
                      <Text style={styles.addToRouteChipText}>+ {place} • Rotaya Ekle</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </>
        );
    }
  };

  /**
   * Render card-type message (POI suggestion, etc.)
   */
  const renderCardMessage = (item) => {
    const card = item.metadata;
    return (
      <View>
        {card.title && <Text style={styles.cardTitle}>{card.title}</Text>}
        {card.description && <Text style={styles.cardDescription}>{card.description}</Text>}
        {card.rating && (
          <Text style={styles.cardRating}>⭐ {card.rating.toFixed(1)}</Text>
        )}
        {card.actions && (
          <View style={styles.cardActions}>
            {card.actions.map(action => (
              <TouchableOpacity
                key={action.id}
                style={styles.cardActionButton}
                onPress={() => {
                  if (action.type === 'navigate_poi' && onNavigateToPOI) {
                    onNavigateToPOI(action.poiId);
                  } else if (action.type === 'add_itinerary' && onNavigateToItinerary) {
                    onNavigateToItinerary(action.poiId);
                  }
                }}
              >
                <Text style={styles.cardActionText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.messageMetaRow}>
          <Text style={styles.messageTime}>{item.timestamp}</Text>
          {item.type === 'bot' && (
            <TouchableOpacity
              style={styles.speakButton}
              onPress={() => handleSpeakMessage(item.id, item.content)}
            >
              <Text style={styles.speakButtonText}>
                {isSpeechPlaying && speakingMessageId === item.id ? '⏹' : '🔊'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  /**
   * Render suggestion-type message (quick replies)
   */
  const renderSuggestionMessage = (item) => {
    const suggestions = item.metadata.suggestions || [];
    return (
      <View>
        <Text
          style={[
            styles.messageText,
            item.type === 'user' ? styles.userMessageText : styles.botMessageText,
          ]}
        >
          {item.type === 'bot' ? formatBotText(item.content) : item.content}
        </Text>
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionChip}
              onPress={() => handleSendMessage(suggestion)}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.messageMetaRow}>
          <Text style={styles.messageTime}>{item.timestamp}</Text>
          {item.type === 'bot' && (
            <TouchableOpacity
              style={styles.speakButton}
              onPress={() => handleSpeakMessage(item.id, item.content)}
            >
              <Text style={styles.speakButtonText}>
                {isSpeechPlaying && speakingMessageId === item.id ? '⏹' : '🔊'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  /**
   * Render typing indicator
   */
  const renderTypingIndicator = () => {
    if (!isTyping) return null;

    return (
      <View style={styles.typingContainer}>
        <View style={styles.botAvatar}>
          <Text style={styles.botAvatarText}>🌍</Text>
        </View>
        <View style={styles.typingBubble}>
          <Text style={styles.typingDot}>●</Text>
          <Text style={styles.typingDot}>●</Text>
          <Text style={styles.typingDot}>●</Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
        <Text style={styles.loadingText}>Session yükleniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>🌍</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>EXCURSA Asistan</Text>
            <Text style={styles.headerSubtitle}>AI Seyahat Rehberi</Text>
          </View>
        </View>
        <View style={styles.onlineBadge}>
          <TouchableOpacity
            style={[
              styles.ttsToggleButton,
              isAutoSpeakEnabled && styles.ttsToggleButtonActive,
            ]}
            onPress={() => setIsAutoSpeakEnabled((prev) => !prev)}
          >
            <Text style={styles.ttsToggleText}>{isAutoSpeakEnabled ? '🔊 Otomatik' : '🔇 Otomatik'}</Text>
          </TouchableOpacity>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Çevrimiçi</Text>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={renderTypingIndicator()}
      />

      {/* Quick Replies */}
      {messages.length < 3 && (
        <View style={styles.quickRepliesContainer}>
          <FlatList
            data={QUICK_REPLIES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.quickReply}
                onPress={() => handleQuickReplyPress(item)}
              >
                <Text style={styles.quickReplyText}>{item}</Text>
              </TouchableOpacity>
            )}
            horizontal
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}

      {/* Input Area */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Bir şey sorun..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            editable={!isTyping}
          />
          <TouchableOpacity
            style={[
              styles.voiceButton,
              isVoiceActive && styles.voiceButtonActive,
              !isVoiceSupported && styles.voiceButtonDisabled,
            ]}
            onPress={handleStartVoiceSession}
            disabled={isTyping}
          >
            <Text style={styles.voiceButtonIcon}>{isVoiceActive ? '⏹' : '🎙️'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isTyping) && styles.sendButtonDisabled,
            ]}
            onPress={() => handleSendMessage(inputText)}
            disabled={!inputText.trim() || isTyping}
          >
            <Text style={styles.sendButtonText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={addToRouteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddToRouteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rotaya Ekle</Text>
            <Text style={styles.modalSubtitle}>Yer: {selectedPlaceName}</Text>

            {itineraries.length === 0 ? (
              <Text style={styles.emptyRouteText}>Eklenebilir rota bulunamadı.</Text>
            ) : (
              <View style={styles.itineraryList}>
                {itineraries.map((itinerary) => (
                  <TouchableOpacity
                    key={itinerary.id}
                    style={[
                      styles.itineraryOption,
                      selectedItinerary?.id === itinerary.id && styles.itineraryOptionSelected,
                    ]}
                    onPress={() => setSelectedItinerary(itinerary)}
                  >
                    <Text style={styles.itineraryOptionTitle}>{itinerary.title}</Text>
                    <Text style={styles.itineraryOptionMeta}>
                      {itinerary.total_stops ?? itinerary.stops?.length ?? 0} durak
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setAddToRouteModalVisible(false)}
                disabled={isAddingToRoute}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  (!selectedItinerary || isAddingToRoute) && styles.modalConfirmButtonDisabled,
                ]}
                onPress={addPlaceToSelectedRoute}
                disabled={!selectedItinerary || isAddingToRoute}
              >
                <Text style={styles.modalConfirmText}>
                  {isAddingToRoute ? 'Ekleniyor...' : 'Ekle'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  // Header Styles
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 22,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ttsToggleButton: {
    backgroundColor: '#f1f3f5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  ttsToggleButtonActive: {
    backgroundColor: '#e8f4ff',
    borderWidth: 1,
    borderColor: '#1a73e8',
  },
  ttsToggleText: {
    fontSize: 11,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#27ae60',
  },
  onlineText: {
    fontSize: 12,
    color: '#27ae60',
  },

  // Messages List
  messagesList: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  botMessageContainer: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  botAvatarText: {
    fontSize: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#1a1a2e',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    color: '#aaa',
    alignSelf: 'flex-end',
  },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  speakButton: {
    backgroundColor: '#eef4ff',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  speakButtonText: {
    fontSize: 11,
    color: '#1a1a2e',
  },
  placeActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  addToRouteChip: {
    backgroundColor: '#edf7ed',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2e7d32',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addToRouteChipText: {
    fontSize: 11,
    color: '#1b5e20',
    fontWeight: '600',
  },

  // Card Message Styles
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
    lineHeight: 19,
  },
  cardRating: {
    fontSize: 13,
    color: '#f39c12',
    marginBottom: 8,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  cardActionButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },

  // Suggestion Message Styles
  suggestionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  suggestionChip: {
    backgroundColor: '#e8e8ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  suggestionText: {
    fontSize: 12,
    color: '#1a1a2e',
    fontWeight: '500',
  },

  // Typing Indicator
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  typingBubble: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  typingDot: {
    fontSize: 12,
    color: '#999',
  },

  // Quick Replies
  quickRepliesContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  quickReply: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  quickReplyText: {
    fontSize: 12,
    color: '#1a1a2e',
    fontWeight: '500',
  },

  // Input Area
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: '#1a1a2e',
  },
  voiceButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: '#ffe8e8',
    borderWidth: 1,
    borderColor: '#d32f2f',
  },
  voiceButtonDisabled: {
    opacity: 0.4,
  },
  voiceButtonIcon: {
    fontSize: 18,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
  },
  emptyRouteText: {
    color: '#666',
    marginBottom: 12,
  },
  itineraryList: {
    maxHeight: 220,
    marginBottom: 12,
  },
  itineraryOption: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  itineraryOptionSelected: {
    borderColor: '#1a73e8',
    backgroundColor: '#eef4ff',
  },
  itineraryOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  itineraryOptionMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#666',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f1f1',
  },
  modalCancelText: {
    color: '#333',
    fontWeight: '600',
  },
  modalConfirmButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1a73e8',
  },
  modalConfirmButtonDisabled: {
    backgroundColor: '#9bbce8',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '700',
  },
});
