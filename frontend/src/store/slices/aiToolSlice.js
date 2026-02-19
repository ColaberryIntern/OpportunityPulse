import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import aiToolService from '../../services/aiToolService';

export const fetchAiTools = createAsyncThunk('aiTools/fetchAiTools', async (params) => {
  const response = await aiToolService.list(params);
  return response.data;
});

export const fetchTrending = createAsyncThunk('aiTools/fetchTrending', async (params) => {
  const response = await aiToolService.getTrending(params);
  return response.data;
});

export const fetchAiToolBySlug = createAsyncThunk('aiTools/fetchAiToolBySlug', async (slug) => {
  const response = await aiToolService.getBySlug(slug);
  return response.data;
});

export const fetchAiToolMentions = createAsyncThunk(
  'aiTools/fetchAiToolMentions',
  async ({ slug, page, limit }) => {
    const response = await aiToolService.getMentions(slug, { page, limit });
    return response.data;
  }
);

export const fetchAiToolStats = createAsyncThunk('aiTools/fetchAiToolStats', async () => {
  const response = await aiToolService.getStats();
  return response.data;
});

const aiToolSlice = createSlice({
  name: 'aiTools',
  initialState: {
    tools: [],
    trending: [],
    currentTool: null,
    mentions: [],
    stats: null,
    filters: { category: '', industry: '', q: '', sort: 'trending' },
    pagination: null,
    mentionsPagination: null,
    loading: false,
    trendingLoading: false,
    detailLoading: false,
    error: null,
  },
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearCurrentTool(state) {
      state.currentTool = null;
      state.mentions = [];
      state.mentionsPagination = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchAiTools
      .addCase(fetchAiTools.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAiTools.fulfilled, (state, action) => {
        state.loading = false;
        state.tools = action.payload.data?.tools || [];
        state.pagination = action.payload.pagination || null;
      })
      .addCase(fetchAiTools.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch AI tools';
      })
      // fetchTrending
      .addCase(fetchTrending.pending, (state) => {
        state.trendingLoading = true;
        state.error = null;
      })
      .addCase(fetchTrending.fulfilled, (state, action) => {
        state.trendingLoading = false;
        state.trending = action.payload.data?.tools || [];
      })
      .addCase(fetchTrending.rejected, (state, action) => {
        state.trendingLoading = false;
        state.error = action.error.message || 'Failed to fetch trending tools';
      })
      // fetchAiToolBySlug
      .addCase(fetchAiToolBySlug.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchAiToolBySlug.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.currentTool = action.payload.data?.tool || null;
      })
      .addCase(fetchAiToolBySlug.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.error.message || 'Failed to fetch tool details';
      })
      // fetchAiToolMentions
      .addCase(fetchAiToolMentions.pending, (state) => {
        state.error = null;
      })
      .addCase(fetchAiToolMentions.fulfilled, (state, action) => {
        state.mentions = action.payload.data?.mentions || [];
        state.mentionsPagination = action.payload.pagination || null;
      })
      .addCase(fetchAiToolMentions.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch mentions';
      })
      // fetchAiToolStats
      .addCase(fetchAiToolStats.pending, (state) => {
        state.error = null;
      })
      .addCase(fetchAiToolStats.fulfilled, (state, action) => {
        state.stats = action.payload.data || null;
      })
      .addCase(fetchAiToolStats.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch stats';
      });
  },
});

export const { setFilters, clearCurrentTool } = aiToolSlice.actions;
export default aiToolSlice.reducer;
