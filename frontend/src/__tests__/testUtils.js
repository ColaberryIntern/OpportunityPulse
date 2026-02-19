import React from 'react';
import { render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import authReducer from '../store/slices/authSlice';
import roleReducer from '../store/slices/roleSlice';
import dashboardReducer from '../store/slices/dashboardSlice';
import contentReducer from '../store/slices/contentSlice';
import searchReducer from '../store/slices/searchSlice';
import opportunityReducer from '../store/slices/opportunitySlice';
import alertReducer from '../store/slices/alertSlice';
import alertPrefReducer from '../store/slices/alertPrefSlice';
import uiReducer from '../store/slices/uiSlice';

export function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      roles: roleReducer,
      dashboard: dashboardReducer,
      content: contentReducer,
      search: searchReducer,
      opportunities: opportunityReducer,
      alerts: alertReducer,
      alertPreferences: alertPrefReducer,
      ui: uiReducer,
    },
    preloadedState,
  });
}

export function renderWithProviders(
  ui,
  { preloadedState = {}, store = createTestStore(preloadedState), ...renderOptions } = {}
) {
  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <HelmetProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </HelmetProvider>
      </Provider>
    );
  }

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

// Placeholder test to prevent Jest from failing on this utility file
test('testUtils exports helpers', () => {
  expect(typeof createTestStore).toBe('function');
  expect(typeof renderWithProviders).toBe('function');
});
