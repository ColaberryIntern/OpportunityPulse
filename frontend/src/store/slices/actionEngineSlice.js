import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import actionEngineService from '../../services/actionEngineService';

export const fetchExecutiveBrief = createAsyncThunk(
  'actionEngine/fetchExecutiveBrief',
  async (_, { rejectWithValue }) => {
    try {
      const response = await actionEngineService.getExecutiveBrief();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch executive brief');
    }
  }
);

export const fetchActions = createAsyncThunk(
  'actionEngine/fetchActions',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await actionEngineService.listActions(params);
      return {
        actions: response.data.data,
        pagination: response.data.pagination,
      };
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch actions');
    }
  }
);

export const fetchAnalytics = createAsyncThunk(
  'actionEngine/fetchAnalytics',
  async (_, { rejectWithValue }) => {
    try {
      const response = await actionEngineService.getAnalytics();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch analytics');
    }
  }
);

export const createAction = createAsyncThunk(
  'actionEngine/createAction',
  async ({ opportunityId, actionType, notes }, { rejectWithValue }) => {
    try {
      const response = await actionEngineService.createAction({ opportunityId, actionType, notes });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create action');
    }
  }
);

export const updateAction = createAsyncThunk(
  'actionEngine/updateAction',
  async ({ id, status, revenueGenerated, notes }, { rejectWithValue }) => {
    try {
      const response = await actionEngineService.updateAction(id, { status, revenueGenerated, notes });
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update action');
    }
  }
);

export const deleteActionThunk = createAsyncThunk(
  'actionEngine/deleteAction',
  async (id, { rejectWithValue }) => {
    try {
      await actionEngineService.deleteAction(id);
      return id;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete action');
    }
  }
);

const actionEngineSlice = createSlice({
  name: 'actionEngine',
  initialState: {
    executiveBrief: null,
    briefLoading: false,
    actions: [],
    actionsPagination: null,
    actionsLoading: false,
    analytics: null,
    analyticsLoading: false,
    error: null,
  },
  reducers: {
    clearActionEngineError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Executive Brief
      .addCase(fetchExecutiveBrief.pending, (state) => {
        state.briefLoading = true;
        state.error = null;
      })
      .addCase(fetchExecutiveBrief.fulfilled, (state, action) => {
        state.briefLoading = false;
        state.executiveBrief = action.payload;
      })
      .addCase(fetchExecutiveBrief.rejected, (state, action) => {
        state.briefLoading = false;
        state.error = action.payload;
      })
      // Actions
      .addCase(fetchActions.pending, (state) => {
        state.actionsLoading = true;
      })
      .addCase(fetchActions.fulfilled, (state, action) => {
        state.actionsLoading = false;
        state.actions = action.payload.actions;
        state.actionsPagination = action.payload.pagination;
      })
      .addCase(fetchActions.rejected, (state, action) => {
        state.actionsLoading = false;
        state.error = action.payload;
      })
      // Analytics
      .addCase(fetchAnalytics.pending, (state) => {
        state.analyticsLoading = true;
      })
      .addCase(fetchAnalytics.fulfilled, (state, action) => {
        state.analyticsLoading = false;
        state.analytics = action.payload;
      })
      .addCase(fetchAnalytics.rejected, (state, action) => {
        state.analyticsLoading = false;
        state.error = action.payload;
      })
      // Create action
      .addCase(createAction.fulfilled, (state, action) => {
        state.actions.unshift(action.payload);
      })
      // Update action
      .addCase(updateAction.fulfilled, (state, action) => {
        const idx = state.actions.findIndex((a) => a.id === action.payload.id);
        if (idx !== -1) state.actions[idx] = action.payload;
      })
      // Delete action
      .addCase(deleteActionThunk.fulfilled, (state, action) => {
        state.actions = state.actions.filter((a) => a.id !== action.payload);
      });
  },
});

export const { clearActionEngineError } = actionEngineSlice.actions;
export default actionEngineSlice.reducer;
