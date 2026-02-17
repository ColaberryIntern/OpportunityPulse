import React, { useState } from 'react';

function PostForm({ onSubmit, loading, initialValues }) {
  const [title, setTitle] = useState(initialValues?.title || '');
  const [body, setBody] = useState(initialValues?.body || '');
  const [category, setCategory] = useState(initialValues?.category || 'general');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    onSubmit({ title, body, category });
    if (!initialValues) {
      setTitle('');
      setBody('');
      setCategory('general');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-5">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        {initialValues ? 'Edit Post' : 'Create New Post'}
      </h3>

      {/* Title */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Body */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Write your post..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Category */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="general">General</option>
          <option value="gov_contracts">Government Contracts</option>
          <option value="ai_jobs">AI Jobs</option>
          <option value="investments">Investments</option>
          <option value="platform">Platform</option>
        </select>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !title.trim() || !body.trim()}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving...' : initialValues ? 'Update Post' : 'Create Post'}
      </button>
    </form>
  );
}

export default PostForm;
