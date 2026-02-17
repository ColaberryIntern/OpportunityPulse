import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAlertPreferences, updateAlertPreferences } from '../../store/slices/alertPrefSlice';
import { clearUpdateSuccess } from '../../store/slices/alertPrefSlice';

function AlertPreferencesForm() {
  const dispatch = useDispatch();
  const { preferences, loading, error, updateSuccess } = useSelector(
    (state) => state.alertPreferences
  );

  const [govContracts, setGovContracts] = useState(true);
  const [aiJobs, setAiJobs] = useState(true);
  const [investments, setInvestments] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [emailNotify, setEmailNotify] = useState(false);
  const [inAppNotify, setInAppNotify] = useState(true);

  useEffect(() => {
    dispatch(fetchAlertPreferences());
  }, [dispatch]);

  useEffect(() => {
    if (preferences) {
      setGovContracts(preferences.govContracts ?? true);
      setAiJobs(preferences.aiJobs ?? true);
      setInvestments(preferences.investments ?? true);
      setMinScore(preferences.minScore ?? 0);
      setEmailNotify(preferences.emailNotify ?? false);
      setInAppNotify(preferences.inAppNotify ?? true);
    }
  }, [preferences]);

  useEffect(() => {
    if (updateSuccess) {
      const timer = setTimeout(() => dispatch(clearUpdateSuccess()), 3000);
      return () => clearTimeout(timer);
    }
  }, [updateSuccess, dispatch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(updateAlertPreferences({
      govContracts,
      aiJobs,
      investments,
      minScore: parseInt(minScore, 10) || 0,
      emailNotify,
      inAppNotify,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}
      {updateSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          Preferences saved successfully.
        </div>
      )}

      <h3 className="text-base font-semibold text-gray-900 mb-4">Notification Types</h3>
      <div className="space-y-3 mb-6">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={govContracts} onChange={(e) => setGovContracts(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-gray-700">Government Contracts</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={aiJobs} onChange={(e) => setAiJobs(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-gray-700">AI Jobs</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={investments} onChange={(e) => setInvestments(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-gray-700">Investments</span>
        </label>
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-4">Minimum AI Score</h3>
      <div className="mb-6">
        <input
          type="number"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          min="0"
          max="100"
          className="w-32 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-gray-400 mt-1">Only notify for opportunities scoring above this threshold (0-100)</p>
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-4">Delivery</h3>
      <div className="space-y-3 mb-6">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={inAppNotify} onChange={(e) => setInAppNotify(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-gray-700">In-app notifications</span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={emailNotify} onChange={(e) => setEmailNotify(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-gray-700">Email notifications</span>
        </label>
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
