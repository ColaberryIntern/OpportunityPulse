import React, { useState } from 'react';

const CATEGORY_COLORS = {
  general: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
  gov_contracts: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800',
  ai_jobs: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800',
  investments: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  platform: 'bg-indigo-100 text-indigo-800',
};

const STATUS_COLORS = {
  open: 'bg-green-100 dark:bg-green-900/30 text-green-800',
  closed: 'bg-red-100 dark:bg-red-900/30 text-red-800',
  pinned: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800',
};

function PostDetail({ post, loading, onAddComment, onDeleteComment, currentUserId, isAdmin }) {
  const [commentBody, setCommentBody] = useState('');

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Post not found.
      </div>
    );
  }

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    onAddComment(commentBody);
    setCommentBody('');
  };

  const comments = post.comments || [];

  return (
    <div>
      {/* Post Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-3">{post.title}</h1>
        <div className="flex items-center gap-3 mb-4 text-sm text-gray-500 dark:text-gray-400">
          <span>{post.author?.name || post.user?.name || 'Unknown'}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[post.category] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
            {post.category?.replace('_', ' ')}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[post.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
            {post.status}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {post.viewCount ?? 0} views
          </span>
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
        </div>

        {/* Post Body */}
        <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{post.body}</div>
      </div>

      {/* Comments Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Comments ({comments.length})
        </h2>

        {comments.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">No comments yet. Be the first to comment.</p>
        ) : (
          <div className="space-y-4 mb-6">
            {comments.map((comment) => (
              <div key={comment.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {comment.author?.name || comment.user?.name || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(comment.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{comment.body}</p>
                  </div>
                  {(currentUserId === (comment.author?.id || comment.user?.id) || isAdmin) && (
                    <button
                      onClick={() => onDeleteComment(comment.id)}
                      className="text-red-500 hover:text-red-700 text-sm ml-4"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Comment Form */}
        <form onSubmit={handleCommentSubmit} className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            placeholder="Write a comment..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-2 dark:bg-gray-800 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={!commentBody.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Comment
          </button>
        </form>
      </div>
    </div>
  );
}

export default PostDetail;
