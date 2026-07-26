import { AppShell } from "@/core/app-shell";
import { PlaygroundClient } from "@/features/playground/playground-client";

type PlaygroundPageProps = {
  searchParams: Promise<{ network?: string; contractId?: string }>;
};

export default async function PlaygroundPage({ searchParams }: PlaygroundPageProps) {
  const query = await searchParams;
  return (
    <AppShell>
      <PlaygroundClient
        initialNetwork={query.network === "mainnet" ? "mainnet" : "testnet"}
        initialContractId={query.contractId ?? ""}
      />
    </AppShell>
  );
}
