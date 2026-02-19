import api from './api';

const savedOpportunityService = {
  getSavedOpportunities: ({ page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    return api.get(`/saved-opportunities?${params.toString()}`);
  },
  saveOpportunity: (opportunityId) =>
    api.post('/saved-opportunities', { opportunityId }),
  unsaveOpportunity: (opportunityId) =>
    api.delete(`/saved-opportunities/${opportunityId}`),
  checkSaved: (opportunityId) =>
    api.get(`/saved-opportunities/${opportunityId}/check`),
  batchCheckSaved: (opportunityIds) =>
    api.post('/saved-opportunities/batch-check', { opportunityIds }),
};

export default savedOpportunityService;
