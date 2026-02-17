import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import dashboardService from '../../services/dashboardService';

export const fetchStats = createAsyncThunk(
  'dashboard/fetchStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await dashboardService.getStats();
      return response.data.data.stats;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch stats'
      );
    }
  }
);

export const fetchActivity = createAsyncThunk(
  'dashboard/fetchActivity',
  async ({ page = 1, limit = 20 } = {}, { rejectWithValue }) => {
    try {
      const response = await dashboardService.getActivity({ page, limit });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch activity'
      );
    }
  }
);

export const fetchOpportunityDashboardStats = createAsyncThunk(
  'dashboard/fetchOpportunityDashboardStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await dashboardService.getOpportunityStats();
      return response.data.data.stats;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch opportunity stats'
      );
    }
  }
);

export const fetchChartData = createAsyncThunk(
  'dashboard/fetchChartData',
  async ({ type, period } = {}, { rejectWithValue }) => {
    try {
      const response = await dashboardService.getChartData({ type, period });
      return response.data.data.chartData;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch chart data'
      );
    }
  }
);

export const fetchTrendSummary = createAsyncThunk(
  'dashboard/fetchTrendSummary',
  async (_, { rejectWithValue }) => {
    try {
      const response = await dashboardService.getTrendSummary();
      return response.data.data.trends;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch trend summary'
      );
    }
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    stats: null,
    activities: [],
    pagination: null,
    loading: false,
    error: null,
    opportunityStats: null,
    chartData: null,
    trends: null,
    chartLoading: false,
  },
  reducers: {
    clearDashboardError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload;
      })
      .addCase(fetchStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchActivity.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.loading = false;
        state.activities = action.payload.activities;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchActivity.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Opportunity dashboard stats
      .addCase(fetchOpportunityDashboardStats.fulfilled, (state, action) => {
        state.opportunityStats = action.payload;
      })
      // Chart data (premium)
      .addCase(fetchChartData.pending, (state) => {
        state.chartLoading = true;
      })
      .addCase(fetchChartData.fulfilled, (state, action) => {
        state.chartLoading = false;
        state.chartData = action.payload;
      })
      .addCase(fetchChartData.rejected, (state) => {
        state.chartLoading = false;
        state.chartData = null;
      })
      // Trend summary
      .addCase(fetchTrendSummary.fulfilled, (state, action) => {
        state.trends = action.payload;
      });
  },
});

export const { clearDashboardError } = dashboardSlice.actions;
export default dashboardSlice.reducer;
