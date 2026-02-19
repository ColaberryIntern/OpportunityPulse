import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!token) {
      setError('Reset token is missing. Please use the link from your email.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setSuccess(true);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <h1 className="text-2xl font-bold text-center text-primary mb-6">
            Opportunity Pulse
          </h1>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 mb-4">
            <p className="text-red-800 dark:text-red-300 text-sm">
              Invalid reset link. Please request a new password reset.
            </p>
          </div>
          <Link to="/forgot-password" className="text-accent hover:underline text-sm">
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          Opportunity Pulse
        </h1>
        <h2 className="text-lg text-center text-gray-600 dark:text-gray-400 mb-6">
          Reset your password
        </h2>

        {success ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
              <p className="text-green-800 dark:text-green-300 text-sm">
                Your password has been reset successfully.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-block bg-accent text-white py-2 px-4 rounded-md hover:bg-primary transition text-sm"
            >
              Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border dark:bg-gray-800 dark:text-gray-100"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border dark:bg-gray-800 dark:text-gray-100"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <span className="text-red-600 text-sm" role="alert">
                {error}
              </span>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white py-2 px-4 rounded-md hover:bg-primary transition disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>

            <p className="text-sm text-center text-gray-600 dark:text-gray-400">
              <Link to="/login" className="text-accent hover:underline">
                Back to Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
