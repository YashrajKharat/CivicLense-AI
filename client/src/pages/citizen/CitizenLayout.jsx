import AppShell from "../../components/AppShell.jsx";
import { Icon } from "../../components/Icons.jsx";
import { useT } from "../../lib/i18n.jsx";

export default function CitizenLayout() {
  const { t } = useT();

  const nav = [
    { to: "/app", end: true, label: t("nav.home"), icon: Icon.grid },
    { to: "/app/map", label: "Map", icon: Icon.map },
    { to: "/app/report", label: t("nav.report"), icon: Icon.camera },
    { to: "/app/reports", label: t("nav.reports"), icon: Icon.clipboard },
    // The public record, open to everyone. A resident who can see only their
    // own reports has to take on trust that anything happens to anybody else's.
    { to: "/reports", label: "Everyone's reports", icon: Icon.file },
    { to: "/leaderboard", label: "Leaderboard", icon: Icon.shield },
    { to: "/app/notifications", label: "Notifications", icon: Icon.bell },
    { to: "/app/profile", label: "Profile", icon: Icon.user },
    { to: "/app/settings", label: "Settings", icon: Icon.gear },
  ];

  return (
    <AppShell
      nav={nav}
      tip={{
        title: "Civic tip",
        body: "Track every report's status from My reports, in real time. Nothing closes without your confirmation.",
      }}
    />
  );
}
