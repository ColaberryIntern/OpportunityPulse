import api from './api';

const intelligenceService = {
  // Dimension lists
  getDomains: () => api.get('/intelligence/domains'),
  getCapabilities: () => api.get('/intelligence/capabilities'),
  getIntents: () => api.get('/intelligence/intents'),
  getMonetizationAngles: () => api.get('/intelligence/monetization-angles'),
  getMaturityPhases: () => api.get('/intelligence/maturity-phases'),
  getGeographicTags: () => api.get('/intelligence/geographic-tags'),
  getMetaSignals: () => api.get('/intelligence/meta-signals'),
  getClusters: () => api.get('/intelligence/clusters'),
  getHeatmap: () => api.get('/intelligence/heatmap'),

  // Admin triggers
  triggerClassify: () => api.post('/intelligence/classify'),
  triggerClusterDetection: () => api.post('/intelligence/clusters/detect'),
  triggerMetaSignalComputation: () => api.post('/intelligence/meta-signals/compute'),
};

export default intelligenceService;
