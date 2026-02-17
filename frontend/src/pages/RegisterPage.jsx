import React from 'react';
import RegisterForm from '../components/auth/RegisterForm';

function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          Opportunity Pulse
        </h1>
        <h2 className="text-lg text-center text-gray-600 mb-6">Create your account</h2>
        <RegisterForm />
      </div>
    </div>
  );
}

export default RegisterPage;
