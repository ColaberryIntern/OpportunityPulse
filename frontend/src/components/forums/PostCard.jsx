import React from 'react';
import { Link } from 'react-router-dom';

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

function PostCard({ post }) {
  return (
    <Link to={`/forums/${post.id}`}>
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 hover:shadow-md transition">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">{post.title}</h3>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[post.category] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
              {post.category?.replace('_', ' ')}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[post.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
              {post.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
          <span>{post.author?.name || post.user?.name || 'Unknown'}</span>
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>

          {/* Comment count */}
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            {post.commentCount ?? post.comments?.length ?? 0}
          </span>

          {/* View count */}
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {post.viewCount ?? 0}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default PostCard;
