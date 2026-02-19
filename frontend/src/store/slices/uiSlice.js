import { createSlice } from '@reduxjs/toolkit';

const storedDarkMode = typeof window !== 'undefined'
  ? localStorage.getItem('darkMode') === 'true'
  : false;

// Apply dark class on initial load
if (storedDarkMode && typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    upgradeRequired: false,
    upgradeMessage: '',
    darkMode: storedDarkMode,
  },
  reducers: {
    showUpgradePrompt: (state, action) => {
      state.upgradeRequired = true;
      state.upgradeMessage = action.payload || 'Premium subscription required to access this feature.';
    },
    dismissUpgradePrompt: (state) => {
      state.upgradeRequired = false;
      state.upgradeMessage = '';
    },
    toggleDarkMode: (state) => {
      state.darkMode = !state.darkMode;
      if (typeof window !== 'undefined') {
        localStorage.setItem('darkMode', state.darkMode);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', state.darkMode);
      }
    },
  },
});

export const { showUpgradePrompt, dismissUpgradePrompt, toggleDarkMode } = uiSlice.actions;
export default uiSlice.reducer;
