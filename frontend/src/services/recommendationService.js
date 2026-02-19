import api from './api';

export async function fetchRecommendations(limit = 10) {
  const response = await api.get('/recommendations', { params: { limit } });
  return response.data;
}
