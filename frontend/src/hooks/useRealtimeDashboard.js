import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSocket } from './useSocket';
import { fetchStats, fetchOpportunityDashboardStats, fetchActivity } from '../store/slices/dashboardSlice';

export function useRealtimeDashboard() {
  const dispatch = useDispatch();
  const { on } = useSocket();

  useEffect(() => {
    const cleanups = [
      on('dashboard.stats_updated', () => {
        dispatch(fetchOpportunityDashboardStats());
      }),
      on('opportunity.created', () => {
        dispatch(fetchOpportunityDashboardStats());
        dispatch(fetchStats());
      }),
      on('alert.created', () => {
        dispatch(fetchActivity({ page: 1, limit: 20 }));
      }),
      on('ingestion.completed', () => {
        dispatch(fetchStats());
        dispatch(fetchOpportunityDashboardStats());
      }),
      on('content.published', () => {
        dispatch(fetchStats());
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup && cleanup());
  }, [dispatch, on]);
}
