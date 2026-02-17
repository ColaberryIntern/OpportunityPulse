import api from './api';

const alertPrefService = {
  getPreferences: () => api.get('/alert-preferences'),
  updatePreferences: (data) => api.put('/alert-preferences', data),
};

export default alertPrefService;
