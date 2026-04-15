import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, TextInput, Image, ScrollView
} from 'react-native';

const MOCK_POSTS = [    // NOTE: Mock data degistirmeye calistim da burayi mazur gorelim.
  {
    id: '1',
    user: { name: 'Berkay Yasin zaXD', avatar: 'https://i.pravatar.cc/150?img=1' },
    location: '',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Hagia_Sophia_Mars_2013.jpg/640px-Hagia_Sophia_Mars_2013.jpg',
    caption: 'NAMAZ KILDIM SUPERDI 🕌',
    likes: 124,
    comments: 18,
    timeAgo: '2 saat önce',
    liked: false,
  },
  {
    id: '2',
    user: { name: 'Arda knkm', avatar: 'https://i.pravatar.cc/150?img=5' },
    location: 'Galata Kulesi, İstanbul',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Galata_tower_and_bridge.jpg/640px-Galata_tower_and_bridge.jpg',
    caption: 'İstanbul\'un en güzel manzarası buradan görülür. ❤️',
    likes: 89,
    comments: 12,
    timeAgo: '5 saat önce',
    liked: true,
  },
  {
    id: '3',
    user: { name: 'Mehmet Demir', avatar: 'https://i.pravatar.cc/150?img=3' },
    location: 'Kapalıçarşı, İstanbul',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Großer_Bazar_Istanbul.jpg/640px-Großer_Bazar_Istanbul.jpg',
    caption: 'Renklerin ve kokuların büyüsüne kapıldım. Alışveriş cenneti! 🛍️',
    likes: 203,
    comments: 31,
    timeAgo: '1 gün önce',
    liked: false,
  },
];

const MOCK_STORIES = [
  { id: '1', name: 'Sen', avatar: 'https://i.pravatar.cc/150?img=10', isOwn: true },
  { id: '2', name: 'Arda', avatar: 'https://i.pravatar.cc/150?img=6' },
  { id: '3', name: 'Cem', avatar: 'https://i.pravatar.cc/150?img=7' },
  { id: '4', name: 'Kaan', avatar: 'https://i.pravatar.cc/150?img=8' },
  { id: '5', name: 'Berkay', avatar: 'https://i.pravatar.cc/150?img=9' },
];

export default function SocialPage() {
  const [posts, setPosts] = useState(MOCK_POSTS);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleLike = (postId) => {
    setPosts(posts.map(post =>
      post.id === postId
        ? { ...post, liked: !post.liked, likes: post.liked ? post.likes - 1 : post.likes + 1 }
        : post
    ));
  };

  const renderStory = ({ item }) => (
    <TouchableOpacity style={styles.storyContainer}>
      <View style={[styles.storyRing, item.isOwn && styles.storyRingOwn]}>
        <Image source={{ uri: item.avatar }} style={styles.storyAvatar} />
        {item.isOwn && (
          <View style={styles.addStoryBadge}>
            <Text style={styles.addStoryText}>+</Text>
          </View>
        )}
      </View>
      <Text style={styles.storyName}>{item.name}</Text>
    </TouchableOpacity>
  );

  const renderPost = ({ item }) => (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <Image source={{ uri: item.user.avatar }} style={styles.postAvatar} />
        <View style={styles.postUserInfo}>
          <Text style={styles.postUserName}>{item.user.name}</Text>
          <Text style={styles.postLocation}>📍 {item.location}</Text>
        </View>
        <TouchableOpacity>
          <Text style={styles.moreButton}>•••</Text>
        </TouchableOpacity>
      </View>

      <Image source={{ uri: item.image }} style={styles.postImage} />

      <View style={styles.postActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item.id)}>
          <Text style={styles.actionIcon}>{item.liked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionCount}>{item.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{item.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>🔗</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.postCaption}>
        <Text style={styles.captionUserName}>{item.user.name}</Text>
        <Text style={styles.captionText}> {item.caption}</Text>
      </View>

      <Text style={styles.timeAgo}>{item.timeAgo}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EXCURSA</Text>
        <TouchableOpacity style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Paylaş</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="🔍  Keşfet..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <FlatList
            data={MOCK_STORIES}
            keyExtractor={(item) => item.id}
            renderItem={renderStory}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.storiesList}
          />
        }
        renderItem={renderPost}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1a1a2e' },
  createButton: { backgroundColor: '#1a1a2e', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  searchInput: { margin: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#eee' },
  storiesList: { backgroundColor: '#fff', paddingVertical: 12, marginBottom: 8 },
  storyContainer: { alignItems: 'center', marginHorizontal: 8 },
  storyRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: '#e74c3c', padding: 2, marginBottom: 4 },
  storyRingOwn: { borderColor: '#1a1a2e' },
  storyAvatar: { width: 58, height: 58, borderRadius: 29 },
  addStoryBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#1a1a2e', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  addStoryText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  storyName: { fontSize: 12, color: '#333', maxWidth: 68, textAlign: 'center' },
  postCard: { backgroundColor: '#fff', marginBottom: 8 },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  postAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  postUserInfo: { flex: 1 },
  postUserName: { fontWeight: '600', fontSize: 15, color: '#1a1a2e' },
  postLocation: { fontSize: 12, color: '#888' },
  moreButton: { fontSize: 18, color: '#888' },
  postImage: { width: '100%', height: 300 },
  postActions: { flexDirection: 'row', padding: 12, gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionIcon: { fontSize: 22 },
  actionCount: { fontSize: 14, color: '#333', fontWeight: '500' },
  postCaption: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 4 },
  captionUserName: { fontWeight: '600', fontSize: 14, color: '#1a1a2e' },
  captionText: { fontSize: 14, color: '#333', flex: 1 },
  timeAgo: { fontSize: 12, color: '#aaa', paddingHorizontal: 12, paddingBottom: 12 },
});