import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import feedbackService from '../../services/feedbackService';

export const fetchFeedback = createAsyncThunk(
  'feedback/fetchFeedback',
  async ({ page = 1, limit = 20, type, status } = {}, { rejectWithValue }) => {
    try {
      const response = await feedbackService.list({ page, limit, type, status });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch feedback'
      );
    }
  }
);

export const fetchFeedbackStats = createAsyncThunk(
  'feedback/fetchFeedbackStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await feedbackService.getStats();
      return response.data.data.stats;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch feedback stats'
      );
    }
  }
);

export const createFeedback = createAsyncThunk(
  'feedback/createFeedback',
  async (data, { rejectWithValue }) => {
    try {
      const response = await feedbackService.create(data);
      return response.data.data.feedback;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create feedback'
      );
    }
  }
);

export const deleteFeedback = createAsyncThunk(
  'feedback/deleteFeedback',
  async (id, { rejectWithValue }) => {
    try {
      await feedbackService.delete(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete feedback'
      );
    }
  }
);

const feedbackSlice = createSlice({
  name: 'feedback',
  initialState: {
    items: [],
    stats: null,
    pagination: null,
    loading: false,
    error: null,
    createSuccess: false,
  },
  reducers: {
    clearFeedbackError: (state) => {
      state.error = null;
    },
    clearCreateSuccess: (state) => {
      state.createSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchFeedback
      .addCase(fetchFeedback.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFeedback.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.feedback;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchFeedback.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchFeedbackStats
      .addCase(fetchFeedbackStats.pending, (state) => {
        state.error = null;
      })
      .addCase(fetchFeedbackStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      })
      .addCase(fetchFeedbackStats.rejected, (state, action) => {
        state.error = action.payload;
      })
      // createFeedback
      .addCase(createFeedback.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createSuccess = false;
      })
      .addCase(createFeedback.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.createSuccess = true;
      })
      .addCase(createFeedback.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // deleteFeedback
      .addCase(deleteFeedback.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i.id !== action.payload);
      });
  },
});

export const { clearFeedbackError, clearCreateSuccess } = feedbackSlice.actions;
export default feedbackSlice.reducer;
