import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatRouteDuration,
  getPostPresentation,
} from '../utils/routeShareUtils';
import {
  useFollowUser,
  useUnfollowUser,
  useUserPosts,
  useUserProfile,
} from '../hooks/useSocial';
import useAuthStore from '../store/authStore';

const FALLBACK_AVATAR = 'https://i.pravatar.cc/150?img=1';
const TAB_ITEMS = [
  { id: 'journey', label: 'Gunluk', hint: 'Tum izler' },
  { id: 'routes', label: 'Rotalar', hint: 'Planlar' },
  { id: 'notes', label: 'Notlar', hint: 'Anlar' },
];

const getMediaUrls = (post) =>
  Array.isArray(post?.media_urls) ? post.media_urls.filter(Boolean) : [];

const getPreparedPost = (post) => {
  const mediaUrls = getMediaUrls(post);
  const presentation = getPostPresentation(post);
  const content = presentation.cleanedContent || '';
  const hasRoute = !!presentation.routeData;
  const hasMedia = mediaUrls.length > 0;

  let type = 'note';
  if (hasRoute) type = 'route';
  else if (hasMedia) type = 'media';

  return {
    ...post,
    mediaUrls,
    content,
    routeData: presentation.routeData,
    type,
  };
};

const formatCompactNumber = (value) => {
  const number = Number(value) || 0;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return String(number);
};

const getPostPreviewTitle = (post) => {
  if (post.type === 'route') return post.routeData?.title || 'Paylasilan rota';
  if (post.type === 'media') return post.content || post?.location || 'Gorsel ani';
  return post.content || 'Seyahat notu';
};

const getPostTypeLabel = (post) => {
  if (post.type === 'route') return 'Rota';
  if (post.type === 'media') return 'Gorsel';
  return 'Not';
};

const getRouteMeta = (routeData) => {
  const stops = Number(routeData?.total_stops) || 0;
  const duration = formatRouteDuration(routeData?.total_duration);
  if (stops && duration) return `${stops} durak - ${duration}`;
  if (stops) return `${stops} durak`;
  return duration || 'Rota detayi';
};

export default function ProfileScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user: currentUser } = useAuthStore();
  const logout = useAuthStore((state) => state.logout);
  const routeParams = route?.params || {};
  const currentUserId = String(
    currentUser?.id || currentUser?.profile_id || currentUser?.profile?.id || ''
  );
  const routeUserId = routeParams.userId ? String(routeParams.userId) : '';
  const isOwnProfile = !routeUserId || routeUserId === currentUserId;
  const userId = routeUserId || currentUserId;

  const {
    data: profileData,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useUserProfile(userId, isOwnProfile);
  const {
    data: postsData,
    isLoading: isPostsLoading,
    isError: isPostsError,
    refetch: refetchPosts,
  } = useUserPosts(userId);

  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();
  const [activeTab, setActiveTab] = useState('journey');
  const isCompact = width < 390;
  const contentMaxWidth = width >= 900 ? 720 : 640;

  const rawPosts = postsData?.results || [];
  const posts = useMemo(() => rawPosts.map(getPreparedPost), [rawPosts]);
  const postsCount = postsData?.count ?? posts.length;
  const routePosts = useMemo(() => posts.filter((post) => post.type === 'route'), [posts]);
  const notePosts = useMemo(
    () => posts.filter((post) => post.type === 'note' || (post.type === 'media' && !post.routeData)),
    [posts]
  );
  const visiblePosts = useMemo(() => {
    if (activeTab === 'routes') return routePosts;
    if (activeTab === 'notes') return notePosts;
    return posts;
  }, [activeTab, notePosts, posts, routePosts]);

  const isLoading = isProfileLoading || isPostsLoading;
  const isError = isProfileError || isPostsError;
  const isFollowing = !isOwnProfile && !!profileData?.is_following;
  const isFollowUpdating = followMutation.isPending || unfollowMutation.isPending;

  const userProfile = useMemo(
    () => ({
      id: userId,
      full_name:
        routeParams.full_name ||
        routeParams.user_name ||
        profileData?.full_name ||
        currentUser?.full_name ||
        profileData?.username ||
        profileData?.email ||
        'Kullanici',
      avatar_url:
        profileData?.avatar_url ||
        routeParams.avatar_url ||
        currentUser?.avatar_url ||
        FALLBACK_AVATAR,
      bio: profileData?.bio ?? routeParams.bio ?? currentUser?.bio ?? '',
      followers_count:
        profileData?.followers_count ??
        routeParams.followers_count ??
        currentUser?.followers_count ??
        0,
      following_count:
        profileData?.following_count ??
        routeParams.following_count ??
        currentUser?.following_count ??
        0,
      interests: Array.isArray(profileData?.interests) ? profileData.interests : [],
    }),
    [currentUser, profileData, routeParams, userId]
  );

  const profileSummary = useMemo(
    () => [
      { id: 'posts', value: postsCount, label: 'Iz' },
      { id: 'routes', value: routePosts.length, label: 'Rota' },
      {
        id: 'followers',
        value: userProfile.followers_count,
        label: 'Baglanti',
        action: () => openFollowList('followers'),
      },
    ],
    [postsCount, routePosts.length, userProfile.followers_count]
  );

  const handleLogout = () => {
    const runLogout = async () => {
      try {
        await logout();
      } catch {
        Alert.alert('Hata', 'Cikis yapilirken bir hata olustu.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined'
          ? window.confirm('Hesabinizdan cikis yapmak istiyor musunuz?')
          : true;
      if (confirmed) runLogout();
      return;
    }

    Alert.alert('Cikis Yap', 'Hesabinizdan cikis yapmak istiyor musunuz?', [
      { text: 'Iptal', style: 'cancel' },
      { text: 'Cikis Yap', style: 'destructive', onPress: runLogout },
    ]);
  };

  const handleFollowToggle = async () => {
    if (isOwnProfile || isFollowUpdating) return;

    try {
      if (isFollowing) {
        await unfollowMutation.mutateAsync(userId);
      } else {
        await followMutation.mutateAsync(userId);
      }
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.detail ||
        'Takip islemi basarisiz oldu.';
      Alert.alert('Hata', message);
    }
  };

  const handleProfileMenu = () => {
    if (!isOwnProfile) return;

    if (Platform.OS === 'web') {
      Alert.alert('Ayarlar', 'Ayarlar sayfasi yakinda gelecek.');
      return;
    }

    Alert.alert('Profil', 'Profil islemleri', [
      { text: 'Ayarlar', onPress: () => Alert.alert('Ayarlar', 'Ayarlar sayfasi yakinda gelecek.') },
      { text: 'Cikis Yap', style: 'destructive', onPress: handleLogout },
      { text: 'Iptal', style: 'cancel' },
    ]);
  };

  const openFollowList = (initialTab) => {
    navigation.navigate('FollowersList', {
      userId,
      full_name: userProfile.full_name,
      initialTab,
    });
  };

  const openPost = (postId) => {
    navigation.navigate('Social', {
      screen: 'PostDetail',
      params: { postId },
    });
  };

  const renderHeader = () => (
    <View style={[styles.headerOuter, { maxWidth: contentMaxWidth }]}>
      <View style={[styles.heroCard, insets.top > 0 && styles.heroInset]}>
        <View style={styles.heroTopRow}>
          <View style={styles.identityRow}>
            <Image
              source={{ uri: userProfile.avatar_url }}
              style={[styles.profileAvatar, isCompact && styles.profileAvatarCompact]}
            />
            <View style={styles.identityText}>
              <Text style={styles.kicker}>EXCURSA PROFILI</Text>
              <Text style={[styles.profileName, isCompact && styles.profileNameCompact]} numberOfLines={2}>
                {userProfile.full_name}
              </Text>
              <Text style={styles.profileSubtitle} numberOfLines={1}>
                {routePosts.length ? 'Rota anlatilari ve kesif notlari' : 'Kesif notlari ve sosyal izler'}
              </Text>
            </View>
          </View>
          {isOwnProfile ? (
            <TouchableOpacity style={styles.menuButton} onPress={handleProfileMenu}>
              <Text style={styles.menuButtonText}>...</Text>
            </TouchableOpacity>
          ) : profileData?.is_verified ? (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedBadgeText}>ONAYLI</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.profileBio}>
          {userProfile.bio || 'Bu profil henuz bio eklemedi; paylastigi rotalar ve notlar burada karakterini gosterecek.'}
        </Text>

        <View style={styles.summaryStrip}>
          {profileSummary.map((item, index) => {
            const itemStyle = [
              styles.summaryItem,
              index === profileSummary.length - 1 && styles.summaryItemLast,
            ];
            const content = (
              <>
                <Text style={styles.summaryValue}>{formatCompactNumber(item.value)}</Text>
                <Text style={styles.summaryLabel}>{item.label}</Text>
              </>
            );

            if (item.action) {
              return (
                <TouchableOpacity key={item.id} style={itemStyle} onPress={item.action}>
                  {content}
                </TouchableOpacity>
              );
            }

            return (
              <View key={item.id} style={itemStyle}>
                {content}
              </View>
            );
          })}
        </View>

        <View style={styles.actionButtons}>
          {isOwnProfile ? (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Text style={styles.actionButtonText}>Profili Duzenle</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  isFollowing && styles.followingButton,
                  isFollowUpdating && styles.actionDisabled,
                ]}
                onPress={handleFollowToggle}
                disabled={isFollowUpdating}
              >
                {isFollowUpdating ? (
                  <ActivityIndicator size="small" color={isFollowing ? '#1a1a2e' : '#fff'} />
                ) : (
                  <Text style={isFollowing ? styles.followingButtonText : styles.actionButtonText}>
                    {isFollowing ? 'Baglantida' : 'Takip Et'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View style={styles.sectionIntro}>
        <View>
          <Text style={styles.sectionTitle}>Paylasimlar</Text>
        </View>
        <Text style={styles.sectionMeta}>{visiblePosts.length} icerik</Text>
      </View>

      <View style={styles.tabRail}>
        {TAB_ITEMS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabCard, activeTab === tab.id && styles.tabCardActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.88}
          >
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPostItem = ({ item, index }) => (
    <ProfilePostCard
      post={item}
      index={index}
      onPress={() => openPost(item.id)}
      contentMaxWidth={contentMaxWidth}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
          <Text style={styles.loadingText}>Profil akisi hazirlaniyor</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Profil verileri yuklenemedi</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              refetchProfile();
              refetchPosts();
            }}
          >
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={visiblePosts}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={renderPostItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={[styles.emptyContainer, { maxWidth: contentMaxWidth }]}>
            <Text style={styles.emptyTitle}>
              {activeTab === 'routes' ? 'Henuz rota izi yok' : 'Henuz profil izi yok'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'routes'
                ? 'Rota paylasildiginda burada duraklari ve ozetleriyle gorunecek.'
                : 'Yazili notlar, fotolar ve rota paylasimlari burada daha zengin kartlarla toplanacak.'}
            </Text>
            {isOwnProfile ? (
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => navigation.navigate('CreatePost')}
              >
                <Text style={styles.createButtonText}>Ilk izini paylas</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (Platform.OS === 'ios' ? 118 : 96) + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ right: 1 }}
      />
    </SafeAreaView>
  );
}

function ProfilePostCard({ post, index, onPress, contentMaxWidth }) {
  const likesCount = Number(post?.likes_count) || 0;
  const commentsCount = Number(post?.comments_count) || 0;
  const content = post.content;
  const createdLabel = formatPostDate(post?.created_at);
  const firstMedia = post.mediaUrls?.[0];
  const title = getPostPreviewTitle(post);
  const typeLabel = getPostTypeLabel(post);
  const meta =
    post.type === 'route'
      ? getRouteMeta(post.routeData)
      : `${likesCount} begeni - ${commentsCount} yorum`;

  return (
    <TouchableOpacity
      style={[styles.previewCard, { maxWidth: contentMaxWidth }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {firstMedia ? (
        <Image source={{ uri: firstMedia }} style={styles.previewImage} resizeMode="cover" />
      ) : (
        <View style={[styles.previewIcon, post.type === 'route' && styles.previewIconRoute]}>
          <Text style={styles.previewIconText}>
            {post.type === 'route' ? 'R' : String(index + 1).padStart(2, '0')}
          </Text>
        </View>
      )}

      <View style={styles.previewBody}>
        <View style={styles.previewMetaRow}>
          <Text style={styles.previewType}>{typeLabel}</Text>
          <Text style={styles.previewDate}>{post?.location || createdLabel}</Text>
        </View>
        <Text style={styles.previewTitle} numberOfLines={2}>
          {title}
        </Text>
        {!!content && post.type !== 'route' ? (
          <Text style={styles.previewText} numberOfLines={1}>
            {content}
          </Text>
        ) : null}
        <Text style={styles.previewMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.previewArrow}>{'>'}</Text>
    </TouchableOpacity>
  );
}

function formatPostDate(timestamp) {
  if (!timestamp) return 'Simdi';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Simdi';

  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  headerOuter: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: 14,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 16,
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  heroInset: {
    marginTop: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  identityRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  profileAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    marginRight: 14,
    borderWidth: 3,
    borderColor: '#d7c49e',
    backgroundColor: '#eee5d7',
  },
  profileAvatarCompact: {
    width: 68,
    height: 68,
    borderRadius: 34,
    marginRight: 11,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  profileName: {
    color: '#1a1a2e',
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
    marginTop: 3,
  },
  profileNameCompact: {
    fontSize: 23,
    lineHeight: 28,
  },
  profileSubtitle: {
    color: '#746b5e',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  verifiedBadge: {
    borderRadius: 999,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  verifiedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
  },
  menuButtonText: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: -3,
  },
  profileBio: {
    color: '#302e3f',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  interestRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  interestChip: {
    maxWidth: 142,
    borderRadius: 999,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  interestChipText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: '800',
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#f7f3ea',
    borderWidth: 1,
    borderColor: '#e6dccb',
    marginTop: 14,
    paddingVertical: 10,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRightWidth: 1,
    borderRightColor: '#e6dccb',
  },
  summaryItemLast: {
    borderRightWidth: 0,
  },
  summaryValue: {
    color: '#1a1a2e',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#746b5e',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  summaryDetail: {
    color: '#7c7568',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  microStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  microStat: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  microStatValue: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '900',
  },
  microStatLabel: {
    color: '#746b5e',
    fontSize: 12,
    fontWeight: '800',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  secondaryButton: {
    flex: 0,
    minWidth: 92,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
  },
  secondaryButtonCompact: {
    minWidth: 78,
  },
  secondaryButtonText: {
    fontSize: 13,
    color: '#1a1a2e',
    fontWeight: '900',
  },
  followingButton: {
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  followingButtonText: {
    color: '#1a1a2e',
    fontWeight: '900',
    fontSize: 14,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  messageButton: {
    flex: 0,
    minWidth: 92,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
  },
  messageButtonText: {
    fontSize: 13,
    color: '#1a1a2e',
    fontWeight: '900',
  },
  logoutButton: {
    marginTop: 10,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#dfb3ad',
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#fff1ee',
  },
  logoutButtonText: {
    color: '#b94a3f',
    fontSize: 13,
    fontWeight: '900',
  },
  sectionIntro: {
    marginTop: 16,
    marginBottom: 9,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionKicker: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  sectionTitle: {
    color: '#1a1a2e',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionMeta: {
    color: '#746b5e',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  tabRail: {
    flexDirection: 'row',
    gap: 9,
  },
  tabCard: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  tabCardActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  tabLabel: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: '#fff',
  },
  tabHint: {
    color: '#81786b',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  tabHintActive: {
    color: '#d7c49e',
  },
  previewCard: {
    width: '100%',
    alignSelf: 'center',
    minHeight: 94,
    borderRadius: 20,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 1,
  },
  previewImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#eee5d7',
    marginRight: 12,
  },
  previewIcon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewIconRoute: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  previewIconText: {
    color: '#9b8356',
    fontSize: 17,
    fontWeight: '900',
  },
  previewBody: {
    flex: 1,
    minWidth: 0,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  previewType: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  previewDate: {
    flex: 1,
    color: '#8a8275',
    fontSize: 11,
    fontWeight: '700',
  },
  previewTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  previewText: {
    color: '#746b5e',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 3,
  },
  previewMeta: {
    color: '#8a8275',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  previewArrow: {
    color: '#9b8356',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 8,
  },
  profileCard: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 26,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 15,
    marginBottom: 14,
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  },
  routeProfileCard: {
    paddingBottom: 12,
  },
  cardTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  cardKicker: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cardDate: {
    color: '#746b5e',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  routeBadge: {
    borderRadius: 999,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  routeBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  routeCaption: {
    color: '#302e3f',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  mediaCountBadge: {
    borderRadius: 999,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mediaCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  mediaPreview: {
    width: '100%',
    aspectRatio: 1.35,
    borderRadius: 22,
    backgroundColor: '#eee5d7',
  },
  mediaCaption: {
    color: '#302e3f',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 13,
  },
  cardMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  metricPill: {
    minWidth: 78,
    borderRadius: 16,
    backgroundColor: '#f4eddf',
    borderWidth: 1,
    borderColor: '#e1d5bf',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  metricValue: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#746b5e',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  noteCard: {
    backgroundColor: '#fffaf0',
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  noteIndex: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  noteIndexText: {
    color: '#d7c49e',
    fontSize: 13,
    fontWeight: '900',
  },
  noteHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  noteText: {
    color: '#1a1a2e',
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '800',
  },
  noteFooter: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eadfcd',
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  noteFooterText: {
    color: '#9b8356',
    fontSize: 12,
    fontWeight: '900',
  },
  noteMetricsInline: {
    flexDirection: 'row',
    gap: 10,
  },
  noteMetric: {
    color: '#746b5e',
    fontSize: 12,
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#746b5e',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#b94a3f',
    fontWeight: '800',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
  emptyContainer: {
    width: '100%',
    alignSelf: 'center',
    marginTop: 4,
    borderRadius: 28,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e8dfcf',
    padding: 28,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#1a1a2e',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  createButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
  },
});
