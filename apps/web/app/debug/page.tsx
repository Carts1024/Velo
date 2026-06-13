import { PlaceholderPage } from "@/features/readiness/placeholder-page";

export default function DebugPage() {
  return (
    <PlaceholderPage
      title="Transaction debugger"
      description="Sprint 5 will add Testnet transaction hash lookup, normalized transaction summaries, failure hints, and raw response details."
      primaryAction={{ href: "/", label: "Home" }}
      checklist={["Hash lookup", "RPC action", "Parsed result", "Failure states"]}
    />
  );
}
