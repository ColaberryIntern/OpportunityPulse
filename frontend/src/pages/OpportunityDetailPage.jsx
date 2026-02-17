import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchOpportunityById,
  clearCurrentOpportunity,
} from '../store/slices/opportunitySlice';
import OpportunityDetail from '../components/opportunities/OpportunityDetail';
import UpgradePrompt from '../components/common/UpgradePrompt';

function OpportunityDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { currentItem, detailLoading, error } = useSelector(
    (state) => state.opportunities
  );

  useEffect(() => {
    dispatch(fetchOpportunityById(id));
    return () => {
      dispatch(clearCurrentOpportunity());
    };
  }, [dispatch, id]);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/opportunities"
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Opportunities
        </Link>

        <UpgradePrompt />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <OpportunityDetail opportunity={currentItem} loading={detailLoading} />
      </div>
    </div>
  );
}

export default OpportunityDetailPage;
