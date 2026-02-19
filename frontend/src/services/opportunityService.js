import api from './api';

const opportunityService = {
  list: ({ type, category, status, q, sort, minScore, actionType, domain, capability, intent, monetization, maturity, geo, quadrant, cluster, page = 1, limit = 20 } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (type) params.append('type', type);
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (q) params.append('q', q);
    if (sort) params.append('sort', sort);
    if (minScore) params.append('minScore', minScore);
    if (actionType) params.append('actionType', actionType);
    if (domain) params.append('domain', domain);
    if (capability) params.append('capability', capability);
    if (intent) params.append('intent', intent);
    if (monetization) params.append('monetization', monetization);
    if (maturity) params.append('maturity', maturity);
    if (geo) params.append('geo', geo);
    if (quadrant) params.append('quadrant', quadrant);
    if (cluster) params.append('cluster', cluster);
    return api.get(`/opportunities?${params.toString()}`);
  },
  getById: (id) => api.get(`/opportunities/${id}`),
  getStats: () => api.get('/opportunities/stats'),
};

export default opportunityService;
