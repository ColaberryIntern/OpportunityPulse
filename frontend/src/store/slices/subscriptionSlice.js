import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import subscriptionService from '../../services/subscriptionService';

export const fetchSubscription = createAsyncThunk(
  'subscription/fetchSubscription',
  async (_, { rejectWithValue }) => {
    try {
      const response = await subscriptionService.getCurrentSubscription();
      return response.data.data.subscription;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch subscription'
      );
    }
  }
);

export const upgradeSubscription = createAsyncThunk(
  'subscription/upgradeSubscription',
  async (_, { rejectWithValue }) => {
    try {
      const response = await subscriptionService.upgrade();
      return response.data.data.subscription;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to upgrade subscription'
      );
    }
  }
);

export const downgradeSubscription = createAsyncThunk(
  'subscription/downgradeSubscription',
  async (_, { rejectWithValue }) => {
    try {
      const response = await subscriptionService.downgrade();
      return response.data.data.subscription;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to downgrade subscription'
      );
    }
  }
);

export const fetchHistory = createAsyncThunk(
  'subscription/fetchHistory',
  async (_, { rejectWithValue }) => {
    try {
      const response = await subscriptionService.getHistory();
      return response.data.data.history;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch subscription history'
      );
    }
  }
);

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState: {
    subscription: null,
    history: [],
    loading: false,
    error: null,
    upgradeSuccess: false,
  },
  reducers: {
    clearSubscriptionError: (state) => {
      state.error = null;
    },
    clearUpgradeSuccess: (state) => {
      state.upgradeSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchSubscription
      .addCase(fetchSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.subscription = action.payload;
      })
      .addCase(fetchSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // upgradeSubscription
      .addCase(upgradeSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.upgradeSuccess = false;
      })
      .addCase(upgradeSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.subscription = action.payload;
        state.upgradeSuccess = true;
      })
      .addCase(upgradeSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // downgradeSubscription
      .addCase(downgradeSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(downgradeSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.subscription = action.payload;
      })
      .addCase(downgradeSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchHistory
      .addCase(fetchHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.history = action.payload;
      })
      .addCase(fetchHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearSubscriptionError, clearUpgradeSuccess } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;
