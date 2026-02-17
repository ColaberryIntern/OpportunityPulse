import React from 'react';
import LoginForm from '../components/auth/LoginForm';

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          Opportunity Pulse
        </h1>
        <h2 className="text-lg text-center text-gray-600 mb-6">Sign in to your account</h2>
        <LoginForm />
      </div>
    </div>
  );
}

export default LoginPage;
