import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRoles } from '../store/slices/roleSlice';
import RoleList from '../components/roles/RoleList';
import RoleAssigner from '../components/roles/RoleAssigner';

function RoleManagementPage() {
  const dispatch = useDispatch();
  const { roles, loading, error } = useSelector((state) => state.roles);

  useEffect(() => {
    dispatch(fetchRoles());
  }, [dispatch]);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Role Management</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Available Roles</h2>
            <RoleList roles={roles} loading={loading} />
          </section>

          <section>
            <RoleAssigner roles={roles} />
          </section>
        </div>
      </div>
    </div>
  );
}

export default RoleManagementPage;
