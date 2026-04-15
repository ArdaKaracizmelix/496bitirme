import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFeed, useToggleLike, useDeletePost } from '../hooks/useSocial';
import useAuthStore from '../store/authStore';

/**
 * CommunityFeedScreen Component
 * Displays a continuous stream of social posts from followed users
 * Supports infinite scroll, like/unlike, comments, and post management
 */
export default function CommunityFeedScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const currentUserId = user?.id || user?.profile_id || user?.profile?.id;
  const [activeFeedTab, setActiveFeedTab] = useState('following'); // following | global
  const followingFeedQuery = useFeed('following');
  const globalFeedQuery = useFeed('global');
  const activeFeedQuery = activeFeedTab === 'global' ? globalFeedQuery : followingFeedQuery;
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = activeFeedQuery;

  const toggleLikeMutation = useToggleLike();
  const deletePostMutation = useDeletePost();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [showPostOptions, setShowPostOptions] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);

  // Flatten the paginated data structure
  const posts = data?.pages?.flatMap((page) => page.results) || [];

  const renderFeedTabs = () => (
    <View style={styles.feedTabsContainer}>
      <TouchableOpacity
        style={[styles.feedTabButton, activeFeedTab === 'following' && styles.feedTabButtonActive]}
        onPress={() => setActiveFeedTab('following')}
      >
        <Text style={[styles.feedTabLabel, activeFeedTab === 'following' && styles.feedTabLabelActive]}>
          Following
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.feedTabButton, activeFeedTab === 'global' && styles.feedTabButtonActive]}
        onPress={() => setActiveFeedTab('global')}
      >
        <Text style={[styles.feedTabLabel, activeFeedTab === 'global' && styles.feedTabLabelActive]}>
          Global
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch, activeFeedTab]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle like toggle
  const handleLike = useCallback((postId) => {
    toggleLikeMutation.mutate(postId);
  }, [toggleLikeMutation]);

  // Handle delete post
  const handleDeletePost = useCallback(async () => {
    if (!selectedPostId) return;

    Alert.alert(
      'Gönderimi Sil',
      'Bu işlem geri alınamaz. Devam etmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', onPress: () => setShowPostOptions(false), style: 'cancel' },
        {
          text: 'Sil',
          onPress: async () => {
            try {
              await deletePostMutation.mutateAsync(selectedPostId);
              setShowPostOptions(false);
              setSelectedPostId(null);
              Alert.alert('Başarılı', 'Gönderi silindi.');
            } catch (error) {
              Alert.alert('Hata', 'Gönderi silinirken bir hata oluştu.');
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [selectedPostId, deletePostMutation]);

  // Handle comment press
  const handleCommentPress = useCallback(
    (postId) => {
      navigation.navigate('PostDetail', { postId });
    },
    [navigation]
  );

  // Handle user profile press
  const handleUserPress = useCallback(
    (post) => {
      const ownerId = post?.user_ref_id || post?.user_id;
      if (!ownerId) {
        return;
      }
      navigation.navigate('UserProfile', {
        userId: ownerId,
        full_name: post?.user_name,
        avatar_url: post?.avatar_url,
      });
    },
    [navigation]
  );

  // Handle share press
  const handleShare = useCallback((post) => {
    Alert.alert('Paylaş', 'Bu özellik yakında gelecek');
  }, []);

  // Render individual post item
  const renderPostItem = ({ item: post }) => (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => handleUserPress(post)}
        >
          <Image
            source={{ uri: post.avatar_url || 'https://i.pravatar.cc/150?img=1' }}
            style={styles.postAvatar}
          />
          <View style={styles.postUserDetails}>
            <Text style={styles.postUserName}>{post.user_name}</Text>
            {post.location && (
              <Text style={styles.postLocation}>📍 {post.location}</Text>
            )}
          </View>
        </TouchableOpacity>
        {String(currentUserId) === String(post.user_ref_id) && (
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => {
              setSelectedPostId(post.id);
              setShowPostOptions(true);
            }}
          >
            <Text style={styles.moreIcon}>•••</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Post Content */}
      <Text style={styles.postCaption}>{post.content}</Text>

      {/* Post Media - First image in carousel */}
      {post.media_urls && post.media_urls.length > 0 && (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: post.media_urls[0] }}
            style={styles.postImage}
            resizeMode="cover"
          />
          {post.media_urls.length > 1 && (
            <View style={styles.mediaCountBadge}>
              <Text style={styles.mediaCountText}>{post.media_urls.length}</Text>
            </View>
          )}
        </View>
      )}

      {/* Post Actions */}
      <View style={styles.postActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleLike(post.id)}
        >
          <Text style={styles.actionIcon}>{post.liked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionCount}>{post.likes_count || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleCommentPress(post.id)}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{post.comments_count || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleShare(post)}
        >
          <Text style={styles.actionIcon}>🔗</Text>
        </TouchableOpacity>
      </View>

      {/* Post Meta */}
      <View style={styles.postMeta}>
        <Text style={styles.postTime}>{formatTimeAgo(post.created_at)}</Text>
        {post.visibility !== 'PUBLIC' && (
          <Text style={styles.visibilityBadge}>
            {post.visibility === 'FOLLOWERS' ? '👥 Takipçiler' : '🔒 Özel'}
          </Text>
        )}
      </View>
    </View>
  );

  // Render loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        {renderFeedTabs()}
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text style={styles.loadingText}>Haberler yükleniyor...</Text>
        </View>
      </View>
    );
  }

  // Render error state
  if (isError) {
    return (
      <View style={styles.container}>
        {renderFeedTabs()}
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Haberleri yüklerken hata oluştu</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Tekrar Deneyin</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render empty state
  if (posts.length === 0) {
    return (
      <View style={styles.container}>
        {renderFeedTabs()}
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>
            {activeFeedTab === 'following' ? 'Takip ettiğin hesaplardan gönderi yok' : 'Henüz hiç gönderi yok'}
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('CreatePost')}
          >
            <Text style={styles.createButtonText}>İlk Gönderini Oluştur</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderFeedTabs()}

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={renderPostItem}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isRefetching}
            onRefresh={handleRefresh}
            tintColor="#1a1a2e"
          />
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color="#1a1a2e" />
            </View>
          ) : null
        }
        scrollIndicatorInsets={{ right: 1 }}
      />

      <TouchableOpacity
        style={styles.fabCreateButton}
        onPress={() => setShowCreateOptions(true)}
      >
        <Text style={styles.fabCreateButtonText}>+ Yeni Gönderi</Text>
      </TouchableOpacity>

      <Modal
        visible={showCreateOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCreateOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsModal}>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => {
                setShowCreateOptions(false);
                navigation.navigate('CreatePost');
              }}
            >
              <Text style={styles.optionText}>Normal Gönderi Oluştur</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => {
                setShowCreateOptions(false);
                navigation.navigate('CreatePost', { openTripPicker: true });
              }}
            >
              <Text style={styles.optionText}>Rota Paylaş</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => setShowCreateOptions(false)}
            >
              <Text style={styles.optionText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Post Options Modal */}
      <Modal
        visible={showPostOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPostOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsModal}>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => {
                navigation.navigate('EditPost', { postId: selectedPostId });
                setShowPostOptions(false);
              }}
            >
              <Text style={styles.optionText}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, styles.deleteButton]}
              onPress={handleDeletePost}
            >
              <Text style={[styles.optionText, styles.deleteText]}>Sil</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={() => setShowPostOptions(false)}
            >
              <Text style={styles.optionText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Helper function to format timestamp
 */
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  feedTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  feedTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8d8d8',
    backgroundColor: '#fff',
    marginHorizontal: 4,
  },
  feedTabButtonActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  feedTabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  feedTabLabelActive: {
    color: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    color: '#e74c3c',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 20,
  },
  createButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  postCard: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  postUserDetails: {
    flex: 1,
  },
  postUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  postLocation: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  moreButton: {
    padding: 8,
  },
  moreIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
  },
  postCaption: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  mediaContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  postImage: {
    width: '100%',
    height: 250,
  },
  mediaCountBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  mediaCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  actionIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  actionCount: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  postMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  postTime: {
    fontSize: 12,
    color: '#999',
  },
  visibilityBadge: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  optionsModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  optionButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  optionText: {
    fontSize: 16,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: '#fff5f5',
  },
  deleteText: {
    color: '#e74c3c',
  },
  fabCreateButton: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  fabCreateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
