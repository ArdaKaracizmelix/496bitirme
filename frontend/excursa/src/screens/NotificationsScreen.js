import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AppAvatar from '../components/AppAvatar';
import {
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotifications,
} from '../hooks/useNotifications';
import { formatTimeAgo } from '../components/SocialPostCard';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVITY', label: 'Activity' },
  { key: 'ROUTES', label: 'Routes' },
  { key: 'SYSTEM', label: 'System' },
];

const CATEGORY_META = {
  ACTIVITY: { label: 'Activity', symbol: '@', color: '#1a1a2e', bg: '#eee7d9' },
  ROUTES: { label: 'Routes', symbol: 'R', color: '#7b5f2d', bg: '#f3e5bd' },
  SYSTEM: { label: 'System', symbol: '!', color: '#2f6f54', bg: '#dff1e7' },
};

const getNotificationTarget = (notification) => {
  const data = notification?.data || {};
  const screen = data.screen;

  if (screen === 'PostDetail' && data.post_id) {
    return { routeName: 'PostDetail', params: { postId: String(data.post_id) } };
  }

  if (screen === 'UserProfile' && data.profile_id) {
    return { routeName: 'UserProfile', params: { userId: String(data.profile_id) } };
  }

  if (screen === 'InterestSelection') {
    return { routeName: 'InterestSelection', params: { fromNotifications: true } };
  }

  const postRef = notification?.target_object_ref;
  if (postRef && String(notification?.verb || '').includes('POST')) {
    return { routeName: 'PostDetail', params: { postId: String(postRef) } };
  }

  if (postRef && String(notification?.verb || '').includes('ROUTE')) {
    return { routeName: 'PostDetail', params: { postId: String(postRef) } };
  }

  return null;
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState('ALL');
  const {
    data,
    isLoading,
    isError,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications(category);
  const unreadQuery = useUnreadNotifications();
  const markReadMutation = useMarkNotificationRead();

  const notifications = useMemo(
    () => data?.pages?.flatMap((page) => page?.results || []) || [],
    [data]
  );
  const contentMaxWidth = width >= 900 ? 740 : 640;
  const unreadCount = Number(unreadQuery.data) || 0;

  const handleNotificationPress = async (notification) => {
    if (!notification?.is_read) {
      markReadMutation.mutate(notification.id);
    }

    const target = getNotificationTarget(notification);
    if (target) {
      navigation.navigate(target.routeName, target.params);
    }
  };

  const renderHeader = () => (
    <View style={[styles.headerWrap, { maxWidth: contentMaxWidth }]}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.kicker}>EXCURSA</Text>
          <Text style={styles.title}>Notifications</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryTitle}>
            {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
          </Text>
          <Text style={styles.summarySubtitle}>
            Likes, comments, follows, routes and important account updates live here.
          </Text>
        </View>
        <View style={styles.summaryBadge}>
          <Text style={styles.summaryBadgeText}>{unreadCount}</Text>
        </View>
      </View>

      <FlatList
        data={FILTERS}
        horizontal
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRail}
        renderItem={({ item }) => {
          const active = item.key === category;
          return (
            <Pressable
              onPress={() => setCategory(item.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );

  const renderNotification = ({ item }) => (
    <NotificationItem notification={item} onPress={() => handleNotificationPress(item)} />
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#1a1a2e" size="large" />
          <Text style={styles.stateTitle}>Loading notifications</Text>
          <Text style={styles.stateSubtitle}>We are gathering your latest travel activity.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>Notifications could not load</Text>
          <Text style={styles.stateSubtitle}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderNotification}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={[styles.emptyCard, { maxWidth: contentMaxWidth }]}>
            <Text style={styles.emptySymbol}>@</Text>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtitle}>
              When people interact with your posts, routes or profile, the signal will appear here.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#1a1a2e" />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color="#1a1a2e" size="small" />
            </View>
          ) : <View style={styles.footerSpacer} />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function NotificationItem({ notification, onPress }) {
  const category = notification?.category || 'ACTIVITY';
  const meta = CATEGORY_META[category] || CATEGORY_META.ACTIVITY;
  const unread = !notification?.is_read;
  const avatar = notification?.actor_avatar_url || null;
  const actorName = notification?.actor_name;

  return (
    <TouchableOpacity
      style={[styles.notificationCard, unread && styles.notificationCardUnread]}
      activeOpacity={0.86}
      onPress={onPress}
    >
      <View style={styles.avatarWrap}>
        {actorName ? (
          <AppAvatar uri={avatar} style={styles.avatar} />
        ) : (
          <View style={[styles.systemAvatar, { backgroundColor: meta.bg }]}>
            <Text style={[styles.systemAvatarText, { color: meta.color }]}>{meta.symbol}</Text>
          </View>
        )}
        <View style={[styles.typePill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.typePillText, { color: meta.color }]}>{meta.symbol}</Text>
        </View>
      </View>

      <View style={styles.notificationBody}>
        <View style={styles.notificationTop}>
          <Text style={styles.notificationTitle} numberOfLines={2}>
            {notification?.title || 'Excursa update'}
          </Text>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text style={styles.notificationCopy} numberOfLines={2}>
          {notification?.body || 'Open Excursa to see what changed.'}
        </Text>
        <View style={styles.notificationMeta}>
          <Text style={styles.categoryText}>{meta.label}</Text>
          <Text style={styles.metaSeparator}>-</Text>
          <Text style={styles.timeText}>{formatTimeAgo(notification?.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f3ea',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 32,
  },
  headerWrap: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  backButton: {
    minWidth: 58,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e6dccd',
  },
  backText: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
  },
  headerTitleWrap: {
    flex: 1,
  },
  kicker: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  title: {
    color: '#1a1a2e',
    fontSize: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 58,
    height: 40,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 26,
    padding: 18,
    marginBottom: 14,
    backgroundColor: '#1a1a2e',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 22,
    elevation: 4,
  },
  summaryTitle: {
    color: '#fffdf8',
    fontSize: 19,
    fontWeight: '900',
  },
  summarySubtitle: {
    color: '#d8ccb8',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 5,
    maxWidth: 430,
  },
  summaryBadge: {
    minWidth: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d7c49e',
    marginLeft: 12,
  },
  summaryBadgeText: {
    color: '#1a1a2e',
    fontSize: 18,
    fontWeight: '900',
  },
  filterRail: {
    gap: 9,
    paddingRight: 12,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#e6dccd',
  },
  filterChipActive: {
    backgroundColor: '#d7c49e',
    borderColor: '#d7c49e',
  },
  filterText: {
    color: '#746b5e',
    fontSize: 13,
    fontWeight: '900',
  },
  filterTextActive: {
    color: '#1a1a2e',
  },
  notificationCard: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 14,
    marginBottom: 10,
    borderRadius: 24,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#ece3d3',
  },
  notificationCardUnread: {
    borderColor: '#d7c49e',
    backgroundColor: '#fff8ea',
  },
  avatarWrap: {
    width: 54,
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eee5d7',
  },
  systemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemAvatarText: {
    fontSize: 18,
    fontWeight: '900',
  },
  typePill: {
    position: 'absolute',
    right: 0,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fffdf8',
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  notificationBody: {
    flex: 1,
    minWidth: 0,
  },
  notificationTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    color: '#1a1a2e',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#d43f57',
    marginTop: 5,
  },
  notificationCopy: {
    color: '#5f584f',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 4,
  },
  notificationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
  },
  categoryText: {
    color: '#9b8356',
    fontSize: 11,
    fontWeight: '900',
  },
  metaSeparator: {
    color: '#b7aa96',
    fontSize: 11,
    fontWeight: '900',
    marginHorizontal: 6,
  },
  timeText: {
    color: '#8a8275',
    fontSize: 11,
    fontWeight: '800',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: '#1a1a2e',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center',
  },
  stateSubtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyCard: {
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: 28,
    padding: 28,
    marginTop: 10,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#ece3d3',
  },
  emptySymbol: {
    color: '#d7c49e',
    fontSize: 34,
    fontWeight: '900',
  },
  emptyTitle: {
    color: '#1a1a2e',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 8,
  },
  emptySubtitle: {
    color: '#746b5e',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 7,
  },
  footerLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 18,
  },
});
