import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import webhookService from '../../services/webhookService';

export const fetchWebhooks = createAsyncThunk(
  'webhooks/fetchWebhooks',
  async (_, { rejectWithValue }) => {
    try {
      const response = await webhookService.list();
      return response.data.data.webhooks;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch webhooks'
      );
    }
  }
);

export const createWebhook = createAsyncThunk(
  'webhooks/createWebhook',
  async ({ url, eventTypes, description }, { rejectWithValue }) => {
    try {
      const response = await webhookService.create({ url, eventTypes, description });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to create webhook'
      );
    }
  }
);

export const updateWebhook = createAsyncThunk(
  'webhooks/updateWebhook',
  async ({ id, ...data }, { rejectWithValue }) => {
    try {
      const response = await webhookService.update(id, data);
      return response.data.data.webhook;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update webhook'
      );
    }
  }
);

export const deleteWebhook = createAsyncThunk(
  'webhooks/deleteWebhook',
  async (id, { rejectWithValue }) => {
    try {
      await webhookService.remove(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete webhook'
      );
    }
  }
);

export const testWebhook = createAsyncThunk(
  'webhooks/testWebhook',
  async (id, { rejectWithValue }) => {
    try {
      const response = await webhookService.test(id);
      return response.data.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to test webhook'
      );
    }
  }
);

export const fetchDeliveryLog = createAsyncThunk(
  'webhooks/fetchDeliveryLog',
  async ({ webhookId, page, limit }, { rejectWithValue }) => {
    try {
      const response = await webhookService.deliveries(webhookId, { page, limit });
      return {
        deliveries: response.data.data.deliveries,
        pagination: response.data.pagination,
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch delivery log'
      );
    }
  }
);

const webhookSlice = createSlice({
  name: 'webhooks',
  initialState: {
    items: [],
    loading: false,
    error: null,
    newSecret: null, // Holds the secret after creation (shown once)
    testResult: null,
    deliveries: [],
    deliveryPagination: null,
    deliveryLoading: false,
  },
  reducers: {
    clearWebhookError: (state) => {
      state.error = null;
    },
    clearNewSecret: (state) => {
      state.newSecret = null;
    },
    clearTestResult: (state) => {
      state.testResult = null;
    },
    clearDeliveries: (state) => {
      state.deliveries = [];
      state.deliveryPagination = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchWebhooks
      .addCase(fetchWebhooks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWebhooks.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchWebhooks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // createWebhook
      .addCase(createWebhook.pending, (state) => {
        state.error = null;
      })
      .addCase(createWebhook.fulfilled, (state, action) => {
        state.newSecret = action.payload.secret;
        state.items.unshift(action.payload.webhook);
      })
      .addCase(createWebhook.rejected, (state, action) => {
        state.error = action.payload;
      })
      // updateWebhook
      .addCase(updateWebhook.fulfilled, (state, action) => {
        const idx = state.items.findIndex((w) => w.id === action.payload.id);
        if (idx !== -1) {
          state.items[idx] = { ...state.items[idx], ...action.payload };
        }
      })
      .addCase(updateWebhook.rejected, (state, action) => {
        state.error = action.payload;
      })
      // deleteWebhook
      .addCase(deleteWebhook.fulfilled, (state, action) => {
        state.items = state.items.filter((w) => w.id !== action.payload);
      })
      .addCase(deleteWebhook.rejected, (state, action) => {
        state.error = action.payload;
      })
      // testWebhook
      .addCase(testWebhook.pending, (state) => {
        state.testResult = null;
      })
      .addCase(testWebhook.fulfilled, (state, action) => {
        state.testResult = action.payload;
      })
      .addCase(testWebhook.rejected, (state, action) => {
        state.testResult = { success: false, error: action.payload };
      })
      // fetchDeliveryLog
      .addCase(fetchDeliveryLog.pending, (state) => {
        state.deliveryLoading = true;
      })
      .addCase(fetchDeliveryLog.fulfilled, (state, action) => {
        state.deliveryLoading = false;
        state.deliveries = action.payload.deliveries;
        state.deliveryPagination = action.payload.pagination;
      })
      .addCase(fetchDeliveryLog.rejected, (state, action) => {
        state.deliveryLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearWebhookError, clearNewSecret, clearTestResult, clearDeliveries } =
  webhookSlice.actions;
export default webhookSlice.reducer;
