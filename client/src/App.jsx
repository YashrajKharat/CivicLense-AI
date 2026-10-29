import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth, homeFor } from "./lib/auth.jsx";
import { I18nProvider } from "./lib/i18n.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import Landing from "./pages/public/Landing.jsx";
import PublicReports from "./pages/public/PublicReports.jsx";
import PublicReport from "./pages/public/PublicReport.jsx";
import Leaderboard from "./pages/public/Leaderboard.jsx";
import SignIn from "./pages/auth/SignIn.jsx";
import Register from "./pages/auth/Register.jsx";
import Callback from "./pages/auth/Callback.jsx";
import GovLogin from "./pages/gov/GovLogin.jsx";
import GovRegister from "./pages/gov/GovRegister.jsx";
import GovStatus from "./pages/gov/GovStatus.jsx";

import CitizenLayout from "./pages/citizen/CitizenLayout.jsx";
import Dashboard from "./pages/citizen/Dashboard.jsx";
import CityMapPage from "./pages/citizen/CityMapPage.jsx";
import Report from "./pages/citizen/Report.jsx";
import MyReports from "./pages/citizen/MyReports.jsx";
import Notifications from "./pages/citizen/Notifications.jsx";
import Profile from "./pages/citizen/Profile.jsx";
import Settings from "./pages/citizen/Settings.jsx";

import OfficerLayout from "./pages/officer/OfficerLayout.jsx";
import Queue from "./pages/officer/Queue.jsx";
import JobDetail from "./pages/officer/JobDetail.jsx";
import Performance from "./pages/officer/Performance.jsx";

import AdminLayout from "./pages/admin/AdminLayout.jsx";
import CommandCentre from "./pages/admin/CommandCentre.jsx";
import Clusters from "./pages/admin/Clusters.jsx";
import Zones from "./pages/admin/Zones.jsx";
import ClusterDetail from "./pages/admin/ClusterDetail.jsx";
import ComplaintDetail from "./pages/admin/ComplaintDetail.jsx";
import Officers from "./pages/admin/Officers.jsx";
import OfficerDetail from "./pages/admin/OfficerDetail.jsx";
import Departments from "./pages/admin/Departments.jsx";
import Categories from "./pages/admin/Categories.jsx";
import Contracts from "./pages/admin/Contracts.jsx";
import Analytics from "./pages/admin/Analytics.jsx";
import Insights from "./pages/admin/Insights.jsx";
import Agent from "./pages/admin/Agent.jsx";
import Complaints from "./pages/admin/Complaints.jsx";
import StaffApprovals from "./pages/admin/StaffApprovals.jsx";
import ReviewQueue from "./pages/admin/ReviewQueue.jsx";
import Reports from "./pages/admin/Reports.jsx";
import AuditLog from "./pages/admin/AuditLog.jsx";

const ADMIN = ["super_admin", "global_admin"];
const FIELD = ["officer", "super_admin", "global_admin"];

/** Signed-in visitors skip the marketing page and land in their own product. */
function Root() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="label" style={{ padding: 40 }}>Loading</div>;
  if (session) return <Navigate to={homeFor(profile?.role)} replace />;
  return <Landing />;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </I18nProvider>
  );
}

/**
 * The boundary sits inside the router so it can reset on navigation. One
 * component throwing should cost you that component, not the whole screen.
 */
function Shell() {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
          <Route path="/" element={<Root />} />

          {/* Protected: requires login to explore reports and leaderboard */}
          <Route path="/reports" element={<ProtectedRoute><PublicReports /></ProtectedRoute>} />
          <Route path="/reports/:ref" element={<ProtectedRoute><PublicReport /></ProtectedRoute>} />
          <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<Callback />} />
          {/* Government portal — a separate entrance, not the resident form with a checkbox. */}
          <Route path="/gov" element={<GovLogin />} />
          <Route path="/gov/register" element={<GovRegister />} />
          <Route path="/gov/status" element={<ProtectedRoute><GovStatus /></ProtectedRoute>} />

          <Route path="/app" element={<ProtectedRoute><CitizenLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="map" element={<CityMapPage />} />
            <Route path="report" element={<Report />} />
            <Route path="reports" element={<MyReports />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/officer" element={<ProtectedRoute roles={FIELD}><OfficerLayout /></ProtectedRoute>}>
            <Route index element={<Queue />} />
            <Route path="jobs/:ref" element={<JobDetail />} />
            <Route path="performance" element={<Performance />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute roles={ADMIN}><AdminLayout /></ProtectedRoute>}>
            <Route index element={<CommandCentre />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="staff" element={<StaffApprovals />} />
            <Route path="clusters" element={<Clusters />} />
            <Route path="zones" element={<Zones />} />
            <Route path="clusters/:id" element={<ClusterDetail />} />
            <Route path="complaints/:ref" element={<ComplaintDetail />} />
            <Route path="officers" element={<Officers />} />
            <Route path="officers/:id" element={<OfficerDetail />} />
            <Route path="departments" element={<Departments />} />
            <Route path="categories" element={<Categories />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="agent" element={<Agent />} />
            <Route path="insights" element={<Insights />} />
            <Route path="review" element={<ReviewQueue />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
