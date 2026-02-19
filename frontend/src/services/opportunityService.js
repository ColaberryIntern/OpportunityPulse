import api from './api';

const opportunityService = {
  list: ({ type, category, status, q, sort, minScore, actionType, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (type) params.append('type', type);
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (q) params.append('q', q);
    if (sort) params.append('sort', sort);
    if (minScore) params.append('minScore', minScore);
    if (actionType) params.append('actionType', actionType);
    return api.get(`/opportunities?${params.toString()}`);
  },
  getById: (id) => api.get(`/opportunities/${id}`),
  getStats: () => api.get('/opportunities/stats'),
};

export default opportunityService;
