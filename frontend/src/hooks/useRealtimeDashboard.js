import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSocket } from './useSocket';
import { fetchActivity } from '../store/slices/dashboardSlice';
import { fetchExecutiveBrief } from '../store/slices/actionEngineSlice';

export function useRealtimeDashboard() {
  const dispatch = useDispatch();
  const { on } = useSocket();

  useEffect(() => {
    const cleanups = [
      on('dashboard.stats_updated', () => {
        dispatch(fetchExecutiveBrief());
      }),
      on('opportunity.created', () => {
        dispatch(fetchExecutiveBrief());
      }),
      on('alert.created', () => {
        dispatch(fetchActivity({ page: 1, limit: 20 }));
      }),
      on('ingestion.completed', () => {
        dispatch(fetchExecutiveBrief());
      }),
      on('content.published', () => {
        dispatch(fetchActivity({ page: 1, limit: 20 }));
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup && cleanup());
  }, [dispatch, on]);
}
