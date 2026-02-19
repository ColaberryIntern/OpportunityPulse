import React, { useState, useEffect } from 'react';

const STEPS = [
  {
    title: 'Welcome to Opportunity Pulse!',
    description: 'Your AI-powered platform for tracking government contracts, AI jobs, and investment opportunities. Let us show you around.',
    icon: (
      <svg className="w-10 h-10 text-highlight" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: 'Dashboard & Metrics',
    description: 'Your dashboard shows key metrics, opportunity trends, AI scores, and market insights. Check it daily for the latest updates.',
    icon: (
      <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: 'Search & Opportunities',
    description: 'Browse 400+ real opportunities from SAM.gov, USASpending, and top job boards. Use filters or AI-powered natural language search to find exactly what you need.',
    icon: (
      <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    title: 'Forums & Community',
    description: 'Share insights, discuss trends, and collaborate with other consultants in the discussion forums. Knowledge grows when shared.',
    icon: (
      <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
  },
  {
    title: 'You\'re All Set!',
    description: 'Data refreshes daily at 6 AM UTC with fresh opportunities from all sources. Set up your profile interests for personalized AI recommendations.',
    icon: (
      <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const STORAGE_KEY = 'op_onboarding_complete';

function OnboardingFlow() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setVisible(true);
    }
  }, []);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">{currentStep.icon}</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{currentStep.title}</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{currentStep.description}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mt-6 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-highlight' : i < step ? 'bg-accent' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleDismiss}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary transition"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlow;
