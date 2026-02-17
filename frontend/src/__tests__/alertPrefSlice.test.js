import reducer, {
  clearUpdateSuccess,
  clearAlertPrefError,
} from '../store/slices/alertPrefSlice';

describe('alertPrefSlice', () => {
  const initialState = {
    preferences: null,
    loading: false,
    error: null,
    updateSuccess: false,
  };

  it('should return initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('fetchAlertPreferences.fulfilled should set preferences', () => {
    const preferences = {
      emailEnabled: true,
      smsEnabled: false,
      types: ['opportunity_match', 'deadline'],
    };

    const state = reducer(initialState, {
      type: 'alertPreferences/fetchAlertPreferences/fulfilled',
      payload: preferences,
    });

    expect(state.preferences).toEqual(preferences);
    expect(state.loading).toBe(false);
  });

  it('updateAlertPreferences.fulfilled should set preferences and updateSuccess', () => {
    const updatedPreferences = {
      emailEnabled: true,
      smsEnabled: true,
      types: ['opportunity_match'],
    };

    const state = reducer(initialState, {
      type: 'alertPreferences/updateAlertPreferences/fulfilled',
      payload: updatedPreferences,
    });

    expect(state.preferences).toEqual(updatedPreferences);
    expect(state.updateSuccess).toBe(true);
    expect(state.loading).toBe(false);
  });

  it('clearUpdateSuccess should set updateSuccess to false', () => {
    const stateWithSuccess = { ...initialState, updateSuccess: true };

    const state = reducer(stateWithSuccess, clearUpdateSuccess());

    expect(state.updateSuccess).toBe(false);
  });

  it('clearAlertPrefError should clear error', () => {
    const stateWithError = { ...initialState, error: 'Update failed' };

    const state = reducer(stateWithError, clearAlertPrefError());

    expect(state.error).toBeNull();
  });
});
