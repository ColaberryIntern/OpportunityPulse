import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser, clearError } from '../../store/slices/authSlice';

function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);

  const validateForm = () => {
    if (!email || !password || !confirmPassword) {
      setValidationError('All fields are required.');
      return false;
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return false;
    }
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearError());
    if (!validateForm()) return;

    const result = await dispatch(registerUser({ email, password }));
    if (!result.error) {
      navigate('/login', { state: { message: 'Registration successful! Please check your email.' } });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border"
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent px-3 py-2 border"
          required
          autoComplete="new-password"
        />
      </div>

      {(validationError || error) && (
        <div className="text-red-600 text-sm" role="alert">
          {validationError || error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent text-white py-2 px-4 rounded-md hover:bg-primary transition disabled:opacity-50"
      >
        {loading ? 'Creating Account...' : 'Register'}
      </button>

      <p className="text-sm text-center text-gray-600">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

export default RegisterForm;
