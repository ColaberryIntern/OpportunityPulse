import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { changeUserPassword, clearProfileStatus } from '../../store/slices/authSlice';

function ChangePassword() {
  const dispatch = useDispatch();
  const { loading, passwordChangeSuccess, profileError } = useSelector(
    (state) => state.auth
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (passwordChangeSuccess) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setValidationError('');
      const timer = setTimeout(() => dispatch(clearProfileStatus()), 3000);
      return () => clearTimeout(timer);
    }
  }, [passwordChangeSuccess, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(clearProfileStatus());
    };
  }, [dispatch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');
    dispatch(clearProfileStatus());

    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('New passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setValidationError('New password must be different from current password.');
      return;
    }

    dispatch(changeUserPassword({ currentPassword, newPassword }));
  };

  const displayError = validationError || profileError;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Change Password
      </h3>

      {displayError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
          {displayError}
        </div>
      )}

      {passwordChangeSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm">
          Password changed successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Current Password
          </label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Enter your current password"
            required
            aria-required="true"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Enter your new password"
            minLength={8}
            required
            aria-required="true"
            autoComplete="new-password"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Must be at least 8 characters with uppercase, number, and special character.
          </p>
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Confirm your new password"
            minLength={8}
            required
            aria-required="true"
            autoComplete="new-password"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ChangePassword;
