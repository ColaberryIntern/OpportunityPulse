import api from './api';

const roleService = {
  getRoles: () => api.get('/roles'),
  assignRole: ({ userId, roleId }) => api.post('/roles/assign', { userId, roleId }),
  updateRole: (id, data) => api.put(`/roles/${id}`, data),
};

export default roleService;
