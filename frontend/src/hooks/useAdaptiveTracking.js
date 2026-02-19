import { useCallback, useRef } from 'react';
import adaptiveService from '../services/adaptiveService';

export function useAdaptiveTracking() {
  const pageEntryTime = useRef(null);

  const trackView = useCallback((opportunityId, opportunityType, category, tags) => {
    adaptiveService.trackBehavior('opportunity_view', {
      opportunityId, opportunityType, category, tags,
    }).catch(() => {});
    pageEntryTime.current = Date.now();
  }, []);

  const trackClick = useCallback((opportunityId, opportunityType, source = 'list') => {
    adaptiveService.trackBehavior('opportunity_click', {
      opportunityId, opportunityType, source,
    }).catch(() => {});
  }, []);

  const trackRecommendationClick = useCallback((opportunityId, opportunityType) => {
    adaptiveService.trackBehavior('recommendation_click', {
      opportunityId, opportunityType,
    }).catch(() => {});
  }, []);

  const trackTimeOnPage = useCallback((opportunityId) => {
    if (pageEntryTime.current) {
      const seconds = Math.round((Date.now() - pageEntryTime.current) / 1000);
      if (seconds > 5) {
        adaptiveService.trackBehavior('time_on_page', {
          opportunityId, seconds,
        }).catch(() => {});
      }
      pageEntryTime.current = null;
    }
  }, []);

  return { trackView, trackClick, trackRecommendationClick, trackTimeOnPage };
}
