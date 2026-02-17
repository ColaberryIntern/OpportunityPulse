import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createContent, updateContent, clearCreateSuccess, clearContentError } from '../../store/slices/contentSlice';

function ContentEditor({ editItem, onCancel }) {
  const dispatch = useDispatch();
  const { loading, error, createSuccess } = useSelector((state) => state.content);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('draft');

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
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {editItem ? 'Edit Content' : 'Create Content'}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {createSuccess && !editItem && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          Content created successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
            maxLength={255}
          />
        </div>

        <div>
          <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
            Body *
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <input
              type="text"
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. contracts, jobs, investments"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AI, government, defense"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
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
