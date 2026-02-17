import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchFeedback,
  fetchFeedbackStats,
  createFeedback,
  deleteFeedback,
  clearCreateSuccess,
} from '../store/slices/feedbackSlice';
import FeedbackForm from '../components/feedback/FeedbackForm';
import FeedbackList from '../components/feedback/FeedbackList';
import FeedbackStats from '../components/feedback/FeedbackStats';

function FeedbackPage() {
  const dispatch = useDispatch();
  const { items, stats, pagination, loading, error, createSuccess } = useSelector(
    (state) => state.feedback
  );
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';

  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    dispatch(fetchFeedbackStats());
  }, [dispatch]);

  useEffect(() => {
    dispatch(
      fetchFeedback({
        page: 1,
        limit: 20,
        type: filterType || undefined,
      })
    );
  }, [dispatch, filterType]);

  useEffect(() => {
    if (createSuccess) {
      dispatch(fetchFeedback({ page: 1, limit: 20, type: filterType || undefined }));
      dispatch(fetchFeedbackStats());
      dispatch(clearCreateSuccess());
    }
  }, [dispatch, createSuccess, filterType]);

  const handleSubmit = (data) => {
    dispatch(createFeedback(data));
  };

  const handleDelete = (id) => {
    dispatch(deleteFeedback(id));
  };

  const handlePageChange = (newPage) => {
    dispatch(
      fetchFeedback({
        page: newPage,
        limit: 20,
        type: filterType || undefined,
      })
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Feedback</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6">
          <FeedbackStats stats={stats} />
        </div>

        {/* Filter */}
        <div className="mb-4">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Types</option>
            <option value="platform">Platform</option>
            <option value="opportunity">Opportunity</option>
            <option value="content">Content</option>
          </select>
        </div>

        {/* Submit Feedback */}
        <div className="mb-6">
          <FeedbackForm onSubmit={handleSubmit} loading={loading} />
        </div>

        {/* Feedback List */}
        <FeedbackList
          items={items}
          pagination={pagination}
          onPageChange={handlePageChange}
          onDelete={handleDelete}
          loading={loading}
          currentUserId={user?.id}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

export default FeedbackPage;
