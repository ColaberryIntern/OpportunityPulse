import React, { useState, useEffect } from 'react';
import personalMatchService from '../../services/personalMatchService';
import api from '../../services/api';
import TagInput from '../common/TagInput';
import ResumeUploadModal from './ResumeUploadModal';

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Government', 'Defense',
  'Education', 'Energy', 'Manufacturing', 'Consulting', 'Cybersecurity',
  'AI / Machine Learning', 'Data Analytics', 'Other',
];

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry Level (0-2 years)' },
  { value: 'mid', label: 'Mid Level (3-7 years)' },
  { value: 'senior', label: 'Senior (8-15 years)' },
  { value: 'executive', label: 'Executive (15+ years)' },
];

const COMPANY_SIZES = [
  { value: 'startup', label: 'Startup (1-50)' },
  { value: 'small', label: 'Small (51-200)' },
  { value: 'mid-market', label: 'Mid-Market (201-1000)' },
  { value: 'enterprise', label: 'Enterprise (1000+)' },
];

const SUGGESTED_SKILLS = [
  'Python', 'JavaScript', 'Machine Learning', 'Cloud Architecture', 'NLP',
  'Data Engineering', 'Cybersecurity', 'Project Management', 'DevOps',
  'AI Strategy', 'Deep Learning', 'Data Analytics', 'Agile', 'SQL',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'React',
];

function ProfileWizard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const [profileData, setProfileData] = useState({
    professionalTitle: '',
    industry: '',
    skills: [],
    experienceLevel: '',
    companySize: '',
    goals: [''],
    preferredLocations: [],
    certifications: [],
    budgetRange: { min: '', max: '' },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/me');
        const existing = res.data.data.user.profileData || {};
        setProfileData((prev) => ({
          ...prev,
          ...existing,
          goals: existing.goals?.length ? existing.goals : [''],
          budgetRange: existing.budgetRange || { min: '', max: '' },
          skills: existing.skills || [],
          preferredLocations: existing.preferredLocations || [],
          certifications: existing.certifications || [],
        }));
      } catch (err) {
        // Ignore — will use defaults
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const updateField = (field, value) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  };

  const addGoal = () => {
    if (profileData.goals.length < 10) {
      setProfileData((prev) => ({ ...prev, goals: [...prev.goals, ''] }));
    }
  };

  const updateGoal = (index, value) => {
    const goals = [...profileData.goals];
    goals[index] = value;
    setProfileData((prev) => ({ ...prev, goals }));
    setSuccess('');
  };

  const removeGoal = (index) => {
    if (profileData.goals.length > 1) {
      setProfileData((prev) => ({ ...prev, goals: prev.goals.filter((_, i) => i !== index) }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Clean data before sending
      const cleaned = {
        ...profileData,
        goals: profileData.goals.filter((g) => g.trim()),
        budgetRange: profileData.budgetRange.min || profileData.budgetRange.max
          ? {
              min: profileData.budgetRange.min ? parseInt(profileData.budgetRange.min, 10) : 0,
              max: profileData.budgetRange.max ? parseInt(profileData.budgetRange.max, 10) : 0,
            }
          : undefined,
      };
      await personalMatchService.updateProfileData(cleaned);
      setSuccess('AI profile saved! Your matches will be refreshed.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-accent/5 dark:bg-accent/10 border border-accent/20 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-semibold text-accent mb-1">AI-Powered Matching</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Complete your profile below so our AI can match you with the most relevant opportunities.
          The more detail you provide, the better your matches will be.
        </p>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="text-xs font-medium text-accent hover:underline"
        >
          Or upload your resume to auto-fill &rarr;
        </button>
      </div>
      {showUpload && <ResumeUploadModal onClose={() => setShowUpload(false)} />}

      {/* Professional Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Professional Title
        </label>
        <input
          type="text"
          value={profileData.professionalTitle}
          onChange={(e) => updateField('professionalTitle', e.target.value)}
          placeholder="e.g., AI Solutions Architect"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Industry */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Industry
        </label>
        <select
          value={profileData.industry}
          onChange={(e) => updateField('industry', e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Select your industry</option>
          {INDUSTRIES.map((ind) => (
            <option key={ind} value={ind}>{ind}</option>
          ))}
        </select>
      </div>

      {/* Skills */}
      <TagInput
        value={profileData.skills}
        onChange={(skills) => updateField('skills', skills)}
        suggestions={SUGGESTED_SKILLS}
        placeholder="Type a skill and press Enter"
        label="Skills"
      />

      {/* Experience Level */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Experience Level
        </label>
        <div className="grid grid-cols-2 gap-2">
          {EXPERIENCE_LEVELS.map((level) => (
            <label
              key={level.value}
              className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition ${
                profileData.experienceLevel === level.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-accent/50'
              }`}
            >
              <input
                type="radio"
                name="experienceLevel"
                value={level.value}
                checked={profileData.experienceLevel === level.value}
                onChange={(e) => updateField('experienceLevel', e.target.value)}
                className="sr-only"
              />
              {level.label}
            </label>
          ))}
        </div>
      </div>

      {/* Company Size */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Company Size
        </label>
        <div className="grid grid-cols-2 gap-2">
          {COMPANY_SIZES.map((size) => (
            <label
              key={size.value}
              className={`flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer text-sm transition ${
                profileData.companySize === size.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-accent/50'
              }`}
            >
              <input
                type="radio"
                name="companySize"
                value={size.value}
                checked={profileData.companySize === size.value}
                onChange={(e) => updateField('companySize', e.target.value)}
                className="sr-only"
              />
              {size.label}
            </label>
          ))}
        </div>
      </div>

      {/* Goals */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Goals (what are you looking for?)
        </label>
        <div className="space-y-2">
          {profileData.goals.map((goal, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={goal}
                onChange={(e) => updateGoal(i, e.target.value)}
                placeholder={`e.g., Find opportunities matching my skills`}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {profileData.goals.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeGoal(i)}
                  className="text-gray-400 hover:text-red-500 text-sm px-2"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {profileData.goals.length < 10 && (
            <button
              type="button"
              onClick={addGoal}
              className="text-xs text-accent hover:text-accent/80"
            >
              + Add another goal
            </button>
          )}
        </div>
      </div>

      {/* Preferred Locations */}
      <TagInput
        value={profileData.preferredLocations}
        onChange={(locs) => updateField('preferredLocations', locs)}
        suggestions={['Remote', 'Washington DC', 'New York', 'San Francisco', 'Austin', 'Texas', 'Virginia', 'California']}
        placeholder="Type a location and press Enter"
        label="Preferred Locations"
      />

      {/* Certifications */}
      <TagInput
        value={profileData.certifications}
        onChange={(certs) => updateField('certifications', certs)}
        suggestions={['AWS Solutions Architect', 'PMP', 'CISSP', 'Google Cloud Professional', 'Azure Certified', 'Scrum Master', 'CPA', 'Six Sigma']}
        placeholder="Type a certification and press Enter"
        label="Certifications"
      />

      {/* Budget Range */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Budget / Value Range (optional)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
          <input
            type="number"
            value={profileData.budgetRange.min}
            onChange={(e) => updateField('budgetRange', { ...profileData.budgetRange, min: e.target.value })}
            placeholder="Min"
            className="w-36 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">to $</span>
          <input
            type="number"
            value={profileData.budgetRange.max}
            onChange={(e) => updateField('budgetRange', { ...profileData.budgetRange, max: e.target.value })}
            placeholder="Max"
            className="w-36 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50 transition"
      >
        {saving ? 'Saving...' : 'Save AI Profile'}
      </button>
    </div>
  );
}

export default ProfileWizard;
