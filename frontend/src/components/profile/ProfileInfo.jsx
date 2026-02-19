import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateUserProfile, clearProfileStatus } from '../../store/slices/authSlice';

const SUGGESTED_INTERESTS = [
  'AI',
  'Cloud Computing',
  'Government Contracts',
  'Cybersecurity',
  'Data Analytics',
  'Machine Learning',
  'Healthcare',
  'Finance',
  'Defense',
  'Energy',
];

/**
 * Parse a comma-separated interests string into a trimmed array,
 * filtering out empty entries.
 */
function parseInterests(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function ProfileInfo() {
  const dispatch = useDispatch();
  const { user, loading, profileUpdateSuccess, profileError } = useSelector(
    (state) => state.auth
  );

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [interestsList, setInterestsList] = useState([]);
  const [interestInput, setInterestInput] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setCompany(user.company || '');
      setInterestsList(parseInterests(user.interests));
    }
  }, [user]);

  useEffect(() => {
    if (profileUpdateSuccess) {
      setEditing(false);
      const timer = setTimeout(() => dispatch(clearProfileStatus()), 3000);
      return () => clearTimeout(timer);
    }
  }, [profileUpdateSuccess, dispatch]);

  const handleCancel = () => {
    setEditing(false);
    setName(user?.name || '');
    setCompany(user?.company || '');
    setInterestsList(parseInterests(user?.interests));
    setInterestInput('');
    dispatch(clearProfileStatus());
  };

  const addInterest = (interest) => {
    const trimmed = interest.trim();
    if (!trimmed) return;
    // Prevent duplicates (case-insensitive)
    if (interestsList.some((i) => i.toLowerCase() === trimmed.toLowerCase())) return;
    setInterestsList((prev) => [...prev, trimmed]);
  };

  const removeInterest = (index) => {
    setInterestsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInterestKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addInterest(interestInput);
      setInterestInput('');
    }
  };

  const handleAddClick = () => {
    addInterest(interestInput);
    setInterestInput('');
  };

  const handleSave = (e) => {
    e.preventDefault();
    const interests = interestsList.join(',');
    dispatch(updateUserProfile({ name, company, interests }));
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Profile Information
        </h3>
        {!editing && (
          <button
            onClick={() => {
              dispatch(clearProfileStatus());
              setEditing(true);
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition"
          >
            Edit Profile
          </button>
        )}
      </div>

      {profileError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
          {profileError}
        </div>
      )}

      {profileUpdateSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm">
          Profile updated successfully.
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="profile-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Full Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Enter your full name"
              aria-required="true"
            />
          </div>

          <div>
            <label
              htmlFor="profile-email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Email cannot be changed.
            </p>
          </div>

          <div>
            <label
              htmlFor="profile-company"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Company
            </label>
            <input
              id="profile-company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="Enter your company name"
            />
          </div>

          {/* Interests Section */}
          <div>
            <label
              htmlFor="profile-interest-input"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Interests
            </label>

            {/* Current interests as removable chips */}
            {interestsList.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {interestsList.map((interest, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => removeInterest(idx)}
                      className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20 dark:hover:bg-blue-800/50 transition text-primary dark:text-blue-300"
                      aria-label={`Remove ${interest}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Input row: text field + Add button */}
            <div className="flex gap-2">
              <input
                id="profile-interest-input"
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={handleInterestKeyDown}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Type an interest and press Enter"
              />
              <button
                type="button"
                onClick={handleAddClick}
                disabled={!interestInput.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
              >
                Add
              </button>
            </div>

            {/* Suggested interests */}
            <div className="mt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggested interests:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_INTERESTS.filter(
                  (s) => !interestsList.some((i) => i.toLowerCase() === s.toLowerCase())
                ).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => addInterest(suggestion)}
                    className="px-3 py-1 rounded-full text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-primary dark:hover:border-blue-400 transition"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Full Name</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {user?.name || <span className="italic text-gray-400 dark:text-gray-500">Not set</span>}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{user?.email}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Company</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {user?.company || <span className="italic text-gray-400 dark:text-gray-500">Not set</span>}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Interests</dt>
            <dd className="mt-1">
              {user?.interests ? (
                <div className="flex flex-wrap gap-2">
                  {parseInterests(user.interests).map((interest, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary dark:bg-blue-900/30 dark:text-blue-300"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm italic text-gray-400 dark:text-gray-500">Not set</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Role</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 capitalize">
              {user?.role?.roleName || user?.role || 'consultant'}
            </dd>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileInfo;
