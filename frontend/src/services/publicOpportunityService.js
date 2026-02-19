import axios from 'axios';

const publicApi = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

const publicOpportunityService = {
  list: ({ type, category, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (type) params.append('type', type);
    if (category) params.append('category', category);
    return publicApi.get(`/public/opportunities?${params.toString()}`);
  },
  getById: (id) => publicApi.get(`/public/opportunities/${id}`),
  getStats: () => publicApi.get('/public/opportunities/stats'),
};

export default publicOpportunityService;
