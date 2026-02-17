import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    upgradeRequired: false,
    upgradeMessage: '',
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
  },
});

export const { showUpgradePrompt, dismissUpgradePrompt } = uiSlice.actions;
export default uiSlice.reducer;
