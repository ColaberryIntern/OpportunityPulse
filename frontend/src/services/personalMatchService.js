import api from './api';

const personalMatchService = {
  getMatches: () => api.get('/personal-matches'),
  refreshMatches: () => api.post('/personal-matches/refresh'),
  submitFeedback: (matchId, feedback) =>
    api.post(`/personal-matches/${matchId}/feedback`, { feedback }),
  updateProfileData: (profileData) =>
    api.put('/personal-matches/profile', { profileData }),
};

export default personalMatchService;
