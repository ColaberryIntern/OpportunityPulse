import React from 'react';
import RegisterForm from '../components/auth/RegisterForm';
import SEOHead from '../components/common/SEOHead';

function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <SEOHead title="Create Account" description="Join Opportunity Pulse for AI-powered government contract, job, and investment opportunity insights." path="/register" />
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          Opportunity Pulse
        </h1>
        <h2 className="text-lg text-center text-gray-600 dark:text-gray-400 mb-6">Create your account</h2>
        <RegisterForm />
      </div>
    </div>
  );
}

export default RegisterPage;
