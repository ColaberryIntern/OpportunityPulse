import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FeedbackForm from '../components/feedback/FeedbackForm';

describe('FeedbackForm', () => {
  it('renders star rating, type dropdown, comments textarea, and submit button', () => {
    render(<FeedbackForm onSubmit={jest.fn()} loading={false} />);

    // Star rating label
    expect(screen.getByText('Rating')).toBeInTheDocument();

    // Five star buttons (with aria-labels from accessibility)
    const starButtons = [1, 2, 3, 4, 5].map((n) =>
      screen.getByRole('button', { name: `${n} star${n > 1 ? 's' : ''}` })
    );
    expect(starButtons).toHaveLength(5);

    // Type dropdown
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Platform')).toBeInTheDocument();

    // Comments textarea
    expect(screen.getByPlaceholderText('Share your feedback...')).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeInTheDocument();
  });

  it('clicking stars updates rating visually', () => {
    render(<FeedbackForm onSubmit={jest.fn()} loading={false} />);

    // Get all SVG elements (the stars)
    const svgs = document.querySelectorAll('svg');
    // The first 5 SVGs are the star icons
    const stars = Array.from(svgs).slice(0, 5);

    // Initially all stars should be gray (unselected)
    stars.forEach((star) => {
      expect(star).toHaveClass('text-gray-300');
    });

    // Click the 4th star (index 3)
    const starButtons = screen.getAllByRole('button');
    fireEvent.click(starButtons[3]);

    // After clicking 4th star, first 4 should be yellow, 5th gray
    const updatedSvgs = Array.from(document.querySelectorAll('svg')).slice(0, 5);
    updatedSvgs.forEach((star, index) => {
      if (index < 4) {
        expect(star).toHaveClass('text-yellow-400');
      } else {
        expect(star).toHaveClass('text-gray-300');
      }
    });
  });

  it('submitting form calls onSubmit with correct data', () => {
    const handleSubmit = jest.fn();
    render(<FeedbackForm onSubmit={handleSubmit} loading={false} />);

    // Click the 5th star (rating = 5)
    const starButtons = screen.getAllByRole('button');
    fireEvent.click(starButtons[4]);

    // Change type to 'opportunity'
    const select = screen.getByDisplayValue('Platform');
    fireEvent.change(select, { target: { value: 'opportunity' } });

    // Enter comments
    const textarea = screen.getByPlaceholderText('Share your feedback...');
    fireEvent.change(textarea, { target: { value: 'Great platform!' } });

    // Submit the form
    const submitButton = screen.getByRole('button', { name: 'Submit Feedback' });
    fireEvent.click(submitButton);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith({
      score: 5,
      comments: 'Great platform!',
      type: 'opportunity',
    });
  });

  it('submit button shows loading text when loading is true', () => {
    render(<FeedbackForm onSubmit={jest.fn()} loading={true} />);

    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit Feedback' })).not.toBeInTheDocument();
  });
});
