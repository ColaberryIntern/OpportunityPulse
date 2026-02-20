import React, { useState, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { fetchCurrentUser } from '../../store/slices/authSlice';
import resumeUploadService from '../../services/resumeUploadService';
import TagInput from '../common/TagInput';

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Government', 'Defense',
  'Education', 'Energy', 'Manufacturing', 'Consulting', 'Cybersecurity',
  'AI / Machine Learning', 'Data Analytics', 'Other',
];

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry (0-2 yrs)' },
  { value: 'mid', label: 'Mid (3-7 yrs)' },
  { value: 'senior', label: 'Senior (8-15 yrs)' },
  { value: 'executive', label: 'Executive (15+ yrs)' },
];

function ResumeUploadModal({ onClose }) {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  const [stage, setStage] = useState('select'); // select | extracting | review | saving
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Extracted data state
  const [extractedData, setExtractedData] = useState(null);
  const [mergedData, setMergedData] = useState(null);
  const [changes, setChanges] = useState([]);

  // Editable review fields
  const [reviewData, setReviewData] = useState({});

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File must be less than 10MB.');
      return;
    }

    setFile(selectedFile);
    setError('');
    setStage('extracting');

    try {
      const response = await resumeUploadService.uploadResume(selectedFile);
      const data = response.data.data;

      setExtractedData(data.extractedData);
      setMergedData(data.mergedProfileData);
      setChanges(data.changes || []);

      // Set review data from merged profile
      setReviewData({
        professionalTitle: data.mergedProfileData.professionalTitle || '',
        industry: data.mergedProfileData.industry || '',
        skills: data.mergedProfileData.skills || [],
        experienceLevel: data.mergedProfileData.experienceLevel || '',
        certifications: data.mergedProfileData.certifications || [],
      });

      setStage('review');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to extract data from resume. Please try again.');
      setStage('select');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  }, [handleFile]);

  const handleConfirm = async () => {
    setStage('saving');
    setError('');

    try {
      // Merge review edits back into the full merged profile
      const finalProfile = {
        ...mergedData,
        professionalTitle: reviewData.professionalTitle,
        industry: reviewData.industry,
        skills: reviewData.skills,
        experienceLevel: reviewData.experienceLevel,
        certifications: reviewData.certifications,
      };

      await resumeUploadService.confirmExtraction(finalProfile);
      await dispatch(fetchCurrentUser()).unwrap();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile. Please try again.');
      setStage('review');
    }
  };

  // Compute which skills are newly extracted
  const newSkills = extractedData?.skills?.filter(
    (s) => !mergedData?.skills?.includes(s) || changes.some((c) => c.field === 'skills' && c.newItems?.includes(s))
  ) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {stage === 'select' && 'Upload Resume'}
            {stage === 'extracting' && 'Extracting Skills...'}
            {(stage === 'review' || stage === 'saving') && 'Review Extracted Profile'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Stage 1: File Selection */}
          {stage === 'select' && (
            <div>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${
                  dragActive
                    ? 'border-accent bg-accent/5'
                    : 'border-gray-300 dark:border-gray-600 hover:border-accent/50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Drag and drop your resume PDF here, or click to browse
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  PDF only, max 10MB. Works with resumes and LinkedIn PDF exports.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => handleFile(e.target.files[0])}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Stage 2: Extracting */}
          {stage === 'extracting' && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-4 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Extracting skills with AI...
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Analyzing {file?.name} — this may take a few seconds
              </p>
            </div>
          )}

          {/* Stage 3: Review & Confirm */}
          {(stage === 'review' || stage === 'saving') && (
            <div className="space-y-4">
              {changes.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                    Extracted from your resume:
                  </p>
                  <ul className="text-xs text-green-600 dark:text-green-400 space-y-0.5">
                    {changes.map((c, i) => (
                      <li key={i}>
                        {c.field === 'skills' && `${c.newCount} new skills added`}
                        {c.field === 'certifications' && `${c.newCount} certifications added`}
                        {c.field === 'professionalTitle' && `Title: ${c.value}`}
                        {c.field === 'industry' && `Industry: ${c.value}`}
                        {c.field === 'experienceLevel' && `Experience: ${c.value}`}
                        {c.field === 'summary' && 'Professional summary added'}
                        {c.field === 'yearsOfExperience' && `${c.value} years of experience`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Professional Title */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Professional Title
                </label>
                <input
                  type="text"
                  value={reviewData.professionalTitle}
                  onChange={(e) => setReviewData((prev) => ({ ...prev, professionalTitle: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {/* Industry */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Industry
                </label>
                <select
                  value={reviewData.industry}
                  onChange={(e) => setReviewData((prev) => ({ ...prev, industry: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              {/* Skills */}
              <TagInput
                value={reviewData.skills}
                onChange={(skills) => setReviewData((prev) => ({ ...prev, skills }))}
                placeholder="Add more skills"
                label="Skills"
                highlightNew={newSkills}
              />

              {/* Experience Level */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Experience Level
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {EXPERIENCE_LEVELS.map((level) => (
                    <label
                      key={level.value}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded cursor-pointer text-xs transition ${
                        reviewData.experienceLevel === level.value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-accent/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="experienceLevel"
                        value={level.value}
                        checked={reviewData.experienceLevel === level.value}
                        onChange={(e) => setReviewData((prev) => ({ ...prev, experienceLevel: e.target.value }))}
                        className="sr-only"
                      />
                      {level.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Certifications */}
              <TagInput
                value={reviewData.certifications}
                onChange={(certs) => setReviewData((prev) => ({ ...prev, certifications: certs }))}
                placeholder="Add certifications"
                label="Certifications"
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {(stage === 'review' || stage === 'saving') && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={stage === 'saving'}
              className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50 transition"
            >
              {stage === 'saving' ? 'Saving...' : 'Save & Update Profile'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResumeUploadModal;
