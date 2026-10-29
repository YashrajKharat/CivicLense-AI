import { Navigate, useLocation } from "react-router-dom";
import { useAuth, homeFor } from "../lib/auth.jsx";

export default function ProtectedRoute({ roles, children }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div style={{ padding: "var(--sp-6)" }} className="label">Loading</div>;
  }
  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to={homeFor(profile.role)} replace />;
  }
  return children;
}
