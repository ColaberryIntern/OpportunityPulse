import reducer, {
  clearOpportunityError,
  clearCurrentOpportunity,
} from '../store/slices/opportunitySlice';

describe('opportunitySlice', () => {
  const initialState = {
    items: [],
    currentItem: null,
    stats: null,
    filters: {},
    pagination: null,
    loading: false,
    detailLoading: false,
    error: null,
  };

  it('should return initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('fetchOpportunities.fulfilled should set items and pagination', () => {
    const payload = {
      results: [
        { id: 1, title: 'Opp A' },
        { id: 2, title: 'Opp B' },
      ],
      filters: { type: ['grant', 'contract'] },
      pagination: { page: 1, limit: 20, total: 2 },
    };

    const state = reducer(initialState, {
      type: 'opportunities/fetchOpportunities/fulfilled',
      payload,
    });

    expect(state.items).toEqual(payload.results);
    expect(state.pagination).toEqual(payload.pagination);
    expect(state.filters).toEqual(payload.filters);
    expect(state.loading).toBe(false);
  });

  it('fetchOpportunities.rejected should set error', () => {
    const state = reducer(initialState, {
      type: 'opportunities/fetchOpportunities/rejected',
      payload: 'Failed to fetch opportunities',
    });

    expect(state.error).toBe('Failed to fetch opportunities');
    expect(state.loading).toBe(false);
  });

  it('fetchOpportunityById.fulfilled should set currentItem', () => {
    const opportunity = { id: 42, title: 'Test Opportunity', score: 85 };

    const state = reducer(initialState, {
      type: 'opportunities/fetchOpportunityById/fulfilled',
      payload: opportunity,
    });

    expect(state.currentItem).toEqual(opportunity);
    expect(state.detailLoading).toBe(false);
  });

  it('fetchOpportunityStats.fulfilled should set stats', () => {
    const stats = { total: 100, active: 75, closed: 25 };

    const state = reducer(initialState, {
      type: 'opportunities/fetchOpportunityStats/fulfilled',
      payload: stats,
    });

    expect(state.stats).toEqual(stats);
  });

  it('clearOpportunityError should clear error', () => {
    const stateWithError = { ...initialState, error: 'Something went wrong' };

    const state = reducer(stateWithError, clearOpportunityError());

    expect(state.error).toBeNull();
  });

  it('clearCurrentOpportunity should set currentItem to null', () => {
    const stateWithItem = {
      ...initialState,
      currentItem: { id: 1, title: 'Some Opp' },
    };

    const state = reducer(stateWithItem, clearCurrentOpportunity());

    expect(state.currentItem).toBeNull();
  });
});
