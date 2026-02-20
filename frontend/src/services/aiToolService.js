import api from './api';

const aiToolService = {
  list: (params = {}) => api.get('/ai-tools', { params }),
  getBySlug: (slug) => api.get(`/ai-tools/${slug}`),
  getTrending: (params = {}) => api.get('/ai-tools/trending', { params }),
  getStats: () => api.get('/ai-tools/stats'),
  getByIndustry: (industry) => api.get(`/ai-tools/industry/${encodeURIComponent(industry)}`),
  getMentions: (slug, params = {}) => api.get(`/ai-tools/${slug}/mentions`, { params }),
  refreshTrends: () => api.post('/ai-tools/refresh-trends'),
  getMomentum: (params = {}) => api.get('/ai-tools/momentum', { params }),
};

export default aiToolService;
