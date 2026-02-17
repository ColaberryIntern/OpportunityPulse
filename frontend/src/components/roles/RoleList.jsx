import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateRole } from '../../store/slices/roleSlice';

function RoleList({ roles, loading }) {
  const dispatch = useDispatch();
  const [editingId, setEditingId] = useState(null);
  const [editDescription, setEditDescription] = useState('');

  const handleEdit = (role) => {
    setEditingId(role.id);
    setEditDescription(role.description || '');
  };

  const handleSave = (id) => {
    dispatch(updateRole({ id, description: editDescription }));
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditDescription('');
  };

  if (loading) {
    return <p className="text-gray-500">Loading roles...</p>;
  }

  if (!roles.length) {
    return <p className="text-gray-500">No roles found.</p>;
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {roles.map((role) => (
            <tr key={role.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{role.id}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                  {role.roleName}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {editingId === role.id ? (
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                ) : (
                  role.description || '—'
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {editingId === role.id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(role.id)}
                      className="text-green-600 hover:text-green-800 font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancel}
                      className="text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEdit(role)}
                    className="text-primary hover:text-primary/80 font-medium"
                  >
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default RoleList;
