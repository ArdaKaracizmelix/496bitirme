import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFollowList } from '../hooks/useSocial';

export default function FollowersListScreen({ route }) {
  const navigation = useNavigation();
  const routeParams = route?.params || {};
  const userId = routeParams.userId;
  const profileName = routeParams.full_name || routeParams.user_name || 'Kullanici';
  const initialTab = routeParams.initialTab === 'following' ? 'following' : 'followers';
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data, isLoading, isError, refetch } = useFollowList(userId, activeTab);

  const list = useMemo(() => data?.results || [], [data]);

  const navigateToProfile = (profile) => {
    const routeNames = navigation.getState()?.routeNames || [];
    const targetRoute = routeNames.includes('UserProfile') ? 'UserProfile' : 'ProfileHome';
    navigation.navigate(targetRoute, {
      userId: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
    });
  };

  const renderRow = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => navigateToProfile(item)}>
      <Image
        source={{ uri: item.avatar_url || 'https://i.pravatar.cc/150?img=1' }}
        style={styles.avatar}
      />
      <View style={styles.rowInfo}>
        <Text style={styles.fullName}>{item.full_name || 'Kullanici'}</Text>
        <Text style={styles.username}>@{item.username || 'user'}</Text>
        {!!item.bio && (
          <Text style={styles.bio} numberOfLines={1}>
            {item.bio}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {profileName}
        </Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'followers' && styles.tabActive]}
          onPress={() => setActiveTab('followers')}
        >
          <Text style={[styles.tabText, activeTab === 'followers' && styles.tabTextActive]}>
            Takipciler
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'following' && styles.tabActive]}
          onPress={() => setActiveTab('following')}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>
            Takip
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1a1a2e" />
        </View>
      ) : isError ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>Liste yuklenemedi.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={list.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Henuz kimse yok.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f4f4f4',
    marginRight: 10,
  },
  backText: {
    color: '#1a1a2e',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f3f3',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f7f7f7',
  },
  tabActive: {
    backgroundColor: '#1a1a2e',
  },
  tabText: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    backgroundColor: '#efefef',
  },
  rowInfo: {
    flex: 1,
  },
  fullName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  username: {
    marginTop: 2,
    fontSize: 12,
    color: '#888',
  },
  bio: {
    marginTop: 2,
    fontSize: 12,
    color: '#666',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
  },
  errorText: {
    fontSize: 14,
    color: '#d9534f',
    marginBottom: 10,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
