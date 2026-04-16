import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAddComment, usePost, usePostComments, useToggleLike } from '../hooks/useSocial';

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'Şimdi';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}d önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}s önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}g önce`;
  const weeks = Math.floor(days / 7);
  return `${weeks}h önce`;
}

export default function PostDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const postId = route?.params?.postId;

  const { data: post, isLoading, isError, refetch } = usePost(postId);
  const {
    data: commentsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePostComments(postId);

  const toggleLikeMutation = useToggleLike();
  const addCommentMutation = useAddComment(postId);
  const [commentText, setCommentText] = useState('');

  const comments = useMemo(
    () => commentsData?.pages?.flatMap((page) => page?.results || []) || [],
    [commentsData]
  );

  const handleLike = () => {
    if (!postId) return;
    toggleLikeMutation.mutate(postId);
  };

  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!text) return;

    try {
      await addCommentMutation.mutateAsync(text);
      setCommentText('');
    } catch (error) {
      Alert.alert('Hata', 'Yorum eklenirken bir hata oluştu.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  if (isError || !post) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Gönderi yüklenemedi.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gönderi</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.userRow}>
          <Image
            source={{ uri: post.avatar_url || 'https://i.pravatar.cc/150?img=1' }}
            style={styles.avatar}
          />
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{post.user_name || 'Kullanıcı'}</Text>
            <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
          </View>
        </View>

        {!!post.content && <Text style={styles.caption}>{post.content}</Text>}

        {post.media_urls?.map((uri, index) => (
          <Image key={`${post.id}-media-${index}`} source={{ uri }} style={styles.media} />
        ))}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
            <Text style={styles.actionIcon}>{post.liked ? '❤️' : '🤍'}</Text>
            <Text style={styles.actionText}>{post.likes_count || 0}</Text>
          </TouchableOpacity>
          <View style={styles.actionButton}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>{post.comments_count || comments.length}</Text>
          </View>
        </View>

        <View style={styles.commentsSection}>
          <Text style={styles.sectionTitle}>Yorumlar</Text>

          {comments.length === 0 ? (
            <Text style={styles.emptyComments}>Henüz yorum yok.</Text>
          ) : (
            comments.map((comment, idx) => (
              <View key={`${comment.user_id || 'user'}-${comment.timestamp || idx}`} style={styles.commentItem}>
                <Text style={styles.commentText}>{comment.text}</Text>
                <Text style={styles.commentTime}>{formatTimeAgo(comment.timestamp)}</Text>
              </View>
            ))
          )}

          {hasNextPage && (
            <TouchableOpacity
              style={styles.loadMoreButton}
              onPress={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              <Text style={styles.loadMoreText}>
                {isFetchingNextPage ? 'Yükleniyor...' : 'Daha Fazla Yorum'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.commentInputRow}>
        <TextInput
          style={styles.commentInput}
          placeholder="Yorum yaz..."
          placeholderTextColor="#999"
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!commentText.trim() || addCommentMutation.isPending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSubmitComment}
          disabled={!commentText.trim() || addCommentMutation.isPending}
        >
          <Text style={styles.sendButtonText}>Gönder</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 15,
    color: '#e74c3c',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  headerSpacer: {
    width: 30,
  },
  content: {
    padding: 12,
    paddingBottom: 24,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  postTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  caption: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 10,
  },
  media: {
    width: '100%',
    height: 280,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#f2f2f2',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 14,
    gap: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  commentsSection: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 10,
  },
  emptyComments: {
    fontSize: 13,
    color: '#888',
  },
  commentItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  commentText: {
    fontSize: 13,
    color: '#333',
  },
  commentTime: {
    marginTop: 3,
    fontSize: 11,
    color: '#999',
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  loadMoreText: {
    fontSize: 13,
    color: '#1a1a2e',
    fontWeight: '600',
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    backgroundColor: '#fff',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#222',
    backgroundColor: '#fafafa',
  },
  sendButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
