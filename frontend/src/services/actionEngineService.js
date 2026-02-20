import api from './api';

const actionEngineService = {
  // Executive Brief
  getExecutiveBrief: () => api.get('/action-engine/executive-brief'),

  // Opportunity action plans
  getOpportunityActionPlan: (id) => api.get(`/action-engine/opportunity/${id}/action-plan`),
  generateActionPlan: (id, { useLLM = true } = {}) =>
    api.post(`/action-engine/opportunity/${id}/generate-plan`, { useLLM }),

  // Action tracking CRUD
  createAction: ({ opportunityId, actionType, notes }) =>
    api.post('/action-engine/actions', { opportunityId, actionType, notes }),
  updateAction: (id, { status, revenueGenerated, notes }) =>
    api.put(`/action-engine/actions/${id}`, { status, revenueGenerated, notes }),
  listActions: ({ status, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (status) params.append('status', status);
    return api.get(`/action-engine/actions?${params.toString()}`);
  },
  deleteAction: (id) => api.delete(`/action-engine/actions/${id}`),

  // Section Briefs
  getSectionBrief: (section) => api.get(`/action-engine/section-brief/${section}`),

  // Analytics
  getAnalytics: () => api.get('/action-engine/analytics'),

  // Admin triggers
  triggerClassification: ({ useLLM = false, type } = {}) =>
    api.post('/action-engine/classify', { useLLM, type }),
  triggerSaturation: () => api.post('/action-engine/saturation'),
  triggerRecommendations: ({ useLLM = true } = {}) =>
    api.post('/action-engine/recommendations', { useLLM }),
  triggerExecutiveBrief: () => api.post('/action-engine/executive-brief'),
};

export default actionEngineService;
