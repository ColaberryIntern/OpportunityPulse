import axios from 'axios';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/api/v1',
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

// Response interceptor: handle 429 retry, 403 upgrade, 401 globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Retry on 429 (Too Many Requests) with exponential backoff
    if (error.response?.status === 429 && config) {
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < MAX_RETRIES) {
        config._retryCount += 1;
        const retryAfter = error.response.headers['retry-after'];
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_DELAY_MS * Math.pow(2, config._retryCount - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

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
