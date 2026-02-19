import api from './api';

const authService = {
  register(credentials) {
    return api.post('/auth/register', credentials);
  },

  login(credentials) {
    return api.post('/auth/login', credentials);
  },

  verifyEmail(token) {
    return api.get(`/auth/verify/${token}`);
  },

  getProfile() {
    return api.get('/auth/me');
  },

  updateProfile(data) {
    return api.put('/auth/profile', data);
  },

  changePassword(currentPassword, newPassword) {
    return api.put('/auth/change-password', { currentPassword, newPassword });
  },
};

export default authService;
