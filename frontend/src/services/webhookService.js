import api from './api';

const webhookService = {
  list: () => api.get('/webhooks'),
  create: ({ url, eventTypes, description }) =>
    api.post('/webhooks', { url, eventTypes, description }),
  update: (id, data) => api.put(`/webhooks/${id}`, data),
  remove: (id) => api.delete(`/webhooks/${id}`),
  test: (id) => api.post(`/webhooks/${id}/test`),
  deliveries: (id, { page = 1, limit = 20 } = {}) =>
    api.get(`/webhooks/${id}/deliveries`, { params: { page, limit } }),
};

export default webhookService;
