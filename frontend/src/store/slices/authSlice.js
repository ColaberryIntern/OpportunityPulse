import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import authService from '../../services/authService';

export const registerUser = createAsyncThunk(
  'auth/register',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.register(credentials);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Registration failed' });
    }
  }
);

export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      const { accessToken, user: rawUser } = response.data.data;
      // Auth API returns role as a joined object {id, roleName, ...}; the
      // rest of the SPA checks `user.role === 'admin'` — normalize once
      // here so every page's role gate works uniformly.
      const user = {
        ...rawUser,
        role: typeof rawUser?.role === 'object' && rawUser.role
          ? rawUser.role.roleName || rawUser.role.name
          : rawUser?.role,
      };
      localStorage.setItem('token', accessToken);
      // Persist user blob too — without it, hard navigation after login
      // re-initializes the store with user=null, kicking the admin out of
      // role-gated pages until they re-fetch /auth/me.
      try { localStorage.setItem('user', JSON.stringify(user)); } catch { /* quota — ignore */ }
      return { accessToken, user };
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Login failed' });
    }
  }
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getProfile();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Failed to fetch user' });
    }
  }
);

export const updateUserProfile = createAsyncThunk(
  'auth/updateUserProfile',
  async (data, { rejectWithValue }) => {
    try {
      await authService.updateProfile(data);
      // Refresh user state from server
      const response = await authService.getProfile();
      return response.data.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Profile update failed' });
    }
  }
);

export const changeUserPassword = createAsyncThunk(
  'auth/changeUserPassword',
  async ({ currentPassword, newPassword }, { rejectWithValue }) => {
    try {
      const response = await authService.changePassword(currentPassword, newPassword);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || { message: 'Password change failed' });
    }
  }
);

function loadStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const initialState = {
  user: loadStoredUser(),
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,
  profileUpdateSuccess: false,
  passwordChangeSuccess: false,
  profileError: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
    clearError(state) {
      state.error = null;
    },
    clearProfileStatus(state) {
      state.profileUpdateSuccess = false;
      state.passwordChangeSuccess = false;
      state.profileError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Registration failed';
      })
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.accessToken;
        state.user = action.payload.user;
        state.isAuthenticated = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Login failed';
      })
      // Fetch current user
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      // Update user profile
      .addCase(updateUserProfile.pending, (state) => {
        state.loading = true;
        state.profileError = null;
        state.profileUpdateSuccess = false;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.profileUpdateSuccess = true;
        state.profileError = null;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.profileUpdateSuccess = false;
        state.profileError = action.payload?.message || 'Profile update failed';
      })
      // Change password
      .addCase(changeUserPassword.pending, (state) => {
        state.loading = true;
        state.profileError = null;
        state.passwordChangeSuccess = false;
      })
      .addCase(changeUserPassword.fulfilled, (state) => {
        state.loading = false;
        state.passwordChangeSuccess = true;
        state.profileError = null;
      })
      .addCase(changeUserPassword.rejected, (state, action) => {
        state.loading = false;
        state.passwordChangeSuccess = false;
        state.profileError = action.payload?.message || 'Password change failed';
      });
  },
});

export const { logout, clearError, clearProfileStatus } = authSlice.actions;
export default authSlice.reducer;
