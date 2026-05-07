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
import StrategicViewPage from './pages/StrategicViewPage';
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
import AiToolsPage from './pages/AiToolsPage';
import AiToolDetailPage from './pages/AiToolDetailPage';
import ActionTrackerPage from './pages/ActionTrackerPage';
import StrategicClustersPage from './pages/StrategicClustersPage';
import IntelligenceDashboardPage from './pages/IntelligenceDashboardPage';
import FreelancePage from './pages/FreelancePage';
import BonfirePage from './pages/BonfirePage';
import BonfireStrategicPage from './pages/BonfireStrategicPage';
import MyOpportunitiesPage from './pages/MyOpportunitiesPage';
import ReviewQueuePage from './pages/ReviewQueuePage';
import ProfileEditorPage from './pages/ProfileEditorPage';
import BundlesPage from './pages/BundlesPage';
import RecommendationsPage from './pages/RecommendationsPage';
import BriefingPage from './pages/BriefingPage';
import TriggerLogsPage from './pages/TriggerLogsPage';
import ExecutionQueuePage from './pages/ExecutionQueuePage';
import RevenueDashboardPage from './pages/RevenueDashboardPage';
import OIEDDashboardPage from './pages/OIEDDashboardPage';

// /dashboard router: admins go to OIED Mission Control (the unified
// dashboard with brief banner + AI matches + channel overview + trends).
// Everyone else keeps the legacy DashboardPage. Single mental model
// for the admin without breaking the public-facing dashboard.
function DashboardOrMissionControl() {
  const role = useSelector((s) => s.auth && s.auth.user && s.auth.user.role);
  if (role === 'admin') return <OIEDDashboardPage />;
  return <DashboardPage />;
}
import BillingPage from './pages/BillingPage';
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

// v6: global toast that surfaces 402 plan-limit responses dispatched
// by the api.js interceptor. Auto-dismisses after 8 seconds.
function PlanLimitToast() {
  const [event, setEvent] = React.useState(null);
  React.useEffect(() => {
    function handler(e) {
      setEvent(e.detail);
      const t = setTimeout(() => setEvent(null), 8000);
      return () => clearTimeout(t);
    }
    window.addEventListener('oied-plan-limit', handler);
    return () => window.removeEventListener('oied-plan-limit', handler);
  }, []);
  if (!event) return null;
  return (
    <div
      className="fixed top-4 right-4 z-50 max-w-sm p-4 rounded-lg bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 shadow-lg"
      data-testid="plan-limit-toast"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-red-900 dark:text-red-200 mb-1">
            💳 Plan limit reached
          </div>
          <div className="text-sm text-red-900 dark:text-red-100">
            {event.message}
          </div>
          <a
            href="/admin/billing"
            className="inline-block mt-2 text-sm text-red-700 dark:text-red-300 underline"
          >
            Upgrade plan →
          </a>
        </div>
        <button
          type="button"
          onClick={() => setEvent(null)}
          className="text-red-700 dark:text-red-300 text-xs"
        >✕</button>
      </div>
    </div>
  );
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
      <PlanLimitToast />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/browse" element={<PublicBrowsePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        {/* Protected routes with shared layout */}
        {/* Admins land on the unified OIED Mission Control; non-admins keep
            the legacy dashboard. Mission Control now contains everything
            the legacy dashboard had plus the OIED-specific surfaces. */}
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <DashboardOrMissionControl />
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
        {/* Strategic opportunity views — all use StrategicViewPage */}
        <Route
          path="/opportunities"
          element={
            <ProtectedLayout>
              <StrategicViewPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/government"
          element={
            <ProtectedLayout>
              <StrategicViewPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/private-sector"
          element={
            <ProtectedLayout>
              <StrategicViewPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/talent"
          element={
            <ProtectedLayout>
              <StrategicViewPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/capital"
          element={
            <ProtectedLayout>
              <StrategicViewPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/alpha"
          element={
            <ProtectedLayout>
              <StrategicViewPage />
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
        <Route path="/for-you" element={<Navigate to="/dashboard" replace />} />

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

        <Route path="/executive-brief" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/action-tracker"
          element={
            <ProtectedLayout>
              <ActionTrackerPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/strategic-clusters"
          element={
            <ProtectedLayout>
              <StrategicClustersPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/intelligence"
          element={
            <ProtectedLayout>
              <IntelligenceDashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/freelance"
          element={
            <ProtectedLayout>
              <FreelancePage />
            </ProtectedLayout>
          }
        />
        {/* Bonfire Opportunity Engine (prototype — backend-gated by BONFIRE_ENGINE_ENABLED flag).
            Route is always mounted; the backend returns 404 when the flag is off, and the
            sidebar nav link is hidden based on a /bonfire/flag probe. */}
        <Route
          path="/bonfire"
          element={
            <ProtectedLayout>
              <BonfirePage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/bonfire/strategic"
          element={
            <ProtectedLayout>
              <BonfireStrategicPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/oied"
          element={
            <ProtectedLayout requiredRole="admin">
              <OIEDDashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/opportunities/my"
          element={
            <ProtectedLayout requiredRole="admin">
              <MyOpportunitiesPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/opportunities/review"
          element={
            <ProtectedLayout requiredRole="admin">
              <ReviewQueuePage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/profile"
          element={
            <ProtectedLayout>
              <ProfileEditorPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/opportunities/bundles"
          element={
            <ProtectedLayout>
              <BundlesPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/opportunities/recommendations"
          element={
            <ProtectedLayout requiredRole="admin">
              <RecommendationsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/briefing"
          element={
            <ProtectedLayout>
              <BriefingPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/triggers"
          element={
            <ProtectedLayout requiredRole="admin">
              <TriggerLogsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/opportunities/execution"
          element={
            <ProtectedLayout requiredRole="admin">
              <ExecutionQueuePage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/revenue"
          element={
            <ProtectedLayout requiredRole="admin">
              <RevenueDashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admin/billing"
          element={
            <ProtectedLayout>
              <BillingPage />
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

        {/* Legacy route redirects */}
        <Route path="/gov-contracts" element={<Navigate to="/government" replace />} />
        <Route path="/jobs" element={<Navigate to="/talent" replace />} />
        <Route path="/investments" element={<Navigate to="/capital" replace />} />
        <Route path="/grants" element={<Navigate to="/government" replace />} />
        <Route path="/ai-news" element={<Navigate to="/private-sector" replace />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
