import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NotificationService from '../services/NotificationService';

export const notificationKeys = {
  all: ['notifications'],
  list: (category = 'ALL') => ['notifications', 'list', category],
  unreadCount: ['notifications', 'unreadCount'],
};

export const useNotifications = (category = 'ALL') => {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(category),
    queryFn: ({ pageParam = null }) =>
      NotificationService.fetchNotifications({ pageParam, category }),
    getNextPageParam: (lastPage) => {
      if (!lastPage?.nextPageCursor) return undefined;
      const rawCursor = String(lastPage.nextPageCursor);
      try {
        const nextUrl = new URL(rawCursor);
        return nextUrl.searchParams.get('page') || undefined;
      } catch {
        const match = rawCursor.match(/[?&]page=([^&]+)/);
        if (match?.[1]) return match[1];
        return undefined;
      }
    },
    staleTime: 60 * 1000,
  });
};

export const useUnreadNotifications = (enabled = true) => {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () => NotificationService.fetchUnreadCount(),
    enabled,
    staleTime: 30 * 1000,
  });
};

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId) => NotificationService.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    },
  });
};
