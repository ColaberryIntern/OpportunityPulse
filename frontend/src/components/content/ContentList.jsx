import React from 'react';
import { useDispatch } from 'react-redux';
import { deleteContent } from '../../store/slices/contentSlice';

const STATUS_COLORS = {
  draft: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-600',
};

function ContentList({ items, pagination, onPageChange, onEdit, loading }) {
  const dispatch = useDispatch();

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this content?')) {
      dispatch(deleteContent(id));
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading content...</p>;
  }

  if (!items.length) {
    return (
      <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
        No content found. Create your first item above.
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white shadow rounded-lg p-5">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.body}</p>
                <div className="flex items-center gap-3 mt-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || STATUS_COLORS.draft}`}>
                    {item.status}
                  </span>
                  {item.category && (
                    <span className="text-xs text-gray-400">Category: {item.category}</span>
                  )}
                  {item.tags?.length > 0 && (
                    <span className="text-xs text-gray-400">
                      Tags: {item.tags.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => onEdit(item)}
                  className="text-primary hover:text-primary/80 text-sm font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex justify-between items-center text-sm">
          <span className="text-gray-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 border rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="px-3 py-1 border rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContentList;
