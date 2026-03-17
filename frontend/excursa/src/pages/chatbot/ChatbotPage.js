import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';

const QUICK_REPLIES = [
  'İstanbul\'da ne gezmeliyim?',
  'Yakınımdaki restoranlar',
  'Tarihi yerler öner',
  'Bütçe dostu rotalar',
];

const MOCK_RESPONSES = {
  'istanbul': 'İstanbul\'da mutlaka görmeniz gereken yerler: Ayasofya, Topkapı Sarayı, Kapalıçarşı, Galata Kulesi ve Boğaz turu! Hangi kategoriyle ilgileniyorsunuz?',
  'restoran': 'Yakınınızdaki popüler restoranlar: Pandeli (Tarihi Mısır Çarşısı), Karaköy Lokantası, Mikla Restaurant. Bütçeniz nedir?',
  'tarihi': 'İstanbul\'un en önemli tarihi yerleri: Ayasofya (MS 537), Topkapı Sarayı (1459), Dolmabahçe Sarayı (1856), Kapalıçarşı (1461). Detaylı bilgi almak istediğiniz yer var mı?',
  'bütçe': 'Bütçe dostu rota önerim: Sultanahmet\'te yürüyüş (ücretsiz), Kapalıçarşı gezisi (ücretsiz), Boğaz vapuru (₺15), Eminönü balık ekmek (₺25). Toplam yaklaşık ₺100!',
  'default': 'Sizi doğru anlayamadım. Mekan önerisi, rota planlaması veya tarihi bilgi için bana sorabilirsiniz! 🗺️',
};

function getBotResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes('istanbul') || lower.includes('gez')) return MOCK_RESPONSES['istanbul'];
  if (lower.includes('restoran') || lower.includes('yemek') || lower.includes('yakın')) return MOCK_RESPONSES['restoran'];
  if (lower.includes('tarihi') || lower.includes('müze') || lower.includes('saray')) return MOCK_RESPONSES['tarihi'];
  if (lower.includes('bütçe') || lower.includes('ucuz') || lower.includes('ekonomik')) return MOCK_RESPONSES['bütçe'];
  return MOCK_RESPONSES['default'];
}

export default function ChatbotPage() {
  const [messages, setMessages] = useState([
    {
      id: '1',
      type: 'bot',
      text: 'Merhaba! Ben EXCURSA\'nın AI asistanıyım. 🌍 Size seyahat planlaması, mekan önerileri ve tarihi bilgiler konusunda yardımcı olabilirim. Ne öğrenmek istersiniz?',
      time: 'Şimdi',
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);

  const sendMessage = (text) => {
    if (!text.trim()) return;

    const userMessage = {
      id: String(Date.now()),
      type: 'user',
      text: text.trim(),
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    setTimeout(() => {
      const botMessage = {
        id: String(Date.now() + 1),
        type: 'bot',
        text: getBotResponse(text),
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, botMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageContainer,
      item.type === 'user' ? styles.userMessageContainer : styles.botMessageContainer
    ]}>
      {item.type === 'bot' && (
        <View style={styles.botAvatar}>
          <Text style={styles.botAvatarText}>🌍</Text>
        </View>
      )}
      <View style={[
        styles.messageBubble,
        item.type === 'user' ? styles.userBubble : styles.botBubble
      ]}>
        <Text style={[
          styles.messageText,
          item.type === 'user' ? styles.userMessageText : styles.botMessageText
        ]}>
          {item.text}
        </Text>
        <Text style={styles.messageTime}>{item.time}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
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
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>Çevrimiçi</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isTyping ? (
            <View style={styles.typingContainer}>
              <View style={styles.botAvatar}>
                <Text style={styles.botAvatarText}>🌍</Text>
              </View>
              <View style={styles.typingBubble}>
                <Text style={styles.typingText}>yazıyor...</Text>
              </View>
            </View>
          ) : null
        }
      />

      <View style={styles.quickRepliesContainer}>
        <FlatList
          data={QUICK_REPLIES}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.quickReply}
              onPress={() => sendMessage(item)}
            >
              <Text style={styles.quickReplyText}>{item}</Text>
            </TouchableOpacity>
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
        />
      </View>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Bir şey sorun..."
          value={inputText}
          onChangeText={setInputText}
          multiline
          onSubmitEditing={() => sendMessage(inputText)}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={() => sendMessage(inputText)}
          disabled={!inputText.trim()}
        >
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { fontSize: 22 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#1a1a2e' },
  headerSubtitle: { fontSize: 12, color: '#888' },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#27ae60' },
  onlineText: { fontSize: 12, color: '#27ae60' },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageContainer: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  userMessageContainer: { justifyContent: 'flex-end' },
  botMessageContainer: { justifyContent: 'flex-start' },
  botAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  botAvatarText: { fontSize: 16 },
  messageBubble: { maxWidth: '75%', borderRadius: 16, padding: 12 },
  userBubble: { backgroundColor: '#1a1a2e', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  messageText: { fontSize: 15, lineHeight: 22 },
  userMessageText: { color: '#fff' },
  botMessageText: { color: '#333' },
  messageTime: { fontSize: 11, color: '#aaa', marginTop: 4, alignSelf: 'flex-end' },
  typingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  typingBubble: { backgroundColor: '#fff', borderRadius: 16, padding: 12, borderBottomLeftRadius: 4 },
  typingText: { fontSize: 14, color: '#888', fontStyle: 'italic' },
  quickRepliesContainer: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  quickReply: { backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  quickReplyText: { fontSize: 13, color: '#1a1a2e', fontWeight: '500' },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#ccc' },
  sendButtonText: { color: '#fff', fontSize: 18 },
});