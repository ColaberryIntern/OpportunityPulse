import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AlertList from '../components/alerts/AlertList';
import { renderWithProviders } from './testUtils';

const mockAlerts = [
  {
    id: 1,
    type: 'new_opportunity',
    title: 'New Opportunity',
    message: 'A new opp',
    severity: 'info',
    read: false,
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    type: 'trend_alert',
    title: 'Trend Alert',
    message: 'Trend detected',
    severity: 'warning',
    read: true,
    createdAt: '2026-01-14T00:00:00Z',
  },
];

const defaultProps = {
  alerts: mockAlerts,
  pagination: null,
  onPageChange: jest.fn(),
  onMarkRead: jest.fn(),
  onMarkAllRead: jest.fn(),
  onDelete: jest.fn(),
  loading: false,
};

describe('AlertList', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders alert items', () => {
    renderWithProviders(<AlertList {...defaultProps} />);

    // Title text appears in both h4 and span for "New Opportunity" and "Trend Alert"
    // since the TYPE_LABELS match the titles. Use h4 selector for titles.
    const titles = screen.getAllByRole('heading', { level: 4 });
    expect(titles).toHaveLength(2);
    expect(titles[0]).toHaveTextContent('New Opportunity');
    expect(titles[1]).toHaveTextContent('Trend Alert');

    // Messages should appear once
    expect(screen.getByText('A new opp')).toBeInTheDocument();
    expect(screen.getByText('Trend detected')).toBeInTheDocument();
  });

  it('shows severity icons with correct color classes', () => {
    const alertsWithImportant = [
      ...mockAlerts,
      {
        id: 3,
        type: 'system',
        title: 'Critical Issue',
        message: 'Something critical',
        severity: 'important',
        read: false,
        createdAt: '2026-01-16T00:00:00Z',
      },
    ];

    const { container } = renderWithProviders(
      <AlertList {...defaultProps} alerts={alertsWithImportant} />
    );

    // Info severity icon should have text-blue-500 class
    const blueIcons = container.querySelectorAll('.text-blue-500');
    expect(blueIcons.length).toBeGreaterThan(0);

    // Warning severity icon should have text-yellow-500 class
    const yellowIcons = container.querySelectorAll('.text-yellow-500');
    expect(yellowIcons.length).toBeGreaterThan(0);

    // Important severity icon should have text-red-500 class
    const redIcons = container.querySelectorAll('.text-red-500');
    expect(redIcons.length).toBeGreaterThan(0);
  });

  it('shows unread styling for unread alerts', () => {
    const { container } = renderWithProviders(<AlertList {...defaultProps} />);

    // The unread alert (id 1) should have border-l-4 class
    const alertItems = container.querySelectorAll('.border-l-4');
    expect(alertItems.length).toBe(1);

    // Unread alert title (h4) should have font-semibold
    const titles = screen.getAllByRole('heading', { level: 4 });
    expect(titles[0]).toHaveClass('font-semibold');

    // Read alert title (h4) should have font-normal
    expect(titles[1]).toHaveClass('font-normal');
  });

  it('calls onMarkRead when mark-read button is clicked', () => {
    const onMarkRead = jest.fn();
    renderWithProviders(<AlertList {...defaultProps} onMarkRead={onMarkRead} />);

    const markReadButton = screen.getByText('Mark read');
    fireEvent.click(markReadButton);

    expect(onMarkRead).toHaveBeenCalledWith(1);
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = jest.fn();
    renderWithProviders(<AlertList {...defaultProps} onDelete={onDelete} />);

    // There should be a delete button for each alert
    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons).toHaveLength(2);

    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith(1);

    fireEvent.click(deleteButtons[1]);
    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it('shows "Mark all as read" button when there are unread alerts', () => {
    const onMarkAllRead = jest.fn();
    renderWithProviders(<AlertList {...defaultProps} onMarkAllRead={onMarkAllRead} />);

    const markAllButton = screen.getByText('Mark all as read');
    expect(markAllButton).toBeInTheDocument();

    fireEvent.click(markAllButton);
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it('does not show "Mark all as read" button when all alerts are read', () => {
    const allReadAlerts = mockAlerts.map((a) => ({ ...a, read: true }));
    renderWithProviders(<AlertList {...defaultProps} alerts={allReadAlerts} />);

    expect(screen.queryByText('Mark all as read')).not.toBeInTheDocument();
  });

  it('shows empty state message when no alerts', () => {
    renderWithProviders(<AlertList {...defaultProps} alerts={[]} />);

    expect(screen.getByText('No alerts yet.')).toBeInTheDocument();
  });

  it('shows empty state when alerts is null', () => {
    renderWithProviders(<AlertList {...defaultProps} alerts={null} />);

    expect(screen.getByText('No alerts yet.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderWithProviders(<AlertList {...defaultProps} loading={true} />);

    expect(screen.getByText('Loading alerts...')).toBeInTheDocument();
    // Alert items should not be rendered during loading
    expect(screen.queryByText('A new opp')).not.toBeInTheDocument();
  });

  it('shows type labels for alerts', () => {
    renderWithProviders(<AlertList {...defaultProps} />);

    // Type labels appear in span elements with bg-gray-100 class
    // "New Opportunity" appears as both h4 title and span type label
    // "Trend Alert" appears as both h4 title and span type label
    const newOppElements = screen.getAllByText('New Opportunity');
    expect(newOppElements.length).toBe(2); // h4 + span

    const trendAlertElements = screen.getAllByText('Trend Alert');
    expect(trendAlertElements.length).toBe(2); // h4 + span
  });

  it('does not show mark-read button for already-read alerts', () => {
    const allReadAlerts = mockAlerts.map((a) => ({ ...a, read: true }));
    renderWithProviders(<AlertList {...defaultProps} alerts={allReadAlerts} />);

    expect(screen.queryByText('Mark read')).not.toBeInTheDocument();
  });
});
