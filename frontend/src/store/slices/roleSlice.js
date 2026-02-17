import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import roleService from '../../services/roleService';

export const fetchRoles = createAsyncThunk(
  'roles/fetchRoles',
  async (_, { rejectWithValue }) => {
    try {
      const response = await roleService.getRoles();
      return response.data.data.roles;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch roles'
      );
    }
  }
);

export const assignRole = createAsyncThunk(
  'roles/assignRole',
  async ({ userId, roleId }, { rejectWithValue }) => {
    try {
      const response = await roleService.assignRole({ userId, roleId });
      return response.data.data.user;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to assign role'
      );
    }
  }
);

export const updateRole = createAsyncThunk(
  'roles/updateRole',
  async ({ id, description }, { rejectWithValue }) => {
    try {
      const response = await roleService.updateRole(id, { description });
      return response.data.data.role;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to update role'
      );
    }
  }
);

const roleSlice = createSlice({
  name: 'roles',
  initialState: {
    roles: [],
    loading: false,
    error: null,
    assignSuccess: false,
  },
  reducers: {
    clearRoleError: (state) => {
      state.error = null;
    },
    clearAssignSuccess: (state) => {
      state.assignSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchRoles
      .addCase(fetchRoles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.loading = false;
        state.roles = action.payload;
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // assignRole
      .addCase(assignRole.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.assignSuccess = false;
      })
      .addCase(assignRole.fulfilled, (state) => {
        state.loading = false;
        state.assignSuccess = true;
      })
      .addCase(assignRole.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // updateRole
      .addCase(updateRole.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateRole.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.roles.findIndex((r) => r.id === action.payload.id);
        if (index !== -1) {
          state.roles[index] = action.payload;
        }
      })
      .addCase(updateRole.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearRoleError, clearAssignSuccess } = roleSlice.actions;
export default roleSlice.reducer;
