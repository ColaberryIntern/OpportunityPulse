import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { assignRole, clearAssignSuccess, clearRoleError } from '../../store/slices/roleSlice';

function RoleAssigner({ roles }) {
  const dispatch = useDispatch();
  const { loading, error, assignSuccess } = useSelector((state) => state.roles);
  const [userId, setUserId] = useState('');
  const [roleId, setRoleId] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userId || !roleId) return;
    dispatch(clearRoleError());
    dispatch(clearAssignSuccess());
    dispatch(assignRole({ userId: parseInt(userId, 10), roleId: parseInt(roleId, 10) }));
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Assign Role to User</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {assignSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          Role assigned successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
            User ID
          </label>
          <input
            type="number"
            id="userId"
            min="1"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter user ID"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div className="flex-1">
          <label htmlFor="roleId" className="block text-sm font-medium text-gray-700 mb-1">
            Role
          </label>
          <select
            id="roleId"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select a role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.roleName} — {role.description}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !userId || !roleId}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Assigning...' : 'Assign Role'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RoleAssigner;
