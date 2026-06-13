import { PlaceholderPage } from "@/features/readiness/placeholder-page";

export default function Home() {
  return (
    <PlaceholderPage
      title="Verified developer infrastructure for Stellar apps"
      description="Register official Soroban contracts, debug Testnet transactions, monitor events, and prove webhook delivery from one developer operations workspace."
      primaryAction={{ href: "/dashboard", label: "Open dashboard" }}
      secondaryAction={{ href: "/debug", label: "Debug transaction" }}
      checklist={["Landing entry route", "Shared UI import", "Testnet config"]}
      status="ready"
    />
  );
}
