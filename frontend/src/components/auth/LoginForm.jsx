import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { loginUser, clearError } from '../../store/slices/authSlice';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearError());

    const result = await dispatch(loginUser({ email, password }));
    if (!result.error) {
      navigate('/dashboard');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border dark:bg-gray-800 dark:text-gray-100"
          required
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? 'login-error' : undefined}
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border dark:bg-gray-800 dark:text-gray-100"
          required
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? 'login-error' : undefined}
          autoComplete="current-password"
        />
      </div>

      {error && (
        <span id="login-error" className="text-red-600 text-sm" role="alert">
          {error}
        </span>
      )}

      <div className="text-right">
        <Link to="/forgot-password" className="text-sm text-accent hover:underline">
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent text-white py-2 px-4 rounded-md hover:bg-primary transition disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <p className="text-sm text-center text-gray-600 dark:text-gray-400">
        Don't have an account?{' '}
        <Link to="/register" className="text-accent hover:underline">
          Register
        </Link>
      </p>
    </form>
  );
}

export default LoginForm;
