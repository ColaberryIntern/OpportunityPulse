import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import alertService from '../../services/alertService';

export const fetchAlerts = createAsyncThunk(
  'alerts/fetchAlerts',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await alertService.list(params);
      return {
        alerts: response.data.data,
        pagination: response.data.pagination,
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch alerts'
      );
    }
  }
);

export const fetchUnreadCount = createAsyncThunk(
  'alerts/fetchUnreadCount',
  async (_, { rejectWithValue }) => {
    try {
      const response = await alertService.getUnreadCount();
      return response.data.data.unreadCount;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch unread count'
      );
    }
  }
);

export const markAlertAsRead = createAsyncThunk(
  'alerts/markAlertAsRead',
  async (id, { rejectWithValue }) => {
    try {
      await alertService.markAsRead(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to mark alert as read'
      );
    }
  }
);

export const markAllAlertsAsRead = createAsyncThunk(
  'alerts/markAllAlertsAsRead',
  async (_, { rejectWithValue }) => {
    try {
      await alertService.markAllAsRead();
      return true;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to mark all alerts as read'
      );
    }
  }
);

export const deleteAlert = createAsyncThunk(
  'alerts/deleteAlert',
  async (id, { rejectWithValue }) => {
    try {
      await alertService.delete(id);
      return id;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to delete alert'
      );
    }
  }
);

const alertSlice = createSlice({
  name: 'alerts',
  initialState: {
    items: [],
    unreadCount: 0,
    pagination: null,
    loading: false,
    error: null,
  },
  reducers: {
    clearAlertError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchAlerts
      .addCase(fetchAlerts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.alerts;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchUnreadCount
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = action.payload;
      })
      // markAlertAsRead
      .addCase(markAlertAsRead.fulfilled, (state, action) => {
        const alert = state.items.find((a) => a.id === action.payload);
        if (alert && !alert.read) {
          alert.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      // markAllAlertsAsRead
      .addCase(markAllAlertsAsRead.fulfilled, (state) => {
        state.items.forEach((a) => { a.read = true; });
        state.unreadCount = 0;
      })
      // deleteAlert
      .addCase(deleteAlert.fulfilled, (state, action) => {
        const deleted = state.items.find((a) => a.id === action.payload);
        if (deleted && !deleted.read) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
        state.items = state.items.filter((a) => a.id !== action.payload);
      });
  },
});

export const { clearAlertError } = alertSlice.actions;
export default alertSlice.reducer;
