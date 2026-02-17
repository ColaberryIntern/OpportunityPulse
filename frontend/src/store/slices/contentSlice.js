import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import contentService from '../../services/contentService';

export const fetchContent = createAsyncThunk(
  'content/fetchContent',
  async ({ page = 1, limit = 20, status, category } = {}, { rejectWithValue }) => {
    try {
      const response = await contentService.list({ page, limit, status, category });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch content'
      );
    }
  }
);

export const fetchContentById = createAsyncThunk(
  'content/fetchContentById',
  async (id, { rejectWithValue }) => {
    try {
      const response = await contentService.getById(id);
      return response.data.data.content;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch content'
      );
    }
  }
);

export const createContent = createAsyncThunk(
  'content/createContent',
  async (data, { rejectWithValue }) => {
    try {
      const response = await contentService.create(data);
      return response.data.data.content;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create content'
      );
    }
  }
);

export const updateContent = createAsyncThunk(
  'content/updateContent',
  async ({ id, ...data }, { rejectWithValue }) => {
    try {
      const response = await contentService.update(id, data);
      return response.data.data.content;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update content'
      );
    }
  }
);

export const deleteContent = createAsyncThunk(
  'content/deleteContent',
  async (id, { rejectWithValue }) => {
    try {
      await contentService.delete(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete content'
      );
    }
  }
);

const contentSlice = createSlice({
  name: 'content',
  initialState: {
    items: [],
    currentItem: null,
    pagination: null,
    loading: false,
    error: null,
    createSuccess: false,
  },
  reducers: {
    clearContentError: (state) => {
      state.error = null;
    },
    clearCreateSuccess: (state) => {
      state.createSuccess = false;
    },
    clearCurrentItem: (state) => {
      state.currentItem = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchContent
      .addCase(fetchContent.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchContent.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.content;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchContent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchContentById
      .addCase(fetchContentById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchContentById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentItem = action.payload;
      })
      .addCase(fetchContentById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // createContent
      .addCase(createContent.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.createSuccess = false;
      })
      .addCase(createContent.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.createSuccess = true;
      })
      .addCase(createContent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // updateContent
      .addCase(updateContent.fulfilled, (state, action) => {
        const index = state.items.findIndex((i) => i.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.currentItem?.id === action.payload.id) {
          state.currentItem = action.payload;
        }
      })
      // deleteContent
      .addCase(deleteContent.fulfilled, (state, action) => {
        state.items = state.items.filter((i) => i.id !== action.payload);
        if (state.currentItem?.id === action.payload) {
          state.currentItem = null;
        }
      });
  },
});

export const { clearContentError, clearCreateSuccess, clearCurrentItem } = contentSlice.actions;
export default contentSlice.reducer;
