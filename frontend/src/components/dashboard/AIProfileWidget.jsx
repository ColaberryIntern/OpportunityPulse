import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import ResumeUploadModal from '../profile/ResumeUploadModal';

const PROFILE_FIELDS = [
  'professionalTitle',
  'industry',
  'skills',
  'experienceLevel',
  'companySize',
  'goals',
  'preferredLocations',
  'certifications',
  'budgetRange',
];

function computeCompletion(profileData) {
  if (!profileData) return 0;
  let filled = 0;
  for (const field of PROFILE_FIELDS) {
    const val = profileData[field];
    if (Array.isArray(val) ? val.length > 0 : val) filled++;
  }
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}

function AIProfileWidget() {
  const user = useSelector((state) => state.auth.user);
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);

  const profileData = user?.profileData || {};
  const hasProfile = profileData.skills?.length > 0 || profileData.professionalTitle || profileData.industry;
  const completion = computeCompletion(profileData);

  if (!hasProfile) {
    return (
      <>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 border border-blue-100 dark:border-gray-700 rounded-lg p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Complete Your AI Profile
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Upload your resume or set up your profile to get personalized opportunity matches, insights, and recommendations tailored to your skills.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition"
                >
                  Upload Resume
                </button>
                <button
                  onClick={() => navigate('/profile')}
                  className="px-3 py-1.5 text-xs font-medium text-accent bg-accent/10 rounded-md hover:bg-accent/20 transition"
                >
                  Set Up Manually
                </button>
              </div>
            </div>
          </div>
        </div>
        {showUpload && <ResumeUploadModal onClose={() => setShowUpload(false)} />}
      </>
    );
  }

  const skills = profileData.skills || [];
  const displaySkills = skills.slice(0, 8);
  const moreCount = skills.length - displaySkills.length;

  return (
    <>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0 text-accent font-bold text-sm">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {user?.name || user?.email}
                </span>
                <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">AI Profile</span>
              </div>
              {(profileData.professionalTitle || profileData.industry) && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[profileData.professionalTitle, profileData.industry].filter(Boolean).join(' · ')}
                  {profileData.experienceLevel && ` · ${profileData.experienceLevel.charAt(0).toUpperCase() + profileData.experienceLevel.slice(1)}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setShowUpload(true)}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition"
              title="Upload Resume PDF"
            >
              Upload PDF
            </button>
            <button
              onClick={() => navigate('/profile')}
              className="px-2 py-1 text-[10px] font-medium text-accent bg-accent/10 rounded hover:bg-accent/20 transition"
            >
              Edit
            </button>
          </div>
        </div>

        {displaySkills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {displaySkills.map((skill) => (
              <span
                key={skill}
                className="px-1.5 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded"
              >
                {skill}
              </span>
            ))}
            {moreCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                +{moreCount} more
              </span>
            )}
          </div>
        )}

        {/* Profile completion bar */}
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-accent/70 transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {completion}% complete
          </span>
        </div>
      </div>
      {showUpload && <ResumeUploadModal onClose={() => setShowUpload(false)} />}
    </>
  );
}

export default AIProfileWidget;
