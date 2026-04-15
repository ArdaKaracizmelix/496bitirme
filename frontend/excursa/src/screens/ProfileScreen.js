import React, { useState } from 'react';
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
import { useUserPosts, useUserProfile } from '../hooks/useSocial';
import useAuthStore from '../store/authStore';

const screenWidth = Dimensions.get('window').width;
const itemWidth = (screenWidth - 3) / 3; // 3 columns with 1px gap

/**
 * ProfileScreen Component
 * Displays user profile with stats, posts grid, and map view
 * Can show own profile or other users' profiles
 */
export default function ProfileScreen({ route }) {
  const navigation = useNavigation();
  const { user: currentUser } = useAuthStore();
  const logout = useAuthStore((state) => state.logout);
  const routeParams = route?.params || {};
  const currentUserId = String(
    currentUser?.id || currentUser?.profile_id || currentUser?.profile?.id || ''
  );
  const routeUserId = routeParams.userId ? String(routeParams.userId) : '';

  // Determine which user profile to show
  const isOwnProfile = !routeUserId || routeUserId === currentUserId;
  const userId = routeUserId || currentUserId;

  const {
    data: profileData,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useUserProfile(userId, isOwnProfile);

  // Fetch user posts
  const {
    data: postsData,
    isLoading: isPostsLoading,
    isError: isPostsError,
    refetch: refetchPosts,
  } = useUserPosts(userId);

  const [activeTab, setActiveTab] = useState('grid'); // 'grid' or 'map'
  const [isFollowing, setIsFollowing] = useState(false);

  const posts = postsData?.results || [];
  const postsCount = postsData?.count ?? posts.length;
  const isLoading = isProfileLoading || isPostsLoading;
  const isError = isProfileError || isPostsError;

  const userProfile = {
    id: userId,
    full_name: isOwnProfile
      ? (currentUser?.full_name || profileData?.username || profileData?.email || 'Kullanıcı')
      : (routeParams.full_name || routeParams.user_name || profileData?.username || profileData?.email || 'Kullanıcı'),
    avatar_url: profileData?.avatar_url || routeParams.avatar_url || currentUser?.avatar_url || 'https://i.pravatar.cc/150?img=1',
    bio: profileData?.bio ?? routeParams.bio ?? currentUser?.bio ?? '',
    followers_count: profileData?.followers_count ?? currentUser?.followers_count ?? routeParams.followers_count ?? 0,
    following_count: profileData?.following_count ?? currentUser?.following_count ?? routeParams.following_count ?? 0,
  };

  const handleLogout = () => {
    const runLogout = async () => {
      try {
        await logout();
      } catch (error) {
        Alert.alert('Hata', 'Çıkış yapılırken bir hata oluştu.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined'
        ? window.confirm('Hesabınızdan çıkış yapmak istiyor musunuz?')
        : true;
      if (confirmed) {
        runLogout();
      }
      return;
    }

    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: runLogout,
        },
      ]
    );
  };

  /**
   * Handle follow/unfollow
   */
  const handleFollowToggle = async () => {
    if (isOwnProfile) return;

    try {
      setIsFollowing(!isFollowing);
      // TODO: Call backend follow/unfollow API
      Alert.alert(
        'Bilgi',
        isFollowing ? 'Artık bu kullanıcıyı takip etmiyorsunuz' : 'Takip edildi!',
        [{ text: 'Tamam' }]
      );
    } catch (error) {
      Alert.alert('Hata', 'Takip işlemi başarısız oldu');
      setIsFollowing(!isFollowing);
    }
  };

  /**
   * Handle message
   */
  const handleMessage = () => {
    if (isOwnProfile) {
      return;
    }
    navigation.navigate('Chat', { userId, userName: userProfile.full_name });
  };

  /**
   * Render profile header
   */
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Profile Photo and Stats */}
      <View style={styles.topSection}>
        <Image source={{ uri: userProfile.avatar_url }} style={styles.profileAvatar} />
        <View style={styles.statsContainer}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{postsCount}</Text>
            <Text style={styles.statLabel}>Gönderi</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{userProfile.followers_count}</Text>
            <Text style={styles.statLabel}>Takipçi</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{userProfile.following_count}</Text>
            <Text style={styles.statLabel}>Takip</Text>
          </View>
        </View>
      </View>

      {/* Profile Info */}
      <View style={styles.infoSection}>
          <Text style={styles.profileName}>{userProfile.full_name}</Text>
        {!!userProfile.bio && <Text style={styles.profileBio}>{userProfile.bio}</Text>}
      </View>

      {/* Travel Stats */}
      <View style={styles.travelStats}>
        <View style={styles.statBox}>
          <Text style={styles.statBoxIcon}>🌍</Text>
          <Text style={styles.statBoxValue}>-</Text>
          <Text style={styles.statBoxLabel}>Ülke</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxIcon}>🏙️</Text>
          <Text style={styles.statBoxValue}>-</Text>
          <Text style={styles.statBoxLabel}>Şehir</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statBoxIcon}>✈️</Text>
          <Text style={styles.statBoxValue}>-</Text>
          <Text style={styles.statBoxLabel}>Km</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {isOwnProfile ? (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Text style={styles.actionButtonText}>Profili Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => Alert.alert('Ayarlar', 'Ayarlar sayfası yakında gelecek')}
            >
              <Text style={styles.secondaryButtonText}>⚙️</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.actionButton,
                isFollowing && styles.followingButton,
              ]}
              onPress={handleFollowToggle}
            >
              <Text style={isFollowing ? styles.followingButtonText : styles.actionButtonText}>
                {isFollowing ? 'Takip Ediliyor' : 'Takip Et'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.messageButton]}
              onPress={handleMessage}
            >
              <Text style={styles.messageButtonText}>💬</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'grid' && styles.tabActive]}
          onPress={() => setActiveTab('grid')}
        >
          <Text style={[styles.tabText, activeTab === 'grid' && styles.tabTextActive]}>
            🖼️ Grid
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'map' && styles.tabActive]}
          onPress={() => setActiveTab('map')}
        >
          <Text style={[styles.tabText, activeTab === 'map' && styles.tabTextActive]}>
            🗺️ Harita
          </Text>
        </TouchableOpacity>
      </View>

      {isOwnProfile && (
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  /**
   * Render post grid item
   */
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
        <Image
          source={{ uri: item.media_urls[0] }}
          style={styles.gridImage}
        />
      ) : (
        <View style={styles.gridImagePlaceholder}>
          <Text style={styles.gridImagePlaceholderText}>🖼️</Text>
        </View>
      )}
      {item.media_urls && item.media_urls.length > 1 && (
        <View style={styles.multiMediaIndicator}>
          <Text style={styles.multiMediaIcon}>📷</Text>
        </View>
      )}
      <View style={styles.gridOverlay}>
        <View style={styles.gridStats}>
          <Text style={styles.gridStatItem}>❤️ {item.likes_count || 0}</Text>
          <Text style={styles.gridStatItem}>💬 {item.comments_count || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  /**
   * Render map view (placeholder)
   */
  const renderMapView = () => (
    <View style={styles.mapContainer}>
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderIcon}>🗺️</Text>
        <Text style={styles.mapPlaceholderText}>Harita görünümü çok yakında</Text>
      </View>
    </View>
  );

  // Render loading state
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

  // Render error state
  if (isError) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Veriler yüklenemedi</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              refetchProfile();
              refetchPosts();
            }}
          >
            <Text style={styles.retryButtonText}>Tekrar Deneyin</Text>
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
              <Text style={styles.emptyText}>Henüz gönderi yok</Text>
              {isOwnProfile && (
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => navigation.navigate('CreatePost')}
                >
                  <Text style={styles.createButtonText}>İlk Gönderini Oluştur</Text>
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
    fontSize: 24,
    marginBottom: 4,
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
    fontSize: 18,
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
  messageButton: {
    flex: 0,
    width: '20%',
    backgroundColor: '#f5f5f5',
  },
  messageButtonText: {
    fontSize: 18,
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
    fontSize: 22,
    color: '#888',
  },
  multiMediaIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  multiMediaIcon: {
    fontSize: 12,
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0,
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
    fontSize: 48,
    marginBottom: 12,
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: '#999',
  },
});
