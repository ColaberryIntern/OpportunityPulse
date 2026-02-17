import reducer, { clearAlertError } from '../store/slices/alertSlice';

describe('alertSlice', () => {
  const initialState = {
    items: [],
    unreadCount: 0,
    pagination: null,
    loading: false,
    error: null,
  };

  it('should return initial state', () => {
    expect(reducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('fetchAlerts.fulfilled should set items and pagination', () => {
    const payload = {
      alerts: [
        { id: 1, message: 'Alert one', read: false },
        { id: 2, message: 'Alert two', read: true },
      ],
      pagination: { page: 1, limit: 20, total: 2 },
    };

    const state = reducer(initialState, {
      type: 'alerts/fetchAlerts/fulfilled',
      payload,
    });

    expect(state.items).toEqual(payload.alerts);
    expect(state.pagination).toEqual(payload.pagination);
    expect(state.loading).toBe(false);
  });

  it('fetchUnreadCount.fulfilled should set unreadCount', () => {
    const state = reducer(initialState, {
      type: 'alerts/fetchUnreadCount/fulfilled',
      payload: 7,
    });

    expect(state.unreadCount).toBe(7);
  });

  it('markAlertAsRead.fulfilled should set read=true and decrement unreadCount', () => {
    const stateWithAlerts = {
      ...initialState,
      items: [
        { id: 1, message: 'Alert one', read: false },
        { id: 2, message: 'Alert two', read: false },
      ],
      unreadCount: 2,
    };

    const state = reducer(stateWithAlerts, {
      type: 'alerts/markAlertAsRead/fulfilled',
      payload: 1,
    });

    expect(state.items.find((a) => a.id === 1).read).toBe(true);
    expect(state.items.find((a) => a.id === 2).read).toBe(false);
    expect(state.unreadCount).toBe(1);
  });

  it('markAlertAsRead.fulfilled should not decrement if already read', () => {
    const stateWithAlerts = {
      ...initialState,
      items: [{ id: 1, message: 'Alert one', read: true }],
      unreadCount: 0,
    };

    const state = reducer(stateWithAlerts, {
      type: 'alerts/markAlertAsRead/fulfilled',
      payload: 1,
    });

    expect(state.items.find((a) => a.id === 1).read).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it('markAllAlertsAsRead.fulfilled should mark all as read and set unreadCount to 0', () => {
    const stateWithAlerts = {
      ...initialState,
      items: [
        { id: 1, message: 'Alert one', read: false },
        { id: 2, message: 'Alert two', read: false },
        { id: 3, message: 'Alert three', read: true },
      ],
      unreadCount: 2,
    };

    const state = reducer(stateWithAlerts, {
      type: 'alerts/markAllAlertsAsRead/fulfilled',
      payload: true,
    });

    state.items.forEach((alert) => {
      expect(alert.read).toBe(true);
    });
    expect(state.unreadCount).toBe(0);
  });

  it('deleteAlert.fulfilled should remove item from items', () => {
    const stateWithAlerts = {
      ...initialState,
      items: [
        { id: 1, message: 'Alert one', read: true },
        { id: 2, message: 'Alert two', read: false },
      ],
      unreadCount: 1,
    };

    const state = reducer(stateWithAlerts, {
      type: 'alerts/deleteAlert/fulfilled',
      payload: 2,
    });

    expect(state.items).toHaveLength(1);
    expect(state.items[0].id).toBe(1);
    expect(state.unreadCount).toBe(0);
  });

  it('deleteAlert.fulfilled should not decrement unreadCount if deleted alert was already read', () => {
    const stateWithAlerts = {
      ...initialState,
      items: [
        { id: 1, message: 'Alert one', read: true },
        { id: 2, message: 'Alert two', read: false },
      ],
      unreadCount: 1,
    };

    const state = reducer(stateWithAlerts, {
      type: 'alerts/deleteAlert/fulfilled',
      payload: 1,
    });

    expect(state.items).toHaveLength(1);
    expect(state.items[0].id).toBe(2);
    expect(state.unreadCount).toBe(1);
  });

  it('clearAlertError should clear error', () => {
    const stateWithError = { ...initialState, error: 'Some error' };

    const state = reducer(stateWithError, clearAlertError());

    expect(state.error).toBeNull();
  });
});
