import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUserFollowList } from '../hooks/useSocial';

export default function FollowListScreen({ route }) {
  const navigation = useNavigation();
  const routeParams = route?.params || {};
  const userId = routeParams.userId ? String(routeParams.userId) : '';
  const listType = routeParams.listType === 'following' ? 'following' : 'followers';
  const screenTitle = listType === 'following' ? 'Takip Edilenler' : 'Takipciler';

  const { data, isLoading, isError, refetch } = useUserFollowList(userId, listType);
  const users = data?.results || [];

  const handleOpenProfile = (profile) => {
    navigation.navigate('UserProfile', {
      userId: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      followers_count: profile.followers_count,
      following_count: profile.following_count,
    });
  };

  const renderUser = ({ item }) => (
    <TouchableOpacity style={styles.userRow} onPress={() => handleOpenProfile(item)}>
      <Image
        source={{ uri: item.avatar_url || 'https://i.pravatar.cc/150?img=1' }}
        style={styles.avatar}
      />
      <View style={styles.userMeta}>
        <Text style={styles.fullName} numberOfLines={1}>
          {item.full_name || item.username || 'Kullanici'}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          @{item.username || 'user'}
        </Text>
      </View>
      <Text style={styles.chevron}>{'>'}</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Liste yuklenemedi.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{screenTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderUser}
        contentContainerStyle={users.length === 0 ? styles.emptyContainer : styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>Bu listede kimse yok.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    fontSize: 24,
    color: '#1a1a2e',
    fontWeight: '700',
    width: 28,
  },
  headerSpacer: {
    width: 28,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  listContainer: {
    paddingVertical: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f7f7f7',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  userMeta: {
    flex: 1,
  },
  fullName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  username: {
    marginTop: 2,
    fontSize: 13,
    color: '#777',
  },
  chevron: {
    fontSize: 18,
    color: '#bbb',
    marginLeft: 8,
    fontWeight: '700',
  },
  errorText: {
    color: '#d63031',
    fontSize: 15,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#999',
    fontSize: 15,
  },
});
