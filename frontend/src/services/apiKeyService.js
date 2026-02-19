import api from './api';

const apiKeyService = {
  list: () => api.get('/api-keys'),
  create: ({ name, scopes }) => api.post('/api-keys', { name, scopes }),
  update: (id, { name, scopes }) => api.patch(`/api-keys/${id}`, { name, scopes }),
  revoke: (id) => api.delete(`/api-keys/${id}`),
};

export default apiKeyService;
