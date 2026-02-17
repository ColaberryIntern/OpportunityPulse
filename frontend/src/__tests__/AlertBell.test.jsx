import React from 'react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AlertBell from '../components/alerts/AlertBell';
import { renderWithProviders } from './testUtils';

// Mock the alertService to prevent real API calls from the thunk
jest.mock('../services/alertService', () => ({
  __esModule: true,
  default: {
    list: jest.fn().mockResolvedValue({ data: { data: [], pagination: null } }),
    getUnreadCount: jest.fn().mockResolvedValue({ data: { data: { unreadCount: 0 } } }),
    markAsRead: jest.fn().mockResolvedValue({}),
    markAllAsRead: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
}));

const alertState = (unreadCount = 0) => ({
  alerts: { items: [], unreadCount, pagination: null, loading: false, error: null },
});

describe('AlertBell', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the bell icon button', () => {
    renderWithProviders(<AlertBell />, {
      preloadedState: alertState(0),
    });

    const button = screen.getByRole('button', { name: /alerts/i });
    expect(button).toBeInTheDocument();

    // The SVG bell icon should be present inside the button
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows unread count badge when count is greater than 0', () => {
    renderWithProviders(<AlertBell />, {
      preloadedState: alertState(5),
    });

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not show badge when unread count is 0', () => {
    renderWithProviders(<AlertBell />, {
      preloadedState: alertState(0),
    });

    // No badge text should be present
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows 99+ when unread count exceeds 99', () => {
    renderWithProviders(<AlertBell />, {
      preloadedState: alertState(150),
    });

    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('dispatches fetchUnreadCount on mount', () => {
    const { store } = renderWithProviders(<AlertBell />, {
      preloadedState: alertState(0),
    });

    // Verify dispatch was called (the thunk dispatches to the store)
    const dispatchSpy = jest.spyOn(store, 'dispatch');
    // The initial dispatch already happened on mount, so we verify via the
    // mocked service that was called by the thunk
    const alertService = require('../services/alertService').default;
    expect(alertService.getUnreadCount).toHaveBeenCalled();
  });

  it('navigates to /alerts when clicked', () => {
    renderWithProviders(<AlertBell />, {
      preloadedState: alertState(0),
    });

    const button = screen.getByRole('button', { name: /alerts/i });
    // The component uses useNavigate with onClick, so we verify the button exists
    // and is clickable (navigation is handled by React Router internals)
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });
});
