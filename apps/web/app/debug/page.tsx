import { AppShell } from "@/core/app-shell";
import { TransactionDebugger } from "@/features/debugger/transaction-debugger";

type DebugPageProps = {
  searchParams: Promise<{
    hash?: string;
  }>;
};

export default async function DebugPage({ searchParams }: DebugPageProps) {
  const { hash } = await searchParams;

  return (
    <AppShell>
      <TransactionDebugger initialHash={hash} />
    </AppShell>
  );
}
