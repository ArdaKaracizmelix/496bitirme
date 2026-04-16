import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RouteShareCard from './RouteShareCard';
import { getPostPresentation } from '../utils/routeShareUtils';

const FALLBACK_AVATAR = 'https://i.pravatar.cc/150?img=12';

export default function SocialPostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onUserPress,
  onMorePress,
}) {
  const mediaUrls = Array.isArray(post?.media_urls) ? post.media_urls.filter(Boolean) : [];
  const firstMedia = mediaUrls[0];
  const hasMedia = !!firstMedia;
  const { cleanedContent: content, routeData } = getPostPresentation(post);
  const hasText = content.length > 0;
  const ownerId = post?.user_ref_id || post?.user_id;
  const isOwner = String(currentUserId || '') === String(ownerId || '');
  const likesCount = Number(post?.likes_count) || 0;
  const commentsCount = Number(post?.comments_count) || 0;
  const userName = post?.user_name || 'Gezgin';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable style={styles.author} onPress={() => onUserPress(post)}>
          <Image
            source={{ uri: post?.avatar_url || FALLBACK_AVATAR }}
            style={styles.avatar}
          />
          <View style={styles.authorTextWrap}>
            <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {post?.location ? post.location : 'Excursa seyahat akisi'} · {formatTimeAgo(post?.created_at)}
            </Text>
          </View>
        </Pressable>

        {isOwner ? (
          <TouchableOpacity style={styles.moreButton} onPress={() => onMorePress(post.id)}>
            <Text style={styles.moreText}>•••</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {hasMedia ? (
        <Pressable style={styles.mediaWrap} onPress={() => onComment(post.id)}>
          <Image source={{ uri: firstMedia }} style={styles.media} resizeMode="cover" />
          {mediaUrls.length > 1 ? (
            <View style={styles.mediaBadge}>
              <Text style={styles.mediaBadgeText}>1/{mediaUrls.length}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : hasText ? (
        <Pressable style={styles.textOnlyPanel} onPress={() => onComment(post.id)}>
          <Text style={styles.textOnlyQuote}>{content}</Text>
        </Pressable>
      ) : null}

      {routeData ? <RouteShareCard routeData={routeData} /> : null}

      <View style={styles.actionsRow}>
        <View style={styles.leftActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onLike(post.id)}>
            <Text style={[styles.actionIcon, post?.liked && styles.likeActive]}>
              {post?.liked ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => onComment(post.id)}>
            <Text style={styles.commentIcon}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => onShare(post)}>
            <Text style={styles.actionIcon}>↗</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.saveButton}>
          <Text style={styles.actionIcon}>□</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.likesText}>
          {likesCount > 0 ? `${likesCount} begeni` : 'Ilk begenen sen ol'}
        </Text>
        {hasText && (hasMedia || routeData) ? (
          <Text style={styles.caption} numberOfLines={3}>
            <Text style={styles.captionUser}>{userName} </Text>
            {content}
          </Text>
        ) : null}
        <TouchableOpacity onPress={() => onComment(post.id)}>
          <Text style={styles.commentsText}>
            {commentsCount > 0 ? `${commentsCount} yorumu gor` : 'Yorum ekle'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function formatTimeAgo(timestamp) {
  if (!timestamp) return 'simdi';
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.max(0, Math.floor((now - date) / 1000));

  if (seconds < 60) return 'simdi';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gun`;
  const weeks = Math.floor(days / 7);
  return `${weeks} hf`;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    backgroundColor: '#fffdf8',
    borderRadius: 28,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#ece3d3',
    overflow: 'hidden',
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  author: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 11,
    borderWidth: 2,
    borderColor: '#d7c49e',
    backgroundColor: '#eee5d7',
  },
  authorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: '#1a1a2e',
    fontSize: 14,
    fontWeight: '900',
  },
  metaText: {
    color: '#81786b',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4eddf',
    marginLeft: 8,
  },
  moreText: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mediaWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#eee6d8',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  mediaBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(26,26,46,0.72)',
  },
  mediaBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  textOnlyPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#f7f3ea',
    borderWidth: 1,
    borderColor: '#ebe1d1',
  },
  textOnlyQuote: {
    color: '#1a1a2e',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  saveButton: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    color: '#1a1a2e',
    fontSize: 25,
    fontWeight: '900',
  },
  linkIcon: {
    color: '#1a1a2e',
    fontSize: 20,
    fontWeight: '900',
  },
  commentIcon: {
    color: '#1a1a2e',
    fontSize: 21,
    fontWeight: '900',
  },
  likeActive: {
    color: '#d43f57',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 16,
  },
  likesText: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 5,
  },
  caption: {
    color: '#302e3f',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 7,
  },
  captionUser: {
    color: '#1a1a2e',
    fontWeight: '900',
  },
  commentsText: {
    color: '#8a8275',
    fontSize: 13,
    fontWeight: '700',
  },
});
