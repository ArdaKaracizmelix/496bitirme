import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTimeAgo } from '../components/SocialPostCard';
import RouteShareCard from '../components/RouteShareCard';
import { useAddComment, usePost, usePostComments, useToggleLike } from '../hooks/useSocial';
import { buildPostLink, copyTextToClipboard } from '../utils/linkUtils';
import { getPostPresentation } from '../utils/routeShareUtils';

const FALLBACK_AVATAR = 'https://i.pravatar.cc/150?img=12';

export default function PostDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const [showShareOptions, setShowShareOptions] = useState(false);

  const comments = useMemo(
    () => commentsData?.pages?.flatMap((page) => page?.results || []) || [],
    [commentsData]
  );

  const contentMaxWidth = width >= 900 ? 760 : 640;
  const isCompact = width < 380;
  const mediaUrls = Array.isArray(post?.media_urls) ? post.media_urls.filter(Boolean) : [];
  const hasMedia = mediaUrls.length > 0;
  const { cleanedContent: content, routeData } = getPostPresentation(post);
  const hasText = content.length > 0;

  const showFeedback = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const handleLike = () => {
    if (!postId) return;
    toggleLikeMutation.mutate(postId);
  };

  const handleCopyLink = async () => {
    const link = buildPostLink(postId);
    const copied = await copyTextToClipboard(link);
    setShowShareOptions(false);
    showFeedback(
      copied ? 'Link kopyalandi' : 'Link hazir',
      copied ? 'Gonderi baglantisi kopyalandi.' : link
    );
  };

  const handleSharePress = async () => {
    const link = buildPostLink(postId);
    const shareText = hasText ? `${content}\n${link}` : link;

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: 'Excursa',
            text: content || 'Excursa gonderisi',
            url: link,
          });
          return;
        }
        setShowShareOptions(true);
        return;
      }

      await Share.share({
        title: 'Excursa',
        message: shareText,
        url: link,
      });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShowShareOptions(true);
      }
    }
  };

  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!text) return;

    try {
      await addCommentMutation.mutateAsync(text);
      setCommentText('');
    } catch (error) {
      showFeedback('Hata', 'Yorum eklenirken bir hata olustu.');
    }
  };

  const openUserProfile = (profileId, fallbackName, avatarUrl) => {
    if (!profileId) return;
    navigation.navigate('UserProfile', {
      userId: String(profileId),
      full_name: fallbackName,
      avatar_url: avatarUrl,
    });
  };

  const renderPostHeader = () => (
    <View style={[styles.postCard, { maxWidth: contentMaxWidth }]}>
      <TouchableOpacity
        style={styles.ownerRow}
        onPress={() => openUserProfile(post?.user_ref_id || post?.user_id, post?.user_name, post?.avatar_url)}
      >
        <Image
          source={{ uri: post?.avatar_url || FALLBACK_AVATAR }}
          style={styles.ownerAvatar}
        />
        <View style={styles.ownerMeta}>
          <Text style={styles.ownerName} numberOfLines={1}>
            {post?.user_name || 'Gezgin'}
          </Text>
          <Text style={styles.ownerSub} numberOfLines={1}>
            {post?.location ? post.location : 'Excursa seyahat akisi'} · {formatTimeAgo(post?.created_at)}
          </Text>
        </View>
      </TouchableOpacity>

      {hasMedia ? (
        <View style={styles.mediaStack}>
          {mediaUrls.map((uri, index) => (
            <Image
              key={`${post.id}-media-${index}`}
              source={{ uri }}
              style={styles.media}
              resizeMode="cover"
            />
          ))}
        </View>
      ) : null}

      {hasText ? (
        <View style={[styles.captionWrap, !hasMedia && styles.textOnlyWrap]}>
          <Text style={[styles.caption, !hasMedia && styles.textOnlyCaption]}>
            {content}
          </Text>
        </View>
      ) : null}

      {routeData ? (
        <View style={styles.routeCardWrap}>
          <RouteShareCard routeData={routeData} compact />
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Text style={[styles.actionIcon, post?.liked && styles.likeActive]}>
            {post?.liked ? '♥' : '♡'}
          </Text>
          <Text style={styles.actionText}>{post?.likes_count || 0}</Text>
        </TouchableOpacity>
        <View style={styles.actionButton}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{post?.comments_count || comments.length}</Text>
        </View>
        <TouchableOpacity style={styles.actionButton} onPress={handleSharePress}>
          <Text style={styles.linkIcon}>↗</Text>
          <Text style={styles.actionText}>Paylas</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderComment = ({ item }) => (
    <View style={styles.commentItem}>
      <TouchableOpacity
        style={styles.commentOwnerPress}
        onPress={() => openUserProfile(item?.user_id, item?.user_name, item?.avatar_url)}
      >
        <Image
          source={{ uri: item?.avatar_url || FALLBACK_AVATAR }}
          style={styles.commentAvatar}
        />
      </TouchableOpacity>
      <View style={styles.commentBubble}>
        <View style={styles.commentHeader}>
          <TouchableOpacity
            style={styles.commentAuthorPress}
            onPress={() => openUserProfile(item?.user_id, item?.user_name, item?.avatar_url)}
          >
            <Text style={styles.commentAuthor} numberOfLines={1}>
              {item?.user_name || 'Gezgin'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.commentTime}>{formatTimeAgo(item?.timestamp)}</Text>
        </View>
        <Text style={styles.commentText}>{item?.text}</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text style={styles.stateText}>Gonderi yukleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !post) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Gonderi yuklenemedi.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, isCompact && styles.headerCompact]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Yorumlar</Text>
          <View style={styles.headerSpacer} />
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item, index) => `${item?.user_id || 'user'}-${item?.timestamp || index}`}
          renderItem={renderComment}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {renderPostHeader()}
              <Text style={[styles.sectionTitle, { maxWidth: contentMaxWidth }]}>Yorumlar</Text>
              {comments.length === 0 ? (
                <View style={[styles.emptyComments, { maxWidth: contentMaxWidth }]}>
                  <Text style={styles.emptyTitle}>Henuz yorum yok</Text>
                  <Text style={styles.emptySubtitle}>Ilk yorumu sen yazabilirsin.</Text>
                </View>
              ) : null}
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color="#1a1a2e" />
              </View>
            ) : <View style={styles.footerSpacer} />
          }
        />

        <View style={[styles.commentInputRow, { paddingBottom: 12 + Math.max(insets.bottom - 4, 0) }]}>
          <TextInput
            style={styles.commentInput}
            placeholder="Yorum yaz..."
            placeholderTextColor="#8f887d"
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
            {addCommentMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Gonder</Text>
            )}
          </TouchableOpacity>
        </View>

        <ShareOptionsModal
          visible={showShareOptions}
          onClose={() => setShowShareOptions(false)}
          onCopyLink={handleCopyLink}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ShareOptionsModal({ visible, onClose, onCopyLink }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.sheetTitle}>Paylas</Text>
          <TouchableOpacity style={styles.sheetAction} onPress={onCopyLink}>
            <Text style={styles.sheetActionTitle}>Baglantiyi kopyala</Text>
            <Text style={styles.sheetActionSubtitle}>Gonderi linkini panoya al</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Iptal</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  keyboardRoot: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  stateText: {
    color: '#746b5e',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#c93434',
    marginBottom: 14,
    fontWeight: '800',
  },
  retryButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: {
    color: '#fff',
    fontWeight: '900',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9dfcf',
    backgroundColor: '#fffdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCompact: {
    paddingVertical: 10,
  },
  backButton: {
    minWidth: 56,
  },
  backText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1a1a2e',
  },
  headerSpacer: {
    width: 56,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 28,
  },
  listHeader: {
    alignItems: 'center',
  },
  postCard: {
    width: '100%',
    backgroundColor: '#fffdf8',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ece3d3',
    overflow: 'hidden',
    marginBottom: 18,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ownerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#d7c49e',
    backgroundColor: '#eee5d7',
  },
  ownerMeta: {
    flex: 1,
  },
  ownerName: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '900',
  },
  ownerSub: {
    color: '#81786b',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  mediaStack: {
    gap: 8,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#eee6d8',
  },
  captionWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  routeCardWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  textOnlyWrap: {
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#f7f3ea',
    borderWidth: 1,
    borderColor: '#ebe1d1',
  },
  caption: {
    color: '#302e3f',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  textOnlyCaption: {
    color: '#1a1a2e',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    color: '#1a1a2e',
    fontSize: 25,
    fontWeight: '900',
    marginRight: 7,
  },
  linkIcon: {
    color: '#1a1a2e',
    fontSize: 19,
    fontWeight: '900',
    marginRight: 7,
  },
  likeActive: {
    color: '#d43f57',
  },
  actionText: {
    color: '#443f50',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    width: '100%',
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  emptyComments: {
    width: '100%',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#ece3d3',
  },
  emptyTitle: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '900',
  },
  emptySubtitle: {
    color: '#81786b',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 5,
  },
  commentItem: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingVertical: 9,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
    backgroundColor: '#eee5d7',
  },
  commentOwnerPress: {
    borderRadius: 17,
    alignSelf: 'flex-start',
  },
  commentBubble: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eee5d7',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 3,
  },
  commentAuthor: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
  },
  commentAuthorPress: {
    flex: 1,
  },
  commentTime: {
    color: '#9a9184',
    fontSize: 11,
    fontWeight: '700',
  },
  commentText: {
    color: '#302e3f',
    fontSize: 14,
    lineHeight: 20,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 16,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9dfcf',
    backgroundColor: '#fffdf8',
    gap: 9,
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 108,
    borderWidth: 1,
    borderColor: '#e4d9c9',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1a1a2e',
    backgroundColor: '#f7f3ea',
  },
  sendButton: {
    minWidth: 78,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 15,
    borderRadius: 16,
  },
  sendButtonDisabled: {
    opacity: 0.48,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(14,14,26,0.46)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fffdf8',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
  },
  sheetTitle: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  sheetAction: {
    borderRadius: 18,
    backgroundColor: '#f4eddf',
    padding: 16,
    marginBottom: 10,
  },
  sheetActionTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '900',
  },
  sheetActionSubtitle: {
    color: '#746b5e',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: 13,
  },
  sheetCancelText: {
    color: '#746b5e',
    fontSize: 14,
    fontWeight: '900',
  },
});
