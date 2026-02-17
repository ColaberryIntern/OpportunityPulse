import React from 'react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OpportunityList from '../components/opportunities/OpportunityList';
import { renderWithProviders } from './testUtils';

const mockItems = [
  {
    id: 1,
    title: 'Opportunity Alpha',
    type: 'gov_contract',
    status: 'active',
    category: 'Technology',
    value: 100000,
    aiScore: 90,
    publishedAt: '2026-01-10T00:00:00Z',
    tags: ['Cloud'],
  },
  {
    id: 2,
    title: 'Opportunity Beta',
    type: 'ai_job',
    status: 'active',
    category: 'Data Science',
    value: 75000,
    aiScore: 72,
    publishedAt: '2026-01-12T00:00:00Z',
    tags: ['ML'],
  },
];

const mockPagination = {
  page: 1,
  pages: 3,
  total: 25,
};

describe('OpportunityList', () => {
  it('renders opportunity cards', () => {
    renderWithProviders(
      <OpportunityList
        items={mockItems}
        pagination={mockPagination}
        onPageChange={jest.fn()}
        loading={false}
      />
    );

    expect(screen.getByText('Opportunity Alpha')).toBeInTheDocument();
    expect(screen.getByText('Opportunity Beta')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    renderWithProviders(
      <OpportunityList
        items={[]}
        pagination={null}
        onPageChange={jest.fn()}
        loading={true}
      />
    );

    expect(screen.getByText('Loading opportunities...')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    renderWithProviders(
      <OpportunityList
        items={[]}
        pagination={null}
        onPageChange={jest.fn()}
        loading={false}
      />
    );

    expect(screen.getByText('No opportunities found.')).toBeInTheDocument();
  });

  it('renders Pagination when pagination provided', () => {
    renderWithProviders(
      <OpportunityList
        items={mockItems}
        pagination={mockPagination}
        onPageChange={jest.fn()}
        loading={false}
      />
    );

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('does not render Pagination when pagination has 1 page', () => {
    renderWithProviders(
      <OpportunityList
        items={mockItems}
        pagination={{ page: 1, pages: 1, total: 2 }}
        onPageChange={jest.fn()}
        loading={false}
      />
    );

    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });
});
