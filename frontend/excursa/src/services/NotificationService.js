import api from './api';

class NotificationService {
  normalizeList(payload) {
    if (!payload) {
      return { results: [], nextPageCursor: null, count: 0 };
    }

    if (Array.isArray(payload.results)) {
      return {
        ...payload,
        results: payload.results,
        nextPageCursor: payload.next || null,
        count: payload.count ?? payload.results.length,
      };
    }

    if (Array.isArray(payload)) {
      return { results: payload, nextPageCursor: null, count: payload.length };
    }

    return { results: [], nextPageCursor: null, count: 0 };
  }

  async fetchNotifications({ pageParam = null, category = null, isRead = null } = {}) {
    const params = {};
    if (pageParam) params.page = pageParam;
    if (category && category !== 'ALL') params.category = category;
    if (typeof isRead === 'boolean') params.is_read = isRead;

    const response = await api.get('/notifications/notifications/', { params });
    return this.normalizeList(response.data);
  }

  async fetchUnreadCount() {
    const response = await api.get('/notifications/notifications/unread_count/');
    return Number(response?.data?.unread_count) || 0;
  }

  async markAsRead(notificationId) {
    if (!notificationId) return null;
    const response = await api.patch(`/notifications/notifications/${notificationId}/mark_as_read/`);
    return response.data;
  }
}

export default new NotificationService();
