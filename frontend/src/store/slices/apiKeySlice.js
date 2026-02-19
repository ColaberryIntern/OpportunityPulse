import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiKeyService from '../../services/apiKeyService';

export const fetchApiKeys = createAsyncThunk(
  'apiKeys/fetchApiKeys',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiKeyService.list();
      return response.data.data.apiKeys;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch API keys'
      );
    }
  }
);

export const createApiKey = createAsyncThunk(
  'apiKeys/createApiKey',
  async ({ name, scopes }, { rejectWithValue }) => {
    try {
      const response = await apiKeyService.create({ name, scopes });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create API key'
      );
    }
  }
);

export const revokeApiKey = createAsyncThunk(
  'apiKeys/revokeApiKey',
  async (id, { rejectWithValue }) => {
    try {
      await apiKeyService.revoke(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to revoke API key'
      );
    }
  }
);

export const updateApiKey = createAsyncThunk(
  'apiKeys/updateApiKey',
  async ({ id, name, scopes }, { rejectWithValue }) => {
    try {
      const response = await apiKeyService.update(id, { name, scopes });
      return response.data.data.apiKey;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update API key'
      );
    }
  }
);

const apiKeySlice = createSlice({
  name: 'apiKeys',
  initialState: {
    items: [],
    loading: false,
    error: null,
    newKey: null, // Holds the plaintext key after creation (shown once)
  },
  reducers: {
    clearApiKeyError: (state) => {
      state.error = null;
    },
    clearNewKey: (state) => {
      state.newKey = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchApiKeys
      .addCase(fetchApiKeys.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchApiKeys.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchApiKeys.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // createApiKey
      .addCase(createApiKey.pending, (state) => {
        state.error = null;
      })
      .addCase(createApiKey.fulfilled, (state, action) => {
        state.newKey = action.payload.apiKey;
        state.items.unshift(action.payload.record);
      })
      .addCase(createApiKey.rejected, (state, action) => {
        state.error = action.payload;
      })
      // revokeApiKey
      .addCase(revokeApiKey.fulfilled, (state, action) => {
        const key = state.items.find((k) => k.id === action.payload);
        if (key) {
          key.isActive = false;
        }
      })
      .addCase(revokeApiKey.rejected, (state, action) => {
        state.error = action.payload;
      })
      // updateApiKey
      .addCase(updateApiKey.fulfilled, (state, action) => {
        const idx = state.items.findIndex((k) => k.id === action.payload.id);
        if (idx !== -1) {
          state.items[idx] = { ...state.items[idx], ...action.payload };
        }
      })
      .addCase(updateApiKey.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const { clearApiKeyError, clearNewKey } = apiKeySlice.actions;
export default apiKeySlice.reducer;
