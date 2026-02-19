import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { createContent } from '../../store/slices/contentSlice';
import api from '../../services/api';

function ContentGenerator() {
  const dispatch = useDispatch();

  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [generated, setGenerated] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim() || topic.trim().length < 3) return;
    setGenerating(true);
    setGenError(null);
    setGenerated(null);
    setSaveSuccess(false);
    try {
      const response = await api.post('/content/generate', { topic: topic.trim() });
      setGenerated(response.data.data);
    } catch (err) {
      setGenError(err.response?.data?.message || 'Failed to generate content.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAsDraft = async () => {
    if (!generated || saving) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await dispatch(createContent({
        title: generated.title,
        body: generated.body,
        category: generated.category || undefined,
        tags: Array.isArray(generated.tags) ? generated.tags : [],
        status: 'draft',
      })).unwrap();
      setSaveSuccess(true);
    } catch {
      setGenError('Failed to save content as draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTopic('');
    setGenerated(null);
    setGenError(null);
    setSaveSuccess(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Generate Content with AI
      </h2>

      <div className="mb-4">
        <label htmlFor="gen-topic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Topic
        </label>
        <div className="flex gap-2">
          <input
            id="gen-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleGenerate())}
            placeholder="Enter a topic (e.g. 'AI trends in federal contracting')"
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-highlight dark:bg-gray-800 dark:text-gray-100"
            disabled={generating}
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !topic.trim() || topic.trim().length < 3}
            className="px-4 py-2 bg-highlight text-white rounded-md text-sm font-medium hover:bg-highlight/90 disabled:opacity-50 whitespace-nowrap transition"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </span>
            ) : 'Generate'}
          </button>
        </div>
      </div>

      {genError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-gray-700 rounded text-red-700 dark:text-red-400 text-sm">
          {genError}
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-gray-700 rounded text-green-700 dark:text-green-400 text-sm">
          Content saved as draft successfully.
        </div>
      )}

      {generated && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{generated.title}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {generated.category && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                {generated.category}
              </span>
            )}
            {Array.isArray(generated.tags) && generated.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {tag}
              </span>
            ))}
          </div>

          <div className="prose prose-sm dark:prose-invert max-w-none">
            {generated.body.split('\n').map((paragraph, i) => (
              paragraph.trim() ? <p key={i} className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{paragraph}</p> : null
            ))}
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleSaveAsDraft}
              disabled={saving || saveSuccess}
              className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save as Draft'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContentGenerator;
