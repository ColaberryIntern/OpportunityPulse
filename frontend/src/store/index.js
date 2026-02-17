import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import roleReducer from './slices/roleSlice';
import dashboardReducer from './slices/dashboardSlice';
import contentReducer from './slices/contentSlice';
import searchReducer from './slices/searchSlice';
import opportunityReducer from './slices/opportunitySlice';
import alertReducer from './slices/alertSlice';
import alertPrefReducer from './slices/alertPrefSlice';
import uiReducer from './slices/uiSlice';
import feedbackReducer from './slices/feedbackSlice';
import forumReducer from './slices/forumSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    roles: roleReducer,
    dashboard: dashboardReducer,
    content: contentReducer,
    search: searchReducer,
    opportunities: opportunityReducer,
    alerts: alertReducer,
    alertPreferences: alertPrefReducer,
    ui: uiReducer,
    feedback: feedbackReducer,
    forums: forumReducer,
  },
});
