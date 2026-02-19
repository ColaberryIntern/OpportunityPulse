import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { connectSocket, disconnectSocket } from './services/socketService';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
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
import ProfilePage from './pages/ProfilePage';
import ApiKeysPage from './pages/ApiKeysPage';
import WebhooksPage from './pages/WebhooksPage';
import SubscriptionPage from './pages/SubscriptionPage';
import AdminPage from './pages/AdminPage';
import NotificationsPage from './pages/NotificationsPage';
import ForYouPage from './pages/ForYouPage';
import AiToolsPage from './pages/AiToolsPage';
import AiToolDetailPage from './pages/AiToolDetailPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppLayout from './components/common/AppLayout';

function SocketManager() {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    } else {
      disconnectSocket();
    }
    return () => disconnectSocket();
  }, [isAuthenticated]);
  return null;
}

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
      <SocketManager />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/browse" element={<PublicBrowsePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

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
          path="/profile"
          element={
            <ProtectedLayout>
              <ProfilePage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/api-keys"
          element={
            <ProtectedLayout>
              <ApiKeysPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/webhooks"
          element={
            <ProtectedLayout>
              <WebhooksPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/subscription"
          element={
            <ProtectedLayout>
              <SubscriptionPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedLayout requiredRole="admin">
              <AdminPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedLayout>
              <NotificationsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/for-you"
          element={
            <ProtectedLayout>
              <ForYouPage />
            </ProtectedLayout>
          }
        />

        <Route
          path="/ai-tools"
          element={
            <ProtectedLayout>
              <AiToolsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/ai-tools/:slug"
          element={
            <ProtectedLayout>
              <AiToolDetailPage />
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
