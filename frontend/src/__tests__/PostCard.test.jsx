import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import PostCard from '../components/forums/PostCard';

const mockPost = {
  id: 42,
  title: 'How to find government contracts',
  category: 'gov_contracts',
  status: 'open',
  author: { name: 'Jane Doe' },
  createdAt: '2026-02-10T12:00:00Z',
  commentCount: 7,
  viewCount: 125,
};

function renderPostCard(post = mockPost) {
  return render(
    <BrowserRouter>
      <PostCard post={post} />
    </BrowserRouter>
  );
}

describe('PostCard', () => {
  it('renders post title', () => {
    renderPostCard();
    expect(screen.getByText('How to find government contracts')).toBeInTheDocument();
  });

  it('renders category badge', () => {
    renderPostCard();
    // category 'gov_contracts' is displayed with underscores replaced by spaces
    expect(screen.getByText('gov contracts')).toBeInTheDocument();
  });

  it('renders author name', () => {
    renderPostCard();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders comment count', () => {
    renderPostCard();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('links to /forums/:id', () => {
    renderPostCard();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/forums/42');
  });
});
