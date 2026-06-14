import { AppShell } from "@/core/app-shell";
import { TransactionDebugger } from "@/features/debugger/transaction-debugger";

export default function DebugPage() {
  return (
    <AppShell>
      <TransactionDebugger />
    </AppShell>
  );
}
