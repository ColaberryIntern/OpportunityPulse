import api from './api';

const alertService = {
  list: ({ type, severity, unreadOnly, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (type) params.append('type', type);
    if (severity) params.append('severity', severity);
    if (unreadOnly) params.append('unreadOnly', 'true');
    return api.get(`/alerts?${params.toString()}`);
  },
  getUnreadCount: () => api.get('/alerts/unread'),
  markAsRead: (id) => api.put(`/alerts/${id}/read`),
  markAllAsRead: () => api.put('/alerts/read-all'),
  delete: (id) => api.delete(`/alerts/${id}`),
};

export default alertService;
