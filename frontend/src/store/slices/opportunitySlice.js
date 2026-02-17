import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import opportunityService from '../../services/opportunityService';

export const fetchOpportunities = createAsyncThunk(
  'opportunities/fetchOpportunities',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await opportunityService.list(params);
      return {
        results: response.data.data.results,
        filters: response.data.data.filters,
        pagination: response.data.pagination,
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch opportunities'
      );
    }
  }
);

export const fetchOpportunityById = createAsyncThunk(
  'opportunities/fetchOpportunityById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await opportunityService.getById(id);
      return response.data.data.opportunity;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch opportunity'
      );
    }
  }
);

export const fetchOpportunityStats = createAsyncThunk(
  'opportunities/fetchOpportunityStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await opportunityService.getStats();
      return response.data.data.stats;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch opportunity stats'
      );
    }
  }
);

const opportunitySlice = createSlice({
  name: 'opportunities',
  initialState: {
    items: [],
    currentItem: null,
    stats: null,
    filters: {},
    pagination: null,
    loading: false,
    detailLoading: false,
    error: null,
  },
  reducers: {
    clearOpportunityError: (state) => {
      state.error = null;
    },
    clearCurrentOpportunity: (state) => {
      state.currentItem = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchOpportunities
      .addCase(fetchOpportunities.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOpportunities.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.results;
        state.filters = action.payload.filters;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchOpportunities.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchOpportunityById
      .addCase(fetchOpportunityById.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchOpportunityById.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.currentItem = action.payload;
      })
      .addCase(fetchOpportunityById.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.payload;
      })
      // fetchOpportunityStats
      .addCase(fetchOpportunityStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      });
  },
});

export const { clearOpportunityError, clearCurrentOpportunity } = opportunitySlice.actions;
export default opportunitySlice.reducer;
