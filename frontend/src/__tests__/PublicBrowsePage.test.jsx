import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PublicBrowsePage from '../pages/PublicBrowsePage';
import { renderWithProviders } from './testUtils';
import publicOpportunityService from '../services/publicOpportunityService';

// Mock the publicOpportunityService module
jest.mock('../services/publicOpportunityService', () => ({
  __esModule: true,
  default: {
    list: jest.fn(),
    getStats: jest.fn(),
    getById: jest.fn(),
  },
}));

// Mock child components to isolate the page-level tests
jest.mock('../components/opportunities/OpportunityFilters', () => {
  return function MockOpportunityFilters(props) {
    return (
      <div data-testid="opportunity-filters" data-is-public={props.isPublic ? 'true' : 'false'}>
        OpportunityFilters
      </div>
    );
  };
});

jest.mock('../components/opportunities/OpportunityList', () => {
  return function MockOpportunityList(props) {
    return (
      <div data-testid="opportunity-list" data-is-public={props.isPublic ? 'true' : 'false'}>
        {props.loading ? 'Loading opportunities...' : 'OpportunityList'}
      </div>
    );
  };
});

describe('PublicBrowsePage', () => {
  beforeEach(() => {
    publicOpportunityService.list.mockResolvedValue({
      data: { data: { results: [] }, pagination: null },
    });
    publicOpportunityService.getStats.mockResolvedValue({
      data: { data: { stats: { total: 10, gov_contract: 5, ai_job: 3, investment: 2 } } },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Browse Opportunities" heading', async () => {
    renderWithProviders(<PublicBrowsePage />);

    expect(screen.getByText('Browse Opportunities')).toBeInTheDocument();
    expect(screen.getByText('Browse Opportunities').tagName).toBe('H1');

    // Wait for async effects to settle
    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalled();
    });
  });

  it('shows Sign In and Sign Up links', async () => {
    renderWithProviders(<PublicBrowsePage />);

    const signInLink = screen.getByText('Sign In');
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');

    const signUpLink = screen.getByText('Sign Up');
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink.closest('a')).toHaveAttribute('href', '/register');

    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalled();
    });
  });

  it('shows "Create Free Account" CTA', async () => {
    renderWithProviders(<PublicBrowsePage />);

    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalled();
    });

    const ctaLink = screen.getByText('Create Free Account');
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink.closest('a')).toHaveAttribute('href', '/register');
  });

  it('renders filters with isPublic prop', async () => {
    renderWithProviders(<PublicBrowsePage />);

    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalled();
    });

    const filters = screen.getByTestId('opportunity-filters');
    expect(filters).toBeInTheDocument();
    expect(filters).toHaveAttribute('data-is-public', 'true');
  });

  it('renders list with isPublic prop', async () => {
    renderWithProviders(<PublicBrowsePage />);

    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalled();
    });

    const list = screen.getByTestId('opportunity-list');
    expect(list).toBeInTheDocument();
    expect(list).toHaveAttribute('data-is-public', 'true');
  });

  it('shows loading state initially', () => {
    // Delay the service resolution so loading state is visible
    publicOpportunityService.list.mockReturnValue(new Promise(() => {}));
    publicOpportunityService.getStats.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<PublicBrowsePage />);

    // The OpportunityList mock reflects loading prop
    expect(screen.getByText('Loading opportunities...')).toBeInTheDocument();
  });

  it('displays stats after they load', async () => {
    renderWithProviders(<PublicBrowsePage />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Active')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Gov Contracts')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('AI Jobs')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Investments')).toBeInTheDocument();
  });

  it('calls publicOpportunityService.list and getStats on mount', async () => {
    renderWithProviders(<PublicBrowsePage />);

    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(publicOpportunityService.getStats).toHaveBeenCalled();
    });
  });

  it('shows descriptive subtitle text', async () => {
    renderWithProviders(<PublicBrowsePage />);

    expect(
      screen.getByText('Explore government contracts, AI jobs, and investment opportunities.')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(publicOpportunityService.list).toHaveBeenCalled();
    });
  });
});
