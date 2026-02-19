import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import ProfileInfo from './ProfileInfo';
import ChangePassword from './ChangePassword';
import AlertPreferencesForm from '../alerts/AlertPreferencesForm';
import ProfileWizard from './ProfileWizard';
import { logout } from '../../store/slices/authSlice';
import api from '../../services/api';

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'ai-profile', label: 'AI Profile' },
  { key: 'security', label: 'Security' },
  { key: 'alerts', label: 'Alert Preferences' },
  { key: 'privacy', label: 'Privacy & Data' },
];

function PrivacyDataTab() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleExportData = async () => {
    setExportLoading(true);
    setExportError('');
    setExportSuccess('');

    try {
      const response = await api.get('/auth/my-data');
      const data = response.data.data;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `opportunity-pulse-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess('Your data has been exported and downloaded successfully.');
    } catch (error) {
      setExportError(
        error.response?.data?.message || 'Failed to export data. Please try again.'
      );
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Please enter your password to confirm account deletion.');
      return;
    }

    setDeleteLoading(true);
    setDeleteError('');

    try {
      await api.delete('/auth/account', { data: { password: deletePassword } });

      // Log out and redirect to login
      dispatch(logout());
      navigate('/login');
    } catch (error) {
      setDeleteError(
        error.response?.data?.message || 'Failed to delete account. Please try again.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Data Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Export My Data
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Download a complete copy of all your personal data in JSON format. This includes your
          profile information, activity history, preferences, content, and all other data we store
          about you (GDPR Article 20 — Right to Data Portability).
        </p>

        {exportError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
            {exportError}
          </div>
        )}

        {exportSuccess && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm">
            {exportSuccess}
          </div>
        )}

        <button
          onClick={handleExportData}
          disabled={exportLoading}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {exportLoading ? 'Exporting...' : 'Export My Data'}
        </button>
      </div>

      {/* Delete Account Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Delete My Account
        </h3>

        {/* Warning box */}
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">
                This action is permanent and cannot be undone
              </h4>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                Deleting your account will permanently remove all of your data, including:
              </p>
              <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-400 mt-2 space-y-1">
                <li>Your profile and account information</li>
                <li>All saved opportunities and alerts</li>
                <li>Forum posts and comments</li>
                <li>Activity history and preferences</li>
                <li>API keys, webhooks, and integrations</li>
                <li>Subscriptions and billing data</li>
              </ul>
            </div>
          </div>
        </div>

        {deleteError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
            {deleteError}
          </div>
        )}

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition"
          >
            Delete My Account
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="delete-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Confirm your password to proceed
              </label>
              <input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full max-w-md border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Enter your current password"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePassword}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleteLoading ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileSettings() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div>
      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-0 -mb-px" aria-label="Profile settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-primary text-primary dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              aria-selected={activeTab === tab.key}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'profile' && <ProfileInfo />}
        {activeTab === 'ai-profile' && <ProfileWizard />}
        {activeTab === 'security' && <ChangePassword />}
        {activeTab === 'alerts' && <AlertPreferencesForm />}
        {activeTab === 'privacy' && <PrivacyDataTab />}
      </div>
    </div>
  );
}

export default ProfileSettings;
