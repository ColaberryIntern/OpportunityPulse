import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(
        err.response?.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          Opportunity Pulse
        </h1>
        <h2 className="text-lg text-center text-gray-600 dark:text-gray-400 mb-6">
          Forgot your password?
        </h2>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
              <p className="text-green-800 dark:text-green-300 text-sm">
                If an account exists with that email, a password reset link has been sent.
              </p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Check your email and follow the link to reset your password.
            </p>
            <Link
              to="/login"
              className="inline-block text-accent hover:underline text-sm"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border dark:bg-gray-800 dark:text-gray-100"
                required
                autoComplete="email"
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
              {loading ? 'Sending...' : 'Send Reset Link'}
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

export default ForgotPasswordPage;
