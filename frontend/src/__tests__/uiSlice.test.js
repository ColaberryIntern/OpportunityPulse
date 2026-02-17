import reducer, {
  showUpgradePrompt,
  dismissUpgradePrompt,
} from '../store/slices/uiSlice';

describe('uiSlice', () => {
  const initialState = {
    upgradeRequired: false,
    upgradeMessage: '',
  };

  it('should return initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('showUpgradePrompt should set upgradeRequired and upgradeMessage', () => {
    const message = 'You need a Pro plan to access analytics.';

    const state = reducer(initialState, showUpgradePrompt(message));

    expect(state.upgradeRequired).toBe(true);
    expect(state.upgradeMessage).toBe(message);
  });

  it('showUpgradePrompt with no payload should use default message', () => {
    const state = reducer(initialState, showUpgradePrompt());

    expect(state.upgradeRequired).toBe(true);
    expect(state.upgradeMessage).toBe(
      'Premium subscription required to access this feature.'
    );
  });

  it('dismissUpgradePrompt should clear state', () => {
    const activeState = {
      upgradeRequired: true,
      upgradeMessage: 'Upgrade now!',
    };

    const state = reducer(activeState, dismissUpgradePrompt());

    expect(state.upgradeRequired).toBe(false);
    expect(state.upgradeMessage).toBe('');
  });
});
