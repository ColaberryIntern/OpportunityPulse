import api from './api';

const dashboardService = {
  getStats: () => api.get('/dashboard/stats'),
  getActivity: ({ page = 1, limit = 20 } = {}) =>
    api.get(`/dashboard/activity?page=${page}&limit=${limit}`),
  getOpportunityStats: () => api.get('/dashboard/opportunity-stats'),
  getChartData: ({ type, period } = {}) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (period) params.append('period', period);
    const qs = params.toString();
    return api.get(`/dashboard/charts${qs ? `?${qs}` : ''}`);
  },
  getTrendSummary: () => api.get('/dashboard/trends'),
};

export default dashboardService;
