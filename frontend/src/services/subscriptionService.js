import api from './api';

const subscriptionService = {
  getCurrentSubscription: () => api.get('/subscriptions'),
  upgrade: () => api.post('/subscriptions/upgrade'),
  downgrade: () => api.post('/subscriptions/downgrade'),
  getHistory: () => api.get('/subscriptions/history'),
};

export default subscriptionService;
