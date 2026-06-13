import { PlaceholderPage } from "@/features/readiness/placeholder-page";

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Sprint 2 will turn this into the project list, wallet-aware empty state, and owner-scoped dashboard home."
      primaryAction={{ href: "/projects/new", label: "New project" }}
      secondaryAction={{ href: "/debug", label: "Debug transaction" }}
      checklist={["Project table", "Wallet state", "Summary metrics"]}
    />
  );
}
