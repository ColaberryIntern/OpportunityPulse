import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Pagination from '../components/common/Pagination';

describe('Pagination', () => {
  it('renders Previous and Next buttons', () => {
    render(
      <Pagination
        pagination={{ page: 2, pages: 5, total: 50 }}
        onPageChange={jest.fn()}
      />
    );

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    render(
      <Pagination
        pagination={{ page: 1, pages: 5, total: 50 }}
        onPageChange={jest.fn()}
      />
    );

    expect(screen.getByText('Previous')).toBeDisabled();
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(
      <Pagination
        pagination={{ page: 5, pages: 5, total: 50 }}
        onPageChange={jest.fn()}
      />
    );

    expect(screen.getByText('Previous')).not.toBeDisabled();
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('calls onPageChange with correct page number', async () => {
    const onPageChange = jest.fn();
    const user = userEvent.setup();

    render(
      <Pagination
        pagination={{ page: 3, pages: 5, total: 50 }}
        onPageChange={onPageChange}
      />
    );

    await user.click(screen.getByText('Previous'));
    expect(onPageChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('returns null when pages <= 1', () => {
    const { container } = render(
      <Pagination
        pagination={{ page: 1, pages: 1, total: 5 }}
        onPageChange={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('returns null when pagination is null', () => {
    const { container } = render(
      <Pagination pagination={null} onPageChange={jest.fn()} />
    );

    expect(container.firstChild).toBeNull();
  });
});
