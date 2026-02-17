import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ContentPage from './pages/ContentPage';
import SearchPage from './pages/SearchPage';
import RoleManagementPage from './pages/RoleManagementPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import OpportunityDetailPage from './pages/OpportunityDetailPage';
import AlertsPage from './pages/AlertsPage';
import PublicBrowsePage from './pages/PublicBrowsePage';
import FeedbackPage from './pages/FeedbackPage';
import ForumsPage from './pages/ForumsPage';
import ForumPostPage from './pages/ForumPostPage';
import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppLayout from './components/common/AppLayout';

function ProtectedLayout({ children, requiredRole }) {
  return (
    <ProtectedRoute requiredRole={requiredRole}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/browse" element={<PublicBrowsePage />} />

        {/* Protected routes with shared layout */}
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <DashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/content"
          element={
            <ProtectedLayout>
              <ContentPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedLayout>
              <SearchPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedLayout requiredRole="admin">
              <RoleManagementPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/opportunities"
          element={
            <ProtectedLayout>
              <OpportunitiesPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/opportunities/:id"
          element={
            <ProtectedLayout>
              <OpportunityDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/alerts"
          element={
            <ProtectedLayout>
              <AlertsPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/feedback"
          element={
            <ProtectedLayout>
              <FeedbackPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/forums"
          element={
            <ProtectedLayout>
              <ForumsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/forums/:id"
          element={
            <ProtectedLayout>
              <ForumPostPage />
            </ProtectedLayout>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
