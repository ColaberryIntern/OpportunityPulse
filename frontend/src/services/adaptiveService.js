import api from './api';

const adaptiveService = {
  getAdaptiveLearning: () => api.get('/adaptive-learning'),
  trackBehavior: (action, metadata) =>
    api.post('/adaptive-learning/track', { action, metadata }),
};

export default adaptiveService;
