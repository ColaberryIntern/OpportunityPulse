import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import freelanceService from '../../services/freelanceService';

export const fetchFreelanceOpportunities = createAsyncThunk(
  'freelance/fetchOpportunities',
  async (params, { rejectWithValue }) => {
    try {
      const response = await freelanceService.getOpportunities(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch freelance opportunities');
    }
  }
);

export const fetchFreelanceTrends = createAsyncThunk(
  'freelance/fetchTrends',
  async (params, { rejectWithValue }) => {
    try {
      const response = await freelanceService.getTrends(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch trends');
    }
  }
);

export const fetchSkillTrend = createAsyncThunk(
  'freelance/fetchSkillTrend',
  async ({ skill, days }, { rejectWithValue }) => {
    try {
      const response = await freelanceService.getSkillTrend(skill, { days });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch skill trend');
    }
  }
);

export const generateFreelanceAction = createAsyncThunk(
  'freelance/generateAction',
  async ({ id, actionType }, { rejectWithValue }) => {
    try {
      const response = await freelanceService.generateAction(id, actionType);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to generate action');
    }
  }
);

const freelanceSlice = createSlice({
  name: 'freelance',
  initialState: {
    opportunities: [],
    pagination: null,
    loading: false,
    error: null,
    trends: null,
    trendsLoading: false,
    skillTrend: null,
    skillTrendLoading: false,
    selectedOpportunity: null,
    generatedAction: null,
    actionLoading: false,
    filters: { sort: 'score', skills: '', minBudget: '', platform: '' },
  },
  reducers: {
    setFreelanceFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearGeneratedAction(state) {
      state.generatedAction = null;
    },
    setSelectedOpportunity(state, action) {
      state.selectedOpportunity = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchFreelanceOpportunities
      .addCase(fetchFreelanceOpportunities.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFreelanceOpportunities.fulfilled, (state, action) => {
        state.loading = false;
        state.opportunities = action.payload.opportunities || [];
        state.pagination = action.payload.pagination || null;
      })
      .addCase(fetchFreelanceOpportunities.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchFreelanceTrends
      .addCase(fetchFreelanceTrends.pending, (state) => {
        state.trendsLoading = true;
      })
      .addCase(fetchFreelanceTrends.fulfilled, (state, action) => {
        state.trendsLoading = false;
        state.trends = action.payload;
      })
      .addCase(fetchFreelanceTrends.rejected, (state, action) => {
        state.trendsLoading = false;
        state.error = action.payload;
      })
      // fetchSkillTrend
      .addCase(fetchSkillTrend.pending, (state) => {
        state.skillTrendLoading = true;
        state.skillTrend = null;
      })
      .addCase(fetchSkillTrend.fulfilled, (state, action) => {
        state.skillTrendLoading = false;
        state.skillTrend = action.payload;
      })
      .addCase(fetchSkillTrend.rejected, (state) => {
        state.skillTrendLoading = false;
      })
      // generateFreelanceAction
      .addCase(generateFreelanceAction.pending, (state) => {
        state.actionLoading = true;
        state.generatedAction = null;
      })
      .addCase(generateFreelanceAction.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.generatedAction = action.payload;
      })
      .addCase(generateFreelanceAction.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });
  },
});

export const { setFreelanceFilters, clearGeneratedAction, setSelectedOpportunity } = freelanceSlice.actions;
export default freelanceSlice.reducer;
