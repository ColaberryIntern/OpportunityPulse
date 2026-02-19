import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OpportunityFilters from '../components/opportunities/OpportunityFilters';
import { renderWithProviders } from './testUtils';

describe('OpportunityFilters', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders filter inputs', () => {
    const onFilterChange = jest.fn();
    renderWithProviders(<OpportunityFilters onFilterChange={onFilterChange} />);

    expect(screen.getByPlaceholderText('Search opportunities...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Category')).toBeInTheDocument();
  });

  it('calls onFilterChange when keyword changes after debounce', async () => {
    const onFilterChange = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    renderWithProviders(<OpportunityFilters onFilterChange={onFilterChange} />);

    const searchInput = screen.getByPlaceholderText('Search opportunities...');
    await user.type(searchInput, 'AI');

    // Advance timers past the 300ms debounce
    jest.advanceTimersByTime(300);

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'AI' })
    );
  });

  it('hides minScore input when isPublic is true', () => {
    const onFilterChange = jest.fn();
    renderWithProviders(<OpportunityFilters onFilterChange={onFilterChange} isPublic />);

    expect(screen.queryByPlaceholderText('Min Score')).not.toBeInTheDocument();
  });

  it('shows minScore input when not public', () => {
    const onFilterChange = jest.fn();
    renderWithProviders(<OpportunityFilters onFilterChange={onFilterChange} />);

    expect(screen.getByPlaceholderText('Min Score')).toBeInTheDocument();
  });

  it('hides status dropdown when isPublic is true', () => {
    const onFilterChange = jest.fn();
    renderWithProviders(<OpportunityFilters onFilterChange={onFilterChange} isPublic />);

    expect(screen.queryByText('All Statuses')).not.toBeInTheDocument();
  });

  it('shows status dropdown when not public', () => {
    const onFilterChange = jest.fn();
    renderWithProviders(<OpportunityFilters onFilterChange={onFilterChange} />);

    expect(screen.getByDisplayValue('All Statuses')).toBeInTheDocument();
  });
});
