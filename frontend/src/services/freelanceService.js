import api from './api';

const freelanceService = {
  getOpportunities: (params = {}) => api.get('/freelance/opportunities', { params }),
  getOpportunity: (id) => api.get(`/freelance/opportunities/${id}`),
  getTrends: (params = {}) => api.get('/freelance/trends', { params }),
  getSkillTrend: (skill, params = {}) => api.get(`/freelance/trends/${encodeURIComponent(skill)}`, { params }),
  generateAction: (id, actionType) => api.post(`/freelance/actions/${id}/generate`, { actionType }),
  importProjects: (projects) => api.post('/freelance/import', { projects }),
};

export default freelanceService;
