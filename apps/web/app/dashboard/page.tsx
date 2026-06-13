import { AppShell } from "@/core/app-shell";
import { ProjectDashboard } from "@/features/projects/dashboard";

export default function DashboardPage() {
  return (
    <AppShell>
      <ProjectDashboard />
    </AppShell>
  );
}
