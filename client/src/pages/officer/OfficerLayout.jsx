import AppShell from "../../components/AppShell.jsx";
import { Icon } from "../../components/Icons.jsx";
import { useAuth } from "../../lib/auth.jsx";

export default function OfficerLayout() {
  const { profile } = useAuth();

  const nav = [
    { to: "/officer", end: true, label: "My queue", icon: Icon.clipboard },
    { to: "/officer/performance", label: "Performance", icon: Icon.trend },
  ];

  const actingAsAdmin = profile?.role === "super_admin" || profile?.role === "global_admin";

  return (
    <AppShell
      nav={nav}
      scopeLabel={
        actingAsAdmin
          ? `${profile?.department_name || "All departments"} · viewing as staff`
          : profile?.department_name
      }
      searchPlaceholder="Search your jobs…"
      tip={
        actingAsAdmin
          ? {
              title: "Heads up",
              body: "This queue shows only what is assigned to your own account. Department-wide work lives in the command centre.",
            }
          : {
              title: "Remember",
              body: "Uploading proof does not close a job. The resident confirms, and only then does it resolve.",
            }
      }
    />
  );
}
