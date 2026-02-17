import feedbackReducer, {
  fetchFeedback,
  fetchFeedbackStats,
  createFeedback,
  clearFeedbackError,
  clearCreateSuccess,
} from '../store/slices/feedbackSlice';

const initialState = {
  items: [],
  stats: null,
  pagination: null,
  loading: false,
  error: null,
  createSuccess: false,
};

describe('feedbackSlice', () => {
  it('should return initial state', () => {
    expect(feedbackReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('fetchFeedback.pending sets loading true', () => {
    const state = feedbackReducer(initialState, {
      type: 'feedback/fetchFeedback/pending',
    });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('fetchFeedback.fulfilled populates items and pagination', () => {
    const payload = {
      feedback: [{ id: 1, score: 5 }],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    };
    const state = feedbackReducer(initialState, {
      type: 'feedback/fetchFeedback/fulfilled',
      payload,
    });
    expect(state.loading).toBe(false);
    expect(state.items).toEqual(payload.feedback);
    expect(state.pagination).toEqual(payload.pagination);
  });

  it('fetchFeedback.rejected sets error', () => {
    const state = feedbackReducer(initialState, {
      type: 'feedback/fetchFeedback/rejected',
      payload: 'Failed to fetch feedback',
    });
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Failed to fetch feedback');
  });

  it('fetchFeedbackStats.fulfilled sets stats', () => {
    const stats = { totalCount: 10, averageScore: 4.2 };
    const state = feedbackReducer(initialState, {
      type: 'feedback/fetchFeedbackStats/fulfilled',
      payload: stats,
    });
    expect(state.stats).toEqual(stats);
  });

  it('createFeedback.fulfilled adds to items and sets createSuccess', () => {
    const feedback = { id: 2, score: 4 };
    const state = feedbackReducer(initialState, {
      type: 'feedback/createFeedback/fulfilled',
      payload: feedback,
    });
    expect(state.items[0]).toEqual(feedback);
    expect(state.createSuccess).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('clearFeedbackError resets error', () => {
    const stateWithError = { ...initialState, error: 'some error' };
    const state = feedbackReducer(stateWithError, clearFeedbackError());
    expect(state.error).toBeNull();
  });

  it('clearCreateSuccess resets flag', () => {
    const stateWithSuccess = { ...initialState, createSuccess: true };
    const state = feedbackReducer(stateWithSuccess, clearCreateSuccess());
    expect(state.createSuccess).toBe(false);
  });
});
