import React, { useEffect, useState } from 'react';
import OpportunityCard from './OpportunityCard';
import Pagination from '../common/Pagination';
import savedOpportunityService from '../../services/savedOpportunityService';

function OpportunityList({ items, pagination, onPageChange, loading, isPublic = false }) {
  const [savedMap, setSavedMap] = useState({});

  useEffect(() => {
    if (isPublic || !items || items.length === 0) {
      setSavedMap({});
      return;
    }

    const ids = items.map((item) => item.id);
    savedOpportunityService.batchCheckSaved(ids)
      .then((response) => {
        setSavedMap(response.data?.data?.savedMap || {});
      })
      .catch(() => {
        // Silently fail — user may not be authenticated
      });
  }, [items, isPublic]);

  if (loading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading opportunities...</p>;
  }

  if (!items || !items.length) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
        No opportunities found.
      </div>
    );
  }

  return (
    <div>
      {pagination?.total != null && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {pagination.total} opportunity{pagination.total !== 1 ? 'ies' : 'y'} found
        </p>
      )}
      <div className="space-y-4">
        {items.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            isPublic={isPublic}
            initialSaved={savedMap[opportunity.id] || false}
          />
        ))}
      </div>
      <Pagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  );
}

export default OpportunityList;
