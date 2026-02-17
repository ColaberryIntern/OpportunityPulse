import api from './api';

const contentService = {
  create: (data) => api.post('/content', data),
  list: ({ page = 1, limit = 20, status, category } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    return api.get(`/content?${params.toString()}`);
  },
  getById: (id) => api.get(`/content/${id}`),
  update: (id, data) => api.put(`/content/${id}`, data),
  delete: (id) => api.delete(`/content/${id}`),
};

export default contentService;
