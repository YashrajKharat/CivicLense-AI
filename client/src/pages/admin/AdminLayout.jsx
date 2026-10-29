import AppShell from "../../components/AppShell.jsx";
import { Icon } from "../../components/Icons.jsx";
import { useAuth } from "../../lib/auth.jsx";

export default function AdminLayout() {
  const { profile } = useAuth();
  const isGlobal = profile?.role === "global_admin";
  const scopeLabel = isGlobal ? "Global super admin" : `${profile?.department_name || "Department"} super admin`;

  const nav = [
    { to: "/admin", end: true, label: "Command centre", icon: Icon.grid },
    { to: "/admin/complaints", label: "Complaints", icon: Icon.clipboard },
    { to: "/admin/clusters", label: "Groups & hotspots", icon: Icon.map },
    { to: "/admin/zones", label: "Work zones", icon: Icon.route },
    { to: "/admin/analytics", label: "Analytics", icon: Icon.trend },
    { to: "/admin/agent", label: "Operations agent", icon: Icon.sparkle },
    { to: "/admin/insights", label: "Today's brief", icon: Icon.bulb },
    { to: "/admin/review", label: "Image review", icon: Icon.scan, dot: true },
    { to: "/admin/departments", label: "Departments", icon: Icon.building },
    { to: "/admin/officers", label: "Officers", icon: Icon.user },
    { to: "/admin/staff", label: "Staff access", icon: Icon.shield, dot: true },
    { to: "/admin/categories", label: "Categories", icon: Icon.file },
    { to: "/admin/contracts", label: "Contracts", icon: Icon.building },
    { to: "/admin/reports", label: "Reports", icon: Icon.file },
    { to: "/admin/audit", label: "Audit log", icon: Icon.shield },
  ];

  return (
    <AppShell
      nav={nav}
      scopeLabel={scopeLabel}
      searchPlaceholder="Search reports, wards, contracts…"
    />
  );
}
