import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchContent } from '../store/slices/contentSlice';
import ContentList from '../components/content/ContentList';
import ContentEditor from '../components/content/ContentEditor';

function ContentPage() {
  const dispatch = useDispatch();
  const { items, pagination, loading, error } = useSelector((state) => state.content);
  const [editItem, setEditItem] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    dispatch(fetchContent({ page: 1, limit: 20, status: filterStatus || undefined, category: filterCategory || undefined }));
  }, [dispatch, filterStatus, filterCategory]);

  const handlePageChange = (newPage) => {
    dispatch(fetchContent({ page: newPage, limit: 20, status: filterStatus || undefined, category: filterCategory || undefined }));
  };

  const handleEdit = (item) => {
    setEditItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditItem(null);
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-primary mb-6">Content Management</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Editor */}
          <ContentEditor editItem={editItem} onCancel={handleCancelEdit} />

          {/* Filters */}
          <div className="flex gap-4">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <input
              type="text"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              placeholder="Filter by category..."
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Content List */}
          <ContentList
            items={items}
            pagination={pagination}
            onPageChange={handlePageChange}
            onEdit={handleEdit}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

export default ContentPage;
