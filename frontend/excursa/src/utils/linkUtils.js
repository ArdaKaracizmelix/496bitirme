import { Platform } from 'react-native';

export const buildPostLink = (postId) => {
  const safePostId = encodeURIComponent(String(postId || ''));
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const origin = window.location?.origin || '';
    return `${origin}/post/${safePostId}`;
  }
  return `excursa://post/${safePostId}`;
};

export const copyTextToClipboard = async (text) => {
  if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (globalThis?.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  }

  return false;
};
