import React from 'react';
import LoginForm from '../components/auth/LoginForm';
import SEOHead from '../components/common/SEOHead';

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <SEOHead title="Sign In" description="Sign in to Opportunity Pulse to access AI-powered government contract and job insights." path="/login" />
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          Opportunity Pulse
        </h1>
        <h2 className="text-lg text-center text-gray-600 dark:text-gray-400 mb-6">Sign in to your account</h2>
        <LoginForm />
      </div>
    </div>
  );
}

export default LoginPage;
