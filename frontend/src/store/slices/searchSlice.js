import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import searchService from '../../services/searchService';

export const performSearch = createAsyncThunk(
  'search/performSearch',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await searchService.search(params);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Search failed'
      );
    }
  }
);

const searchSlice = createSlice({
  name: 'search',
  initialState: {
    results: [],
    pagination: null,
    filters: {},
    loading: false,
    error: null,
  },
  reducers: {
    clearSearch: (state) => {
      state.results = [];
      state.pagination = null;
      state.filters = {};
      state.error = null;
    },
    clearSearchError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(performSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(performSearch.fulfilled, (state, action) => {
        state.loading = false;
        state.results = action.payload.results;
        state.pagination = action.payload.pagination;
        state.filters = action.payload.filters;
      })
      .addCase(performSearch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearSearch, clearSearchError } = searchSlice.actions;
export default searchSlice.reducer;
