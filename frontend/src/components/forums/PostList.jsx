import React from 'react';
import PostCard from './PostCard';
import Pagination from '../common/Pagination';

function PostList({ posts, pagination, onPageChange, loading }) {
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

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No posts yet. Start a discussion!
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
      <Pagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  );
}

export default PostList;
