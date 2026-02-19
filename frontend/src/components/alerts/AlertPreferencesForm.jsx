import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAlertPreferences, updateAlertPreferences } from '../../store/slices/alertPrefSlice';
import { clearUpdateSuccess } from '../../store/slices/alertPrefSlice';

const ALL_ACTION_TYPES = ['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH'];
const ACTION_TYPE_LABELS = {
  BUILD: 'Build', BID: 'Bid', APPLY: 'Apply',
  PARTNER: 'Partner', INVEST: 'Invest', TEACH: 'Teach',
};

function AlertPreferencesForm() {
  const dispatch = useDispatch();
  const { preferences, loading, error, updateSuccess } = useSelector(
    (state) => state.alertPreferences
  );

  const [govContracts, setGovContracts] = useState(true);
  const [aiJobs, setAiJobs] = useState(true);
  const [investments, setInvestments] = useState(true);
  const [grants, setGrants] = useState(true);
  const [aiNews, setAiNews] = useState(true);
  const [preferredActionTypes, setPreferredActionTypes] = useState([...ALL_ACTION_TYPES]);
  const [minScore, setMinScore] = useState(0);
  const [emailNotify, setEmailNotify] = useState(false);
  const [inAppNotify, setInAppNotify] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState('weekly');

  useEffect(() => {
    dispatch(fetchAlertPreferences());
  }, [dispatch]);

  useEffect(() => {
    if (preferences) {
      setGovContracts(preferences.govContracts ?? true);
      setAiJobs(preferences.aiJobs ?? true);
      setInvestments(preferences.investments ?? true);
      setGrants(preferences.grants ?? true);
      setAiNews(preferences.aiNews ?? true);
      setPreferredActionTypes(preferences.preferredActionTypes ?? [...ALL_ACTION_TYPES]);
      setMinScore(preferences.minScore ?? 0);
      setEmailNotify(preferences.emailNotify ?? false);
      setInAppNotify(preferences.inAppNotify ?? true);
      setDigestFrequency(preferences.digestFrequency ?? 'weekly');
    }
  }, [preferences]);

  useEffect(() => {
    if (updateSuccess) {
      const timer = setTimeout(() => dispatch(clearUpdateSuccess()), 3000);
      return () => clearTimeout(timer);
    }
  }, [updateSuccess, dispatch]);

  const toggleActionType = (type) => {
    setPreferredActionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(updateAlertPreferences({
      govContracts,
      aiJobs,
      investments,
      grants,
      aiNews,
      preferredActionTypes,
      minScore: parseInt(minScore, 10) || 0,
      emailNotify,
      inAppNotify,
      digestFrequency,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}
      {updateSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded text-green-700 text-sm">
          Preferences saved successfully.
        </div>
      )}

      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Notification Types</h3>
      <div className="space-y-3 mb-6">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={govContracts} onChange={(e) => setGovContracts(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
          <span className="text-gray-700 dark:text-gray-300">Government Contracts</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={aiJobs} onChange={(e) => setAiJobs(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
          <span className="text-gray-700 dark:text-gray-300">AI Jobs</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={investments} onChange={(e) => setInvestments(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
          <span className="text-gray-700 dark:text-gray-300">Investments</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={grants} onChange={(e) => setGrants(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
          <span className="text-gray-700 dark:text-gray-300">Grants</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={aiNews} onChange={(e) => setAiNews(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
          <span className="text-gray-700 dark:text-gray-300">AI News</span>
        </label>
      </div>

      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Action Types</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Select which action types you want to receive alerts for</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {ALL_ACTION_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={preferredActionTypes.includes(type)}
              onChange={() => toggleActionType(type)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-gray-700 dark:text-gray-300">{ACTION_TYPE_LABELS[type]}</span>
          </label>
        ))}
      </div>

      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Minimum AI Score</h3>
      <div className="mb-6">
        <input
          type="number"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          min="0"
          max="100"
          className="w-32 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Only notify for opportunities scoring above this threshold (0-100)</p>
      </div>

      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Delivery</h3>
      <div className="space-y-3 mb-6">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={inAppNotify} onChange={(e) => setInAppNotify(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
          <span className="text-gray-700 dark:text-gray-300">In-app notifications</span>
        </label>
        <div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={emailNotify} onChange={(e) => setEmailNotify(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
            <span className="text-gray-700 dark:text-gray-300">Email digest notifications</span>
          </label>
          {emailNotify && (
            <div className="ml-7 mt-2">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Digest Frequency
              </label>
              <select
                value={digestFrequency}
                onChange={(e) => setDigestFrequency(e.target.value)}
                className="w-48 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Personalized AI-summarized opportunity digests sent to your email
              </p>
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save Preferences'}
      </button>
    </form>
  );
}

export default AlertPreferencesForm;
