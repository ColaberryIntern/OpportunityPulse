import api from './api';

const analysisService = {
  getLatestInsights: () => api.get('/analysis/latest-insights'),
  getTrends: (type) => api.get(`/analysis/trends/${type}`),
  triggerScoring: (type) => api.post(`/analysis/score/${type}`),
  triggerTrendDetection: (type) => api.post(`/analysis/trends/${type}`),
  triggerInsightGeneration: () => api.post('/analysis/insights'),
};

export default analysisService;
