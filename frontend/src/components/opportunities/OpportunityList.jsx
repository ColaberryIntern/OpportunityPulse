import React from 'react';
import OpportunityCard from './OpportunityCard';
import Pagination from '../common/Pagination';

function OpportunityList({ items, pagination, onPageChange, loading, isPublic = false }) {
  if (loading) {
    return <p className="text-gray-500">Loading opportunities...</p>;
  }

  if (!items || !items.length) {
    return (
      <div className="bg-white shadow rounded-lg p-6 text-center text-gray-500">
        No opportunities found.
      </div>
    );
  }

  return (
    <div>
      {pagination?.total != null && (
        <p className="text-sm text-gray-500 mb-3">
          {pagination.total} opportunity{pagination.total !== 1 ? 'ies' : 'y'} found
        </p>
      )}
      <div className="space-y-4">
        {items.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            isPublic={isPublic}
          />
        ))}
      </div>
      <Pagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  );
}

export default OpportunityList;
