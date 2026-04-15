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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import SocialService from '../services/SocialService';

export default function FollowListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const userId = route?.params?.userId;
  const type = route?.params?.type === 'following' ? 'following' : 'followers';

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['followList', userId, type],
    queryFn: () => SocialService.fetchFollowList(userId, type),
    enabled: !!userId,
  });

  const rows = data?.results || [];
  const title = type === 'following' ? 'Takip Edilenler' : 'Takipçiler';

  const handleUserPress = (profile) => {
    if (!profile?.id) return;
    navigation.navigate('UserProfile', {
      userId: String(profile.id),
      user_name: profile.username,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a2e" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Liste yüklenemedi</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={rows.length === 0 ? styles.emptyContainer : undefined}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handleUserPress(item)}>
            <Image
              source={{ uri: item.avatar_url || 'https://i.pravatar.cc/150?img=1' }}
              style={styles.avatar}
            />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {item.full_name || item.username || 'Kullanıcı'}
              </Text>
              {!!item.username && (
                <Text style={styles.username} numberOfLines={1}>
                  @{item.username}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz hesap yok</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    backgroundColor: '#fff',
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ececec',
  },
  meta: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  username: {
    marginTop: 2,
    fontSize: 13,
    color: '#666',
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#a94442',
    marginBottom: 10,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
});
