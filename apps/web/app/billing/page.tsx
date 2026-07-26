import { AppShell } from "@/core/app-shell";
import { BillingDashboard } from "@/features/billing/billing-dashboard";

export default function BillingPage() {
  return (
    <AppShell>
      <BillingDashboard />
    </AppShell>
  );
}
