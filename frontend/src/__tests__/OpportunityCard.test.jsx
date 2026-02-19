import React from 'react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpportunityCard from '../components/opportunities/OpportunityCard';
import { renderWithProviders } from './testUtils';

const mockOpportunity = {
  id: 1,
  title: 'Test Opportunity',
  type: 'gov_contract',
  status: 'active',
  category: 'Technology',
  value: 50000,
  aiScore: 85,
  publishedAt: '2026-01-15T00:00:00Z',
  tags: ['AI', 'Machine Learning'],
};

describe('OpportunityCard', () => {
  it('renders opportunity title', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} />);
    expect(screen.getByText('Test Opportunity')).toBeInTheDocument();
  });

  it('shows type badge with correct color class for gov_contract', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} />);
    const badge = screen.getByText('Gov Contract');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-800');
  });

  it('shows AI score when not public', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} />);
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('AI Score')).toBeInTheDocument();
  });

  it('hides AI score when isPublic is true', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} isPublic />);
    expect(screen.queryByText('85')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Score')).not.toBeInTheDocument();
  });

  it('shows "Sign in for details" when isPublic', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} isPublic />);
    expect(screen.getByText('Sign in for details')).toBeInTheDocument();
  });

  it('displays formatted value when present', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} />);
    expect(screen.getByText('$50,000')).toBeInTheDocument();
  });

  it('links to opportunity detail page', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} />);
    const links = screen.getAllByRole('link');
    const cardLink = links.find((l) => l.getAttribute('href') === '/opportunities/1');
    expect(cardLink).toBeTruthy();
  });

  it('links to browse page when isPublic', () => {
    renderWithProviders(<OpportunityCard opportunity={mockOpportunity} isPublic />);
    const links = screen.getAllByRole('link');
    const cardLink = links.find((l) => l.getAttribute('href') === '/browse/1');
    expect(cardLink).toBeTruthy();
  });
});
