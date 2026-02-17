import api from './api';

const feedbackService = {
  create: (data) => api.post('/feedback', data),
  list: ({ page = 1, limit = 20, type, status } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    return api.get(`/feedback?${params.toString()}`);
  },
  getById: (id) => api.get(`/feedback/${id}`),
  update: (id, data) => api.put(`/feedback/${id}`, data),
  delete: (id) => api.delete(`/feedback/${id}`),
  getStats: () => api.get('/feedback/stats'),
};

export default feedbackService;
