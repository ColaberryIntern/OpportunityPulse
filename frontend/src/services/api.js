import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 403 upgrade + 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Detect premium upgrade requirement (403 with upgradeRequired)
    if (error.response?.status === 403 &&
        error.response?.data?.errors?.[0]?.upgradeRequired) {
      import('../store').then(({ store }) => {
        import('../store/slices/uiSlice').then(({ showUpgradePrompt }) => {
          store.dispatch(showUpgradePrompt(error.response.data.message));
        });
      });
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Only redirect if not already on auth pages
      if (!window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/register')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
