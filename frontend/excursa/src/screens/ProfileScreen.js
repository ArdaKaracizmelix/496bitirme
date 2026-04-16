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
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  useFollowUser,
  useUnfollowUser,
  useUserPosts,
  useUserProfile,
} from '../hooks/useSocial';
import useAuthStore from '../store/authStore';

const screenWidth = Dimensions.get('window').width;
const itemWidth = (screenWidth - 27) / 3;

export default function ProfileScreen({ route }) {
  const navigation = useNavigation();
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
  const [activeTab, setActiveTab] = useState('grid');

  const posts = postsData?.results || [];
  const postsCount = postsData?.count ?? posts.length;
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
        'https://i.pravatar.cc/150?img=1',
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
    }),
    [currentUser, profileData, routeParams, userId]
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
      if (confirmed) {
        runLogout();
      }
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

  const handleMessage = () => {
    if (isOwnProfile) return;
    Alert.alert('Bilgi', 'Mesajlasma ekrani yakinda gelecek.');
  };

  const handleOpenFollowList = (listType) => {
    if (!userId) return;
    navigation.navigate('FollowList', {
      userId,
      listType,
    });
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.topSection}>
        <Image source={{ uri: userProfile.avatar_url }} style={styles.profileAvatar} />
        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{postsCount}</Text>
            <Text style={styles.statLabel}>Gonderi</Text>
          </View>
          <TouchableOpacity
            style={styles.stat}
            onPress={() => handleOpenFollowList('followers')}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{userProfile.followers_count}</Text>
            <Text style={styles.statLabel}>Takipci</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stat}
            onPress={() => handleOpenFollowList('following')}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{userProfile.following_count}</Text>
            <Text style={styles.statLabel}>Takip</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.profileName}>{userProfile.full_name}</Text>
        {!!userProfile.bio && <Text style={styles.profileBio}>{userProfile.bio}</Text>}
      </View>

      <View style={styles.travelStats}>
        <View style={styles.statBox}>
          <Text style={styles.statBoxIcon}>P</Text>
          <Text style={styles.statBoxValue}>{profileData?.is_verified ? 'Onayli' : '-'}</Text>
          <Text style={styles.statBoxLabel}>Profil</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxIcon}>I</Text>
          <Text style={styles.statBoxValue}>{profileData?.interests?.length || 0}</Text>
          <Text style={styles.statBoxLabel}>Ilgi</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxIcon}>A</Text>
          <Text style={styles.statBoxValue}>{profileData?.has_interests ? 'Aktif' : '-'}</Text>
          <Text style={styles.statBoxLabel}>Akis</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        {isOwnProfile ? (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Text style={styles.actionButtonText}>Profili Duzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => Alert.alert('Ayarlar', 'Ayarlar sayfasi yakinda gelecek.')}
            >
              <Text style={styles.secondaryButtonText}>A</Text>
            </TouchableOpacity>
          </>
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
                  {isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.messageButton]}
              onPress={handleMessage}
            >
              <Text style={styles.messageButtonText}>Mesaj</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'grid' && styles.tabActive]}
          onPress={() => setActiveTab('grid')}
        >
          <Text style={[styles.tabText, activeTab === 'grid' && styles.tabTextActive]}>
            Grid
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'map' && styles.tabActive]}
          onPress={() => setActiveTab('map')}
        >
          <Text style={[styles.tabText, activeTab === 'map' && styles.tabTextActive]}>
            Harita
          </Text>
        </TouchableOpacity>
      </View>

      {isOwnProfile && (
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Cikis Yap</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderPostItem = ({ item }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() =>
        navigation.navigate('Social', {
          screen: 'PostDetail',
          params: { postId: item.id },
        })
      }
    >
      {item.media_urls?.[0] ? (
        <Image source={{ uri: item.media_urls[0] }} style={styles.gridImage} />
      ) : (
        <View style={styles.gridImagePlaceholder}>
          <Text style={styles.gridImagePlaceholderText}>Post</Text>
        </View>
      )}
      <View style={styles.gridOverlay}>
        <View style={styles.gridStats}>
          <Text style={styles.gridStatItem}>L {item.likes_count || 0}</Text>
          <Text style={styles.gridStatItem}>Y {item.comments_count || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMapView = () => (
    <View style={styles.mapContainer}>
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderIcon}>Harita</Text>
        <Text style={styles.mapPlaceholderText}>Harita gorunumu yakinda gelecek</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Veriler yuklenemedi</Text>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activeTab === 'grid' ? (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id?.toString()}
          renderItem={renderPostItem}
          numColumns={3}
          columnWrapperStyle={styles.columnWrapper}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Henuz gonderi yok</Text>
              {isOwnProfile && (
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => navigation.navigate('CreatePost')}
                >
                  <Text style={styles.createButtonText}>Ilk gonderini olustur</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          scrollIndicatorInsets={{ right: 1 }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderHeader()}
          {renderMapView()}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginRight: 16,
  },
  statsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  infoSection: {
    marginBottom: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  profileBio: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  travelStats: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  statBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  statBoxIcon: {
    fontSize: 18,
    marginBottom: 4,
    color: '#1a1a2e',
    fontWeight: '800',
  },
  statBoxValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  statBoxLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    flex: 0,
    width: '20%',
    backgroundColor: '#f5f5f5',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#1a1a2e',
    fontWeight: '700',
  },
  followingButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#1a1a2e',
  },
  followingButtonText: {
    color: '#1a1a2e',
    fontWeight: '600',
    fontSize: 14,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  messageButton: {
    flex: 0,
    width: '24%',
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  messageButtonText: {
    fontSize: 13,
    color: '#1a1a2e',
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#1a1a2e',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#1a1a2e',
  },
  logoutButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e74c3c',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff5f5',
  },
  logoutButtonText: {
    color: '#e74c3c',
    fontSize: 13,
    fontWeight: '700',
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 1,
  },
  gridItem: {
    width: itemWidth,
    height: itemWidth,
    marginBottom: 1,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e5e5',
  },
  gridImagePlaceholderText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '700',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridStats: {
    flexDirection: 'row',
    gap: 12,
  },
  gridStatItem: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#e74c3c',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 16,
  },
  createButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1a2e',
    borderRadius: 6,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  mapContainer: {
    height: 400,
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderIcon: {
    fontSize: 20,
    marginBottom: 12,
    color: '#1a1a2e',
    fontWeight: '700',
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: '#999',
  },
});
