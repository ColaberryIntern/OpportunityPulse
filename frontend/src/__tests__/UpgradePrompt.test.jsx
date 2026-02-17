import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UpgradePrompt from '../components/common/UpgradePrompt';
import { renderWithProviders } from './testUtils';

describe('UpgradePrompt', () => {
  it('renders nothing when upgradeRequired is false', () => {
    const { container } = renderWithProviders(<UpgradePrompt />, {
      preloadedState: {
        ui: { upgradeRequired: false, upgradeMessage: '' },
      },
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders banner with message when upgradeRequired is true', () => {
    renderWithProviders(<UpgradePrompt />, {
      preloadedState: {
        ui: {
          upgradeRequired: true,
          upgradeMessage: 'Please upgrade your plan.',
        },
      },
    });

    expect(screen.getByText('Please upgrade your plan.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Upgrade to Premium for AI scores, trend analysis, and advanced insights.'
      )
    ).toBeInTheDocument();
  });

  it('dismiss button dispatches dismissUpgradePrompt', async () => {
    const user = userEvent.setup();

    const { store } = renderWithProviders(<UpgradePrompt />, {
      preloadedState: {
        ui: {
          upgradeRequired: true,
          upgradeMessage: 'Upgrade needed.',
        },
      },
    });

    const dismissButton = screen.getByText('Dismiss');
    await user.click(dismissButton);

    // After dispatching dismissUpgradePrompt the ui state should reset
    const uiState = store.getState().ui;
    expect(uiState.upgradeRequired).toBe(false);
    expect(uiState.upgradeMessage).toBe('');
  });

  it('shows "Upgrade" button', () => {
    renderWithProviders(<UpgradePrompt />, {
      preloadedState: {
        ui: {
          upgradeRequired: true,
          upgradeMessage: 'Premium features available.',
        },
      },
    });

    expect(screen.getByText('Upgrade')).toBeInTheDocument();
  });
});
