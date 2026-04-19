import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import SocialPostCard from '../components/SocialPostCard';
import { useDeletePost, useFeed, useSavedPosts, useToggleLike, useToggleSave } from '../hooks/useSocial';
import { useUnreadNotifications } from '../hooks/useNotifications';
import useAuthStore from '../store/authStore';
import { buildPostLink, copyTextToClipboard } from '../utils/linkUtils';

const QUICK_ITEMS = [
  { id: 'feed', title: 'Akis', subtitle: 'Sosyal feed' },
  { id: 'saved', title: 'Kayitlar', subtitle: 'Favoriler' },
];

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const isSubsequence = (query, text) => {
  if (!query) return true;
  let q = 0;
  for (let i = 0; i < text.length && q < query.length; i += 1) {
    if (text[i] === query[q]) q += 1;
  }
  return q === query.length;
};

const getUserSearchScore = (query, user) => {
  const q = normalizeText(query);
  if (!q) return 0;

  const fullName = normalizeText(user?.full_name);
  const username = normalizeText(user?.username);

  if (fullName.startsWith(q)) return 320;
  if (username.startsWith(q)) return 280;
  if (fullName.includes(q)) return 220;
  if (username.includes(q)) return 180;
  if (isSubsequence(q, fullName)) return 120;
  if (isSubsequence(q, username)) return 90;

  return 0;
};

export default function CommunityFeedScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [activeList, setActiveList] = useState('feed');
  const [feedScope, setFeedScope] = useState('explore');
  const currentUserId = user?.id || user?.profile_id || user?.profile?.id;
  const exploreFeedQuery = useFeed(
    activeList === 'feed' && feedScope === 'explore',
    'explore'
  );
  const followingFeedQuery = useFeed(
    activeList === 'feed' && feedScope === 'following',
    'following'
  );
  const savedPostsQuery = useSavedPosts(activeList === 'saved');
  const unreadNotificationsQuery = useUnreadNotifications();
  const activeFeedQuery = feedScope === 'following' ? followingFeedQuery : exploreFeedQuery;
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = activeList === 'saved' ? savedPostsQuery : activeFeedQuery;

  const toggleLikeMutation = useToggleLike();
  const toggleSaveMutation = useToggleSave();
  const deletePostMutation = useDeletePost();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [selectedSharePost, setSelectedSharePost] = useState(null);
  const [showPostOptions, setShowPostOptions] = useState(false);
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const posts = useMemo(
    () => data?.pages?.flatMap((page) => page.results) || [],
    [data]
  );
  const discoveredUsers = useMemo(() => {
    const unique = new Map();

    posts.forEach((post) => {
      const id = post?.user_ref_id || post?.user_id;
      if (!id || unique.has(id)) return;

      const fullName = String(
        post?.user_name || post?.full_name || post?.user?.full_name || post?.user?.name || ''
      ).trim();
      const usernameRaw = String(
        post?.username || post?.user_username || post?.user?.username || ''
      ).trim();

      unique.set(id, {
        id,
        full_name: fullName || 'Unknown User',
        username: usernameRaw ? (usernameRaw.startsWith('@') ? usernameRaw : `@${usernameRaw}`) : '@gezgin',
        avatar_url: post?.avatar_url || post?.user?.avatar_url || null,
      });
    });

    return Array.from(unique.values());
  }, [posts]);
  const suggestedUsers = useMemo(() => {
    const q = userSearchQuery.trim();
    if (!q) return [];

    return discoveredUsers
      .map((item) => ({ item, score: getUserSearchScore(q, item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.item);
  }, [discoveredUsers, userSearchQuery]);
  const isCompact = width < 380;
  const fabBottom = (Platform.OS === 'ios' ? 86 : 74) + insets.bottom;
  const feedBottomPadding = fabBottom + 74;

  const contentMaxWidth = width >= 900 ? 720 : 640;
  const unreadNotifications = Number(unreadNotificationsQuery.data) || 0;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleLike = useCallback((postId) => {
    toggleLikeMutation.mutate(postId);
  }, [toggleLikeMutation]);

  const handleSave = useCallback((postId) => {
    toggleSaveMutation.mutate(postId);
  }, [toggleSaveMutation]);

  const showFeedback = useCallback((title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  }, []);

  const openPostOptions = useCallback((postId) => {
    setSelectedPostId(postId);
    setShowPostOptions(true);
  }, []);

  const handleDeletePost = useCallback(async () => {
    if (!selectedPostId) return;

    const runDelete = async () => {
      try {
        await deletePostMutation.mutateAsync(selectedPostId);
        setShowPostOptions(false);
        setSelectedPostId(null);
      } catch (error) {
        Alert.alert('Hata', 'Gonderi silinirken bir hata olustu.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined'
        ? window.confirm('Bu gonderiyi silmek istiyor musun?')
        : true;
      if (confirmed) runDelete();
      return;
    }

    Alert.alert(
      'Gonderiyi Sil',
      'Bu islem geri alinamaz. Devam etmek istiyor musun?',
      [
        { text: 'Iptal', onPress: () => setShowPostOptions(false), style: 'cancel' },
        { text: 'Sil', onPress: runDelete, style: 'destructive' },
      ]
    );
  }, [selectedPostId, deletePostMutation]);

  const handleCommentPress = useCallback(
    (postId) => {
      navigation.navigate('PostDetail', { postId });
    },
    [navigation]
  );

  const handleUserPress = useCallback(
    (post) => {
      const ownerId = post?.user_ref_id || post?.user_id;
      if (!ownerId) return;

      navigation.navigate('UserProfile', {
        userId: ownerId,
        full_name: post?.user_name,
        avatar_url: post?.avatar_url,
      });
    },
    [navigation]
  );

  const handleSharePress = useCallback(async (post) => {
    const link = buildPostLink(post?.id);
    const text = String(post?.content || '').trim();
    const shareText = text ? `${text}\n${link}` : link;

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: 'Excursa',
            text: text || 'Excursa gonderisi',
            url: link,
          });
          return;
        }
        setSelectedSharePost(post);
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
        setSelectedSharePost(post);
        setShowShareOptions(true);
      }
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    const post = selectedSharePost;
    const link = buildPostLink(post?.id);
    const copied = await copyTextToClipboard(link);
    setShowShareOptions(false);
    showFeedback(
      copied ? 'Link kopyalandi' : 'Link hazir',
      copied ? 'Gonderi baglantisi kopyalandi.' : link
    );
  }, [selectedSharePost, showFeedback]);

  const handleQuickAction = useCallback((itemId) => {
    if (itemId === 'feed') {
      setActiveList('feed');
      return;
    }
    if (itemId === 'saved') {
      setActiveList((prev) => (prev === 'saved' ? 'feed' : 'saved'));
      return;
    }
  }, [navigation]);

  const handleSuggestedUserPress = useCallback((targetUser) => {
    if (!targetUser?.id) return;
    setUserSearchQuery('');
    navigation.navigate('UserProfile', {
      userId: targetUser.id,
      full_name: targetUser.full_name,
      avatar_url: targetUser.avatar_url,
    });
  }, [navigation]);
  const handleSearchFocus = useCallback((event) => {
    if (Platform.OS !== 'web') return;
    const target = event?.target;
    if (target?.style) {
      target.style.outline = 'none';
      target.style.boxShadow = 'none';
    }
  }, []);

  const handleNotificationsPress = useCallback(() => {
    navigation.navigate('Notifications');
  }, [navigation]);

  const headerComponent = useMemo(() => (
    <View style={[styles.headerWrap, { maxWidth: contentMaxWidth }]}>
      <View style={[styles.topBar, isCompact && styles.topBarCompact]}>
        <View>
          <Text style={styles.brand}>EXCURSA</Text>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>
            {activeList === 'saved'
              ? 'Kaydedilenler'
                : 'Akis'}
          </Text>
        </View>
        <View style={styles.topSearchWrap}>
          <Text style={styles.topSearchIcon}>⌕</Text>
          <TextInput
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
            placeholder="Kullanici ara"
            placeholderTextColor="#9d8f78"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#1a1a2e"
            cursorColor="#1a1a2e"
            onFocus={handleSearchFocus}
            style={[styles.topSearchInput, Platform.OS === 'web' && styles.topSearchInputWeb]}
          />
        </View>
        <TouchableOpacity
          style={styles.notificationButton}
          activeOpacity={0.86}
          onPress={handleNotificationsPress}
        >
          <Text style={styles.notificationIcon}>!</Text>
          {unreadNotifications > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {userSearchQuery.trim() ? (
        <View style={styles.topSuggestionsWrap}>
          {suggestedUsers.length ? (
            suggestedUsers.map((item) => (
              <TouchableOpacity
                key={String(item.id)}
                style={styles.topSuggestionRow}
                activeOpacity={0.85}
                onPress={() => handleSuggestedUserPress(item)}
              >
                <View style={styles.topSuggestionMeta}>
                  <Text numberOfLines={1} style={styles.topSuggestionName}>{item.full_name}</Text>
                  <Text numberOfLines={1} style={styles.topSuggestionHandle}>{item.username}</Text>
                </View>
                <Text style={styles.topSuggestionArrow}>›</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.topSuggestionEmpty}>Yakin isim bulunamadi.</Text>
          )}
        </View>
      ) : null}

      <FlatList
        data={QUICK_ITEMS}
        horizontal
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRail}
        renderItem={({ item }) => {
          const isActive =
            (item.id === 'feed' && activeList === 'feed') ||
            (item.id === 'saved' && activeList === 'saved');

          return (
            <Pressable
              style={[styles.quickCard, isActive && styles.quickCardActive]}
              onPress={() => handleQuickAction(item.id)}
            >
              <Text style={[styles.quickTitle, isActive && styles.quickTitleActive]}>
                {item.title}
              </Text>
              <Text style={[styles.quickSubtitle, isActive && styles.quickSubtitleActive]}>
                {item.subtitle}
              </Text>
            </Pressable>
          );
        }}
      />
      {activeList === 'feed' ? (
        <View style={styles.feedScopeRow}>
          <TouchableOpacity
            style={[
              styles.feedScopeButton,
              feedScope === 'explore' && styles.feedScopeButtonActive,
            ]}
            onPress={() => setFeedScope('explore')}
          >
            <Text
              style={[
                styles.feedScopeText,
                feedScope === 'explore' && styles.feedScopeTextActive,
              ]}
            >
              Kesfet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.feedScopeButton,
              feedScope === 'following' && styles.feedScopeButtonActive,
            ]}
            onPress={() => setFeedScope('following')}
          >
            <Text
              style={[
                styles.feedScopeText,
                feedScope === 'following' && styles.feedScopeTextActive,
              ]}
            >
              Takip
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

    </View>
  ), [
    contentMaxWidth,
    isCompact,
    userSearchQuery,
    suggestedUsers,
    handleQuickAction,
    handleSuggestedUserPress,
    handleSearchFocus,
    handleNotificationsPress,
    activeList,
    feedScope,
    unreadNotifications,
  ]);

  const renderState = (title, subtitle, actionLabel, action) => (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.stateContainer}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateSubtitle}>{subtitle}</Text>
        {actionLabel ? (
          <TouchableOpacity style={styles.stateButton} onPress={action}>
            <Text style={styles.stateButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text style={styles.stateTitle}>Akis hazirlaniyor</Text>
          <Text style={styles.stateSubtitle}>Gezginlerden gelen son paylasimlari yukluyoruz.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return renderState(
      'Akis yuklenemedi',
      'Baglantini kontrol edip tekrar deneyebilirsin.',
      'Tekrar dene',
      () => refetch()
    );
  }

  if (posts.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.emptyHeaderWrap, { maxWidth: contentMaxWidth }]}>
          {headerComponent}
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {activeList === 'saved'
                ? 'Kayitli gonderi yok'
                : feedScope === 'following'
                  ? 'Takip ettiklerinden gonderi yok'
                  : 'Henuz gonderi yok'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeList === 'saved'
                ? 'Bir gonderiyi kaydedince burada gorunecek.'
                : feedScope === 'following'
                  ? 'Takip etmeye basladigin hesaplarin gonderileri burada gorunecek.'
                  : 'Ilk gezi anini paylasarak akisi baslatabilirsin.'}
            </Text>
            {activeList === 'saved' ? null : (
              <TouchableOpacity
                style={styles.stateButton}
                onPress={() => setShowCreateOptions(true)}
              >
                <Text style={styles.stateButtonText}>Ilk gonderini gezginlerle paylas</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {activeList === 'saved' ? null : (
          <TouchableOpacity
            style={[styles.fab, { bottom: fabBottom }]}
            onPress={() => setShowCreateOptions(true)}
            activeOpacity={0.9}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        )}
        <CreateOptionsModal
          visible={showCreateOptions}
          onClose={() => setShowCreateOptions(false)}
          onCreatePost={() => {
            setShowCreateOptions(false);
            navigation.navigate('CreatePost');
          }}
          onShareRoute={() => {
            setShowCreateOptions(false);
            navigation.navigate('CreatePost', { openTripPicker: true });
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={({ item }) => (
          <SocialPostCard
            post={item}
            currentUserId={currentUserId}
            onLike={handleLike}
            onComment={handleCommentPress}
            onShare={handleSharePress}
            onSave={handleSave}
            onUserPress={handleUserPress}
            onMorePress={openPostOptions}
          />
        )}
        ListHeaderComponent={headerComponent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.45}
        contentContainerStyle={[styles.feedContent, { paddingBottom: feedBottomPadding }]}
        showsVerticalScrollIndicator={false}
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
          ) : <View style={styles.footerSpacer} />
        }
        scrollIndicatorInsets={{ right: 1 }}
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => setShowCreateOptions(true)}
        activeOpacity={0.9}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <CreateOptionsModal
        visible={showCreateOptions}
        onClose={() => setShowCreateOptions(false)}
        onCreatePost={() => {
          setShowCreateOptions(false);
          navigation.navigate('CreatePost');
        }}
        onShareRoute={() => {
          setShowCreateOptions(false);
          navigation.navigate('CreatePost', { openTripPicker: true });
        }}
      />

      <PostOptionsModal
        visible={showPostOptions}
        onClose={() => setShowPostOptions(false)}
        onEdit={() => {
          navigation.navigate('EditPost', { postId: selectedPostId });
          setShowPostOptions(false);
        }}
        onDelete={handleDeletePost}
      />

      <ShareOptionsModal
        visible={showShareOptions}
        onClose={() => setShowShareOptions(false)}
        onCopyLink={handleCopyLink}
        onOpenPost={() => {
          const postId = selectedSharePost?.id;
          setShowShareOptions(false);
          if (postId) handleCommentPress(postId);
        }}
      />
    </SafeAreaView>
  );
}

function CreateOptionsModal({ visible, onClose, onCreatePost, onShareRoute }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.sheetTitle}>Yeni paylasim</Text>
          <TouchableOpacity style={styles.sheetAction} onPress={onCreatePost}>
            <Text style={styles.sheetActionTitle}>Gonderi olustur</Text>
            <Text style={styles.sheetActionSubtitle}>Foto, not veya gezi ani paylas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetAction} onPress={onShareRoute}>
            <Text style={styles.sheetActionTitle}>Rota paylas</Text>
            <Text style={styles.sheetActionSubtitle}>Hazir gezi planini akisa ekle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Iptal</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PostOptionsModal({ visible, onClose, onEdit, onDelete }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.sheetTitle}>Gonderi secenekleri</Text>
          <TouchableOpacity style={styles.sheetAction} onPress={onEdit}>
            <Text style={styles.sheetActionTitle}>Duzenle</Text>
            <Text style={styles.sheetActionSubtitle}>Icerigi veya medyayi guncelle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.sheetAction, styles.deleteAction]} onPress={onDelete}>
            <Text style={[styles.sheetActionTitle, styles.deleteText]}>Sil</Text>
            <Text style={styles.sheetActionSubtitle}>Bu islem geri alinamaz</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Iptal</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ShareOptionsModal({ visible, onClose, onCopyLink, onOpenPost }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.sheetTitle}>Paylas</Text>
          <TouchableOpacity style={styles.sheetAction} onPress={onCopyLink}>
            <Text style={styles.sheetActionTitle}>Baglantiyi kopyala</Text>
            <Text style={styles.sheetActionSubtitle}>Gonderi linkini panoya al</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetAction} onPress={onOpenPost}>
            <Text style={styles.sheetActionTitle}>Gonderiyi ac</Text>
            <Text style={styles.sheetActionSubtitle}>Yorumlari ve detaylari gor</Text>
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
  feedContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 100,
  },
  headerWrap: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 2,
    gap: 10,
  },
  topBarCompact: {
    marginBottom: 12,
  },
  brand: {
    color: '#9b8356',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  title: {
    color: '#1a1a2e',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 1,
  },
  titleCompact: {
    fontSize: 28,
  },
  topSearchWrap: {
    height: 42,
    minWidth: 126,
    maxWidth: 220,
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topSearchIcon: {
    color: '#746b5e',
    fontSize: 15,
    marginRight: 7,
  },
  topSearchInput: {
    flex: 1,
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 0,
    borderWidth: 0,
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
  topSearchInputWeb: {
    outlineStyle: 'none',
    boxShadow: 'none',
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  notificationIcon: {
    color: '#fffdf8',
    fontSize: 18,
    fontWeight: '900',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    backgroundColor: '#d43f57',
    borderWidth: 2,
    borderColor: '#f7f3ea',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  topSuggestionsWrap: {
    alignSelf: 'flex-end',
    width: '100%',
    maxWidth: 220,
    marginTop: -8,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e1d5bf',
    overflow: 'hidden',
  },
  topSuggestionRow: {
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee5d5',
  },
  topSuggestionMeta: {
    flex: 1,
  },
  topSuggestionName: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '800',
  },
  topSuggestionHandle: {
    color: '#7e7261',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  topSuggestionArrow: {
    color: '#8f7e63',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  topSuggestionEmpty: {
    color: '#7e7261',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  quickRail: {
    paddingRight: 18,
    gap: 10,
  },
  feedScopeRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedScopeButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
  },
  feedScopeButtonActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  feedScopeText: {
    color: '#6f6658',
    fontSize: 13,
    fontWeight: '800',
  },
  feedScopeTextActive: {
    color: '#fff',
  },
  quickCard: {
    width: 112,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
  },
  quickCardActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  quickTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 3,
  },
  quickTitleActive: {
    color: '#fff',
  },
  quickSubtitle: {
    color: '#81786b',
    fontSize: 12,
    fontWeight: '700',
  },
  quickSubtitleActive: {
    color: '#d7c49e',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: '#1a1a2e',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  stateSubtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  stateButton: {
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  stateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyHeaderWrap: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  emptyCard: {
    marginTop: 20,
    borderRadius: 28,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#1a1a2e',
    fontSize: 22,
    fontWeight: '900',
  },
  emptySubtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  loadingMore: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 18,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  fabText: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '500',
    lineHeight: 36,
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
  deleteAction: {
    backgroundColor: '#ffe8e8',
  },
  deleteText: {
    color: '#c93434',
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
