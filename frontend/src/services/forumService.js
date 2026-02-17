import api from './api';

const forumService = {
  createPost: (data) => api.post('/forums', data),
  listPosts: ({ page = 1, limit = 20, category, status } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    return api.get(`/forums?${params.toString()}`);
  },
  getPost: (id) => api.get(`/forums/${id}`),
  updatePost: (id, data) => api.put(`/forums/${id}`, data),
  deletePost: (id) => api.delete(`/forums/${id}`),
  addComment: (postId, data) => api.post(`/forums/${postId}/comments`, data),
  updateComment: (postId, commentId, data) => api.put(`/forums/${postId}/comments/${commentId}`, data),
  deleteComment: (postId, commentId) => api.delete(`/forums/${postId}/comments/${commentId}`),
};

export default forumService;
