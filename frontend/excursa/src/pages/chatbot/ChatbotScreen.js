import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatManager from '../../services/ChatManager';
import chatService from '../../services/chatService';

const COLORS = {
  bg: '#f7f3ec',
  surface: '#fffdf8',
  surfaceStrong: '#ffffff',
  ink: '#17172a',
  muted: '#77736d',
  line: '#ece4d8',
  brand: '#17172a',
  brandSoft: '#ece8ff',
  accent: '#c06f38',
  success: '#2c8a5d',
  danger: '#b93c3c',
};

const QUICK_REPLIES = [
  "İstanbul'da 2 günlük rota yap",
  'Sanliurfa tarihi gezi plani',
  'Ankara tarihi yerler oner',
  'Yemek odakli rota hazirla',
];

const createWelcomeMessage = () => ({
  id: `welcome-${Date.now()}`,
  type: 'bot',
  messageType: 'text',
  content:
    'Merhaba, ben Excursa Asistan. Şehir, gun sayisi ve ilgi alanini yaz; sana gun gun, okunabilir bir gezi plani hazirlayayim.',
  timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  metadata: {},
});

const formatBotText = (content) => {
  if (typeof content !== 'string') return '';
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const normalizeMessage = (msg) => ({
  id: msg.id,
  type: msg.sender || msg.type,
  messageType: msg.message_type || msg.messageType || 'text',
  content: msg.content || '',
  timestamp: msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : msg.timestamp || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  metadata: msg.metadata || {},
  intent: msg.intent,
  confidence: msg.confidence,
});

export default function ChatbotScreen({ sessionId, navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef(null);
  const chatManagerRef = useRef(null);

  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [inputText, setInputText] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const shellStyle = useMemo(
    () => [
      styles.shell,
      width >= 860 && styles.shellWide,
    ],
    [width]
  );

  const visibleMessages = messages.length ? messages : [createWelcomeMessage()];
  const canClear = visibleMessages.length > 1 && !isSending && !isClearing;

  const handleBackToFeed = useCallback(() => {
    if (navigation?.navigate) {
      navigation.navigate('Social');
    }
  }, [navigation]);

  const persistHistory = useCallback(async (nextMessages) => {
    try {
      await chatManagerRef.current?.saveHistory(nextMessages);
    } catch (error) {
      console.error('Failed to persist chat history:', error);
    }
  }, []);

  const initializeNewSession = useCallback(async () => {
    const welcome = createWelcomeMessage();
    const backendSession = await chatService.createSession('Excursa Assistant');
    await chatManagerRef.current?.setActiveSession(
      backendSession.id,
      backendSession.context_data || {}
    );
    setCurrentSessionId(backendSession.id);
    setMessages([welcome]);
    await persistHistory([welcome]);
  }, [persistHistory]);

  const loadSession = useCallback(async (id) => {
    const sessionData = await chatService.getSession(id);
    const formatted = (sessionData.messages || []).map(normalizeMessage);
    const nextMessages = formatted.length ? formatted : [createWelcomeMessage()];
    setMessages(nextMessages);
    setCurrentSessionId(id);
    await chatManagerRef.current?.setActiveSession(id, sessionData.context_data || {});
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      chatManagerRef.current = ChatManager.getInstance();
      try {
        setIsLoading(true);
        if (sessionId) {
          await loadSession(sessionId);
          return;
        }

        const restored = await chatManagerRef.current.restoreLastSession();
        if (restored?.sessionId) {
          await loadSession(restored.sessionId);
          return;
        }

        await initializeNewSession();
      } catch (error) {
        console.error('Error bootstrapping chat:', error);
        if (mounted) {
          await initializeNewSession();
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [initializeNewSession, loadSession, sessionId]);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages, isSending]);

  const handleSendMessage = useCallback(async (text = inputText) => {
    const content = String(text || '').trim();
    if (!content || isSending || !currentSessionId) return;

    const userMessage = {
      id: `local-${Date.now()}`,
      type: 'user',
      messageType: 'text',
      content,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      metadata: {},
    };

    const optimisticMessages = [...visibleMessages, userMessage];
    setMessages(optimisticMessages);
    setInputText('');
    setIsSending(true);

    try {
      const response = await chatService.sendMessage(currentSessionId, userMessage);
      const botMessage = response?.bot_message
        ? normalizeMessage(response.bot_message)
        : {
            id: `bot-${Date.now()}`,
            type: 'bot',
            messageType: 'text',
            content: 'Cevap olusturuldu ama mesaj formati okunamadi. Lutfen tekrar dener misin?',
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            metadata: {},
          };
      const nextMessages = [...optimisticMessages, botMessage];
      setMessages(nextMessages);
      await persistHistory(nextMessages);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        id: `error-${Date.now()}`,
        type: 'bot',
        messageType: 'text',
        content: 'Asistan servisine ulasilamadi. Biraz sonra tekrar deneyebilirsin.',
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        metadata: {},
      };
      const nextMessages = [...optimisticMessages, errorMessage];
      setMessages(nextMessages);
      await persistHistory(nextMessages);
    } finally {
      setIsSending(false);
    }
  }, [currentSessionId, inputText, isSending, persistHistory, visibleMessages]);

  const clearChat = useCallback(async () => {
    if (!currentSessionId || isClearing) return;

    setConfirmVisible(false);
    setIsClearing(true);
    try {
      await chatService.clearHistory(currentSessionId);
      await chatManagerRef.current?.clearHistory();
      const welcome = createWelcomeMessage();
      setMessages([welcome]);
      setInputText('');
      await persistHistory([welcome]);
    } catch (error) {
      console.error('Error clearing chat:', error);
      Alert.alert('Temizlenemedi', 'Sohbet temizlenirken bir hata oluştu. Lutfen tekrar deneyin.');
    } finally {
      setIsClearing(false);
    }
  }, [currentSessionId, isClearing, persistHistory]);

  const renderMessage = ({ item }) => {
    const isUser = item.type === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.botRow]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>EX</Text>
          </View>
        )}

        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
            {isUser ? item.content : formatBotText(item.content)}
          </Text>
          <Text style={[styles.messageTime, isUser ? styles.userTime : styles.botTime]}>
            {item.timestamp}
          </Text>
        </View>
      </View>
    );
  };

  const renderTyping = () => {
    if (!isSending) return null;
    return (
      <View style={[styles.messageRow, styles.botRow]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>EX</Text>
        </View>
        <View style={[styles.bubble, styles.typingBubble]}>
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotMiddle]} />
          <View style={styles.dot} />
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>Seyahat asistanin hazirlaniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <View style={shellStyle}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.headerIdentity}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToFeed}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="akışa don"
            >
              <Text style={styles.backButtonText}>‹</Text>
            </TouchableOpacity>
            <View style={styles.headerIcon}>
              <Text style={styles.headerIconText}>EX</Text>
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Excursa Asistan</Text>
              <Text style={styles.headerSubtitle}>Rota, yer ve gezi plani rehberi</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.clearButton, !canClear && styles.clearButtonDisabled]}
            onPress={() => setConfirmVisible(true)}
            disabled={!canClear}
            activeOpacity={0.78}
          >
            <Text style={[styles.clearButtonText, !canClear && styles.clearButtonTextDisabled]}>
              {isClearing ? 'Temizleniyor' : 'Temizle'}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={renderTyping}
        />

        {visibleMessages.length <= 1 && (
          <View style={styles.quickRepliesContainer}>
            <FlatList
              data={QUICK_REPLIES}
              keyExtractor={(item) => item}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.quickReply}
                  onPress={() => handleSendMessage(item)}
                  disabled={isSending}
                  activeOpacity={0.78}
                >
                  <Text style={styles.quickReplyText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.inputShell}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              editable={!isSending}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isSending) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() || isSending}
              activeOpacity={0.82}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Sohbeti temizle?</Text>
            <Text style={styles.confirmText}>
              Bu ekrandaki mesajlar ve backend sohbet gecmisi temizlenecek. Bu işlem geri alınamaz.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelAction}
                onPress={() => setConfirmVisible(false)}
                activeOpacity={0.78}
              >
                <Text style={styles.cancelActionText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.destructiveAction}
                onPress={clearChat}
                activeOpacity={0.78}
              >
                <Text style={styles.destructiveActionText}>Temizle</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  shell: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: COLORS.bg,
  },
  shellWide: {
    maxWidth: 820,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.line,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderColor: COLORS.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceStrong,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backButtonText: {
    color: COLORS.ink,
    fontSize: 30,
    lineHeight: 31,
    fontWeight: '800',
    marginTop: -2,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.brand,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  headerIconText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  headerCopy: {
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  clearButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surfaceStrong,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  clearButtonDisabled: {
    opacity: 0.45,
  },
  clearButtonText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  clearButtonTextDisabled: {
    color: COLORS.muted,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    marginBottom: 14,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  botRow: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    marginTop: 2,
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: COLORS.brand,
    borderBottomRightRadius: 7,
  },
  botBubble: {
    backgroundColor: COLORS.surfaceStrong,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderBottomLeftRadius: 7,
    shadowColor: '#4c3a28',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 23,
  },
  userText: {
    color: '#fff',
    fontWeight: '600',
  },
  botText: {
    color: COLORS.ink,
    fontWeight: '600',
  },
  messageTime: {
    marginTop: 7,
    fontSize: 10,
    fontWeight: '700',
    alignSelf: 'flex-end',
  },
  userTime: {
    color: 'rgba(255,255,255,0.68)',
  },
  botTime: {
    color: COLORS.muted,
  },
  typingBubble: {
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    opacity: 0.55,
  },
  dotMiddle: {
    opacity: 1,
  },
  quickRepliesContainer: {
    borderTopWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickReply: {
    marginRight: 9,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: '#ded7ff',
  },
  quickReplyText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  inputArea: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    backgroundColor: COLORS.surfaceStrong,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingLeft: 15,
    paddingRight: 8,
    paddingVertical: 8,
    shadowColor: '#4c3a28',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 112,
    color: COLORS.ink,
    fontSize: 15,
    lineHeight: 21,
    paddingVertical: Platform.OS === 'ios' ? 9 : 7,
    fontWeight: '600',
  },
  sendButton: {
    minWidth: 72,
    height: 42,
    borderRadius: 18,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  sendButtonDisabled: {
    backgroundColor: '#c9c4bb',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 17, 14, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceStrong,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  confirmTitle: {
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  confirmText: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  confirmActions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelAction: {
    borderRadius: 14,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  cancelActionText: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  destructiveAction: {
    borderRadius: 14,
    backgroundColor: COLORS.danger,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  destructiveActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
});
