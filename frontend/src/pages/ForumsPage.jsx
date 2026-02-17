import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchPosts,
  createPost,
  clearCreateSuccess,
} from '../store/slices/forumSlice';
import PostForm from '../components/forums/PostForm';
import PostList from '../components/forums/PostList';
import ForumFilters from '../components/forums/ForumFilters';

function ForumsPage() {
  const dispatch = useDispatch();
  const { posts, pagination, loading, error, createSuccess } = useSelector(
    (state) => state.forums
  );

  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ category: '', status: '' });

  useEffect(() => {
    dispatch(
      fetchPosts({
        page: 1,
        limit: 20,
        category: filters.category || undefined,
        status: filters.status || undefined,
      })
    );
  }, [dispatch, filters]);

  useEffect(() => {
    if (createSuccess) {
      dispatch(
        fetchPosts({
          page: 1,
          limit: 20,
          category: filters.category || undefined,
          status: filters.status || undefined,
        })
      );
      dispatch(clearCreateSuccess());
      setShowForm(false);
    }
  }, [dispatch, createSuccess, filters]);

  const handleCreatePost = (data) => {
    dispatch(createPost(data));
  };

  const handlePageChange = (newPage) => {
    dispatch(
      fetchPosts({
        page: newPage,
        limit: 20,
        category: filters.category || undefined,
        status: filters.status || undefined,
      })
    );
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary">Discussion Forums</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'New Post'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* New Post Form */}
        {showForm && (
          <div className="mb-6">
            <PostForm onSubmit={handleCreatePost} loading={loading} />
          </div>
        )}

        {/* Filters */}
        <div className="mb-4">
          <ForumFilters filters={filters} onFilterChange={handleFilterChange} />
        </div>

        {/* Post List */}
        <PostList
          posts={posts}
          pagination={pagination}
          onPageChange={handlePageChange}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default ForumsPage;
