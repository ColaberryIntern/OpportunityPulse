import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpportunitiesPage from '../pages/OpportunitiesPage';
import { renderWithProviders } from './testUtils';

// Mock the opportunityService to prevent real API calls from the thunk
jest.mock('../services/opportunityService', () => ({
  __esModule: true,
  default: {
    list: jest.fn().mockResolvedValue({
      data: { data: { results: [], filters: {} }, pagination: null },
    }),
    getById: jest.fn().mockResolvedValue({ data: { data: { opportunity: null } } }),
    getStats: jest.fn().mockResolvedValue({ data: { data: { stats: null } } }),
  },
}));

// Mock child components to isolate the page-level tests
jest.mock('../components/opportunities/OpportunityFilters', () => {
  return function MockOpportunityFilters() {
    return <div data-testid="opportunity-filters">OpportunityFilters</div>;
  };
});

jest.mock('../components/opportunities/OpportunityList', () => {
  return function MockOpportunityList() {
    return <div data-testid="opportunity-list">OpportunityList</div>;
  };
});

jest.mock('../components/common/UpgradePrompt', () => {
  return function MockUpgradePrompt() {
    return <div data-testid="upgrade-prompt">UpgradePrompt</div>;
  };
});

const preloadedState = {
  opportunities: {
    items: [],
    currentItem: null,
    stats: null,
    filters: null,
    pagination: null,
    loading: false,
    detailLoading: false,
    error: null,
  },
  ui: { upgradeRequired: false, upgradeMessage: '' },
};

describe('OpportunitiesPage', () => {
  it('renders the page heading "Opportunities"', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    expect(screen.getByText('Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Opportunities').tagName).toBe('H1');
  });

  it('renders type tabs: All, Gov Contracts, AI Jobs, Investments', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Gov Contracts')).toBeInTheDocument();
    expect(screen.getByText('AI Jobs')).toBeInTheDocument();
    expect(screen.getByText('Investments')).toBeInTheDocument();
  });

  it('renders the OpportunityFilters component', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    expect(screen.getByTestId('opportunity-filters')).toBeInTheDocument();
  });

  it('renders the OpportunityList component', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    expect(screen.getByTestId('opportunity-list')).toBeInTheDocument();
  });

  it('renders the UpgradePrompt component', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    expect(screen.getByTestId('upgrade-prompt')).toBeInTheDocument();
  });

  it('shows error message when error is present in state', async () => {
    // Make the service reject so the thunk's rejected handler sets the error
    const opportunityService = require('../services/opportunityService').default;
    opportunityService.list.mockRejectedValueOnce({
      response: { data: { message: 'Failed to fetch opportunities' } },
    });

    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch opportunities')).toBeInTheDocument();
    });
  });

  it('does not show error message when error is null', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    expect(screen.queryByText('Failed to fetch opportunities')).not.toBeInTheDocument();
  });

  it('dispatches fetchOpportunities on mount', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    const opportunityService = require('../services/opportunityService').default;
    expect(opportunityService.list).toHaveBeenCalled();
  });

  it('all four tabs are rendered as buttons', () => {
    renderWithProviders(<OpportunitiesPage />, { preloadedState });

    const tabLabels = ['All', 'Gov Contracts', 'AI Jobs', 'Investments'];
    tabLabels.forEach((label) => {
      const tab = screen.getByText(label);
      expect(tab.closest('button')).toBeInTheDocument();
    });
  });
});
