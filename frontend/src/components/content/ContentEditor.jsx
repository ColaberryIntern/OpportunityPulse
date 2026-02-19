import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createContent, updateContent, clearCreateSuccess, clearContentError } from '../../store/slices/contentSlice';
import api from '../../services/api';

function ContentEditor({ editItem, onCancel }) {
  const dispatch = useDispatch();
  const { loading, error, createSuccess } = useSelector((state) => state.content);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('draft');
  const [aiTopic, setAiTopic] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title || '');
      setBody(editItem.body || '');
      setCategory(editItem.category || '');
      setTags(editItem.tags?.join(', ') || '');
      setStatus(editItem.status || 'draft');
    } else {
      resetForm();
    }
  }, [editItem]);

  useEffect(() => {
    if (createSuccess && !editItem) {
      resetForm();
      dispatch(clearCreateSuccess());
    }
  }, [createSuccess, editItem, dispatch]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setCategory('');
    setTags('');
    setStatus('draft');
    setAiTopic('');
    setAiError(null);
  };

  const handleAIGenerate = async () => {
    if (!aiTopic.trim() || aiTopic.trim().length < 3) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const response = await api.post('/content/generate', { topic: aiTopic.trim() });
      const generated = response.data.data;
      setTitle(generated.title || '');
      setBody(generated.body || '');
      setCategory(generated.category || '');
      setTags(Array.isArray(generated.tags) ? generated.tags.join(', ') : '');
    } catch (err) {
      setAiError(err.response?.data?.message || 'Failed to generate content.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(clearContentError());

    const data = {
      title,
      body,
      category: category || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      status,
    };

    if (editItem) {
      dispatch(updateContent({ id: editItem.id, ...data }));
    } else {
      dispatch(createContent(data));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        {editItem ? 'Edit Content' : 'Create Content'}
      </h2>

      {error && (
        <span id="content-editor-error" className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded text-red-700 text-sm block" role="alert">
          {error}
        </span>
      )}

      {createSuccess && !editItem && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded text-green-700 text-sm">
          Content created successfully.
        </div>
      )}

      {!editItem && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
          <label htmlFor="content-ai-topic" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Generate with AI
          </label>
          <div className="flex gap-2">
            <input
              id="content-ai-topic"
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAIGenerate())}
              placeholder="Enter a topic (e.g. 'AI trends in federal contracting')"
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-highlight dark:bg-gray-800 dark:text-gray-100"
              aria-describedby={aiError ? 'content-ai-error' : undefined}
            />
            <button
              type="button"
              onClick={handleAIGenerate}
              disabled={aiGenerating || !aiTopic.trim() || aiTopic.trim().length < 3}
              className="px-4 py-2 bg-highlight text-white rounded-md text-sm font-medium hover:bg-highlight/90 disabled:opacity-50 whitespace-nowrap transition"
            >
              {aiGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {aiError && <span id="content-ai-error" className="text-xs text-red-600 mt-1 block">{aiError}</span>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="content-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title *
          </label>
          <input
            type="text"
            id="content-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            required
            aria-required="true"
            aria-invalid={!!error}
            aria-describedby={error ? 'content-editor-error' : undefined}
            maxLength={255}
          />
        </div>

        <div>
          <label htmlFor="content-body" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Body *
          </label>
          <textarea
            id="content-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            required
            aria-required="true"
            aria-invalid={!!error}
            aria-describedby={error ? 'content-editor-error' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="content-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <input
              type="text"
              id="content-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. contracts, jobs, investments"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="content-tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              id="content-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AI, government, defense"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="content-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              id="content-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : editItem ? 'Update' : 'Create'}
          </button>
          {editItem && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default ContentEditor;
