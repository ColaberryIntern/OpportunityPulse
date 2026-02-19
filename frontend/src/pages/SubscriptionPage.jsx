import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSubscription,
  upgradeSubscription,
  downgradeSubscription,
  fetchHistory,
  clearSubscriptionError,
  clearUpgradeSuccess,
} from '../store/slices/subscriptionSlice';

const FREE_FEATURES = [
  'Browse opportunities',
  'Basic search',
  'Community forums',
  'Up to 3 alerts',
];

const PREMIUM_FEATURES = [
  'Everything in Free, plus:',
  'AI-powered analysis',
  'Trend detection',
  'Advanced insights',
  'Unlimited alerts',
  'Natural language search',
  'Priority support',
  'API access',
];

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getSubscriptionStatus(subscription) {
  if (!subscription) return { label: 'No Plan', color: 'gray' };
  if (subscription.planType === 'free') return { label: 'Active', color: 'green' };
  if (subscription.endDate && new Date(subscription.endDate) < new Date()) {
    return { label: 'Expired', color: 'red' };
  }
  return { label: 'Active', color: 'green' };
}

function SubscriptionPage() {
  const dispatch = useDispatch();
  const { subscription, history, loading, error, upgradeSuccess } = useSelector(
    (state) => state.subscription
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);

  useEffect(() => {
    dispatch(fetchSubscription());
  }, [dispatch]);

  useEffect(() => {
    if (upgradeSuccess) {
      const timer = setTimeout(() => {
        dispatch(clearUpgradeSuccess());
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [upgradeSuccess, dispatch]);

  const handleUpgrade = useCallback(async () => {
    await dispatch(upgradeSubscription()).unwrap();
  }, [dispatch]);

  const handleDowngrade = useCallback(async () => {
    await dispatch(downgradeSubscription()).unwrap();
    setConfirmDowngrade(false);
  }, [dispatch]);

  const handleToggleHistory = useCallback(() => {
    if (!historyOpen) {
      dispatch(fetchHistory());
    }
    setHistoryOpen((prev) => !prev);
  }, [historyOpen, dispatch]);

  const handleDismissError = useCallback(() => {
    dispatch(clearSubscriptionError());
  }, [dispatch]);

  const currentPlan = subscription?.planType || 'free';
  const status = getSubscriptionStatus(subscription);
  const isPremium = currentPlan === 'premium' && status.label === 'Active';

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary dark:text-gray-100">
            Subscription
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your subscription plan and billing.
          </p>
        </div>

        {/* Success Banner */}
        {upgradeSuccess && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm flex items-center justify-between">
            <span>Successfully upgraded to Premium! Enjoy your new features.</span>
            <button
              onClick={() => dispatch(clearUpgradeSuccess())}
              className="text-green-500 hover:text-green-700 dark:hover:text-green-300"
              aria-label="Dismiss success message"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={handleDismissError}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
              aria-label="Dismiss error message"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !subscription && (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}

        {/* Current Plan Card */}
        {!loading || subscription ? (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Current Plan
                    </h2>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isPremium
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {currentPlan === 'premium' ? 'Premium' : 'Free'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>
                      Start date:{' '}
                      <span className="text-gray-700 dark:text-gray-300">
                        {subscription ? formatDate(subscription.startDate) : 'N/A'}
                      </span>
                    </span>
                    {currentPlan === 'premium' && (
                      <span>
                        Expires:{' '}
                        <span className="text-gray-700 dark:text-gray-300">
                          {subscription ? formatDate(subscription.endDate) : 'N/A'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                      status.color === 'green'
                        ? 'text-green-600 dark:text-green-400'
                        : status.color === 'red'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status.color === 'green'
                          ? 'bg-green-500'
                          : status.color === 'red'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                      }`}
                    />
                    {status.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Plan Comparison */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Choose Your Plan
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Free Plan Card */}
              <div
                className={`relative bg-white dark:bg-gray-900 rounded-lg border-2 p-6 ${
                  currentPlan === 'free' && status.label === 'Active'
                    ? 'border-accent'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {currentPlan === 'free' && status.label === 'Active' && (
                  <div className="absolute -top-3 left-4">
                    <span className="bg-accent text-white text-xs font-medium px-2.5 py-1 rounded-full">
                      Current Plan
                    </span>
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Free</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">$0</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">/month</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={currentPlan === 'free' && status.label === 'Active'}
                  className={`w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
                    currentPlan === 'free' && status.label === 'Active'
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {currentPlan === 'free' && status.label === 'Active'
                    ? 'Current Plan'
                    : 'Downgrade to Free'}
                </button>
              </div>

              {/* Premium Plan Card */}
              <div
                className={`relative bg-white dark:bg-gray-900 rounded-lg border-2 p-6 ${
                  isPremium
                    ? 'border-accent'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {isPremium && (
                  <div className="absolute -top-3 left-4">
                    <span className="bg-accent text-white text-xs font-medium px-2.5 py-1 rounded-full">
                      Current Plan
                    </span>
                  </div>
                )}
                {!isPremium && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-purple-600 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                      Recommended
                    </span>
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Premium</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">$29</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">/month</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  {PREMIUM_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <svg className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                {isPremium ? (
                  <>
                    {!confirmDowngrade ? (
                      <button
                        onClick={() => setConfirmDowngrade(true)}
                        className="w-full py-2.5 px-4 rounded-md text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                      >
                        Downgrade to Free
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-red-600 dark:text-red-400 text-center">
                          Are you sure? You will lose access to premium features immediately.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDowngrade}
                            disabled={loading}
                            className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {loading ? 'Processing...' : 'Confirm Downgrade'}
                          </button>
                          <button
                            onClick={() => setConfirmDowngrade(false)}
                            className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    onClick={handleUpgrade}
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : 'Upgrade to Premium'}
                  </button>
                )}
              </div>
            </div>

            {/* Subscription History */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={handleToggleHistory}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Subscription History
                </h2>
                <svg
                  className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                    historyOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {historyOpen && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {loading && history.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <svg className="animate-spin h-6 w-6 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No subscription history found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800">
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Plan
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Start Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              End Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {history.map((item) => {
                            const itemStatus = getSubscriptionStatus(item);
                            return (
                              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      item.planType === 'premium'
                                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                                    }`}
                                  >
                                    {item.planType === 'premium' ? 'Premium' : 'Free'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                  {formatDate(item.startDate)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                  {formatDate(item.endDate)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  <span
                                    className={`inline-flex items-center gap-1.5 ${
                                      itemStatus.color === 'green'
                                        ? 'text-green-600 dark:text-green-400'
                                        : itemStatus.color === 'red'
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full ${
                                        itemStatus.color === 'green'
                                          ? 'bg-green-500'
                                          : itemStatus.color === 'red'
                                          ? 'bg-red-500'
                                          : 'bg-gray-400'
                                      }`}
                                    />
                                    {itemStatus.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default SubscriptionPage;
