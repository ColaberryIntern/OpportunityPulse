import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import alertPrefService from '../../services/alertPrefService';

export const fetchAlertPreferences = createAsyncThunk(
  'alertPreferences/fetchAlertPreferences',
  async (_, { rejectWithValue }) => {
    try {
      const response = await alertPrefService.getPreferences();
      return response.data.data.preferences;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch alert preferences'
      );
    }
  }
);

export const updateAlertPreferences = createAsyncThunk(
  'alertPreferences/updateAlertPreferences',
  async (data, { rejectWithValue }) => {
    try {
      const response = await alertPrefService.updatePreferences(data);
      return response.data.data.preferences;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update alert preferences'
      );
    }
  }
);

const alertPrefSlice = createSlice({
  name: 'alertPreferences',
  initialState: {
    preferences: null,
    loading: false,
    error: null,
    updateSuccess: false,
  },
  reducers: {
    clearAlertPrefError: (state) => {
      state.error = null;
    },
    clearUpdateSuccess: (state) => {
      state.updateSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchAlertPreferences
      .addCase(fetchAlertPreferences.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlertPreferences.fulfilled, (state, action) => {
        state.loading = false;
        state.preferences = action.payload;
      })
      .addCase(fetchAlertPreferences.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // updateAlertPreferences
      .addCase(updateAlertPreferences.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.updateSuccess = false;
      })
      .addCase(updateAlertPreferences.fulfilled, (state, action) => {
        state.loading = false;
        state.preferences = action.payload;
        state.updateSuccess = true;
      })
      .addCase(updateAlertPreferences.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearAlertPrefError, clearUpdateSuccess } = alertPrefSlice.actions;
export default alertPrefSlice.reducer;
