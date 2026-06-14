"use client";

import { api } from "@repo/backend/convex/_generated/api";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useAction } from "convex/react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Clock3Icon,
  RefreshCwIcon,
  SearchIcon,
  ServerCrashIcon,
} from "lucide-react";
import { FormEvent, useState } from "react";

type LookupResult = Awaited<
  ReturnType<ReturnType<typeof useAction<typeof api.transactions.lookup>>>
>;

type OperationRow = {
  index?: number;
  type?: string;
  source?: string;
};

type ContractCallRow = {
  operationIndex?: number;
  contractId?: string;
  functionName?: string;
  args?: unknown[];
};

type EventRow = {
  type?: string;
  contractId?: string;
  topics?: unknown[];
  data?: unknown;
};

const statusCopy = {
  success: {
    label: "Success",
    variant: "success",
    title: "Transaction succeeded",
    icon: CheckCircle2Icon,
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    title: "Transaction failed",
    icon: AlertCircleIcon,
  },
  not_found: {
    label: "Not found",
    variant: "warning",
    title: "Transaction not found",
    icon: SearchIcon,
  },
  pending: {
    label: "Pending",
    variant: "warning",
    title: "Transaction is pending",
    icon: Clock3Icon,
  },
  unavailable: {
    label: "RPC unavailable",
    variant: "destructive",
    title: "Stellar RPC unavailable",
    icon: ServerCrashIcon,
  },
  unsupported: {
    label: "Decode unsupported",
    variant: "warning",
    title: "Response decode unsupported",
    icon: AlertCircleIcon,
  },
} as const;

function formatTimestamp(value?: number) {
  return value ? new Date(value * 1_000).toLocaleString() : "Not available";
}

function displayJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-r border-zinc-200 px-4 py-3 last:border-r-0">
      <span className="text-xs font-medium text-zinc-500 uppercase">{label}</span>
      <span className="truncate font-mono text-sm text-zinc-950" title={value}>
        {value}
      </span>
    </div>
  );
}

export function TransactionDebugger({ initialHash = "" }: { initialHash?: string }) {
  const lookup = useAction(api.transactions.lookup);
  const [hash, setHash] = useState(initialHash);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  async function inspectTransaction(forceRefresh = false) {
    const normalizedHash = hash.trim().toLowerCase();

    if (!/^[0-9a-f]{64}$/.test(normalizedHash)) {
      setInputError("Enter a 64-character hexadecimal Testnet transaction hash.");
      setResult(null);
      return;
    }

    setIsLoading(true);
    setInputError(null);

    try {
      setResult(await lookup({ hash: normalizedHash, forceRefresh }));
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Transaction lookup failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void inspectTransaction(false);
  }

  const status = result ? statusCopy[result.status] : null;
  const StatusIcon = status?.icon;
  const operations = (result?.operations ?? []) as OperationRow[];
  const contractCalls = (result?.contractCalls ?? []) as ContractCallRow[];
  const events = (result?.events ?? []) as EventRow[];

  return (
    <section className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Transaction debugger</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Inspect a Stellar Testnet transaction without connecting a wallet or creating a project.
        </p>
      </div>

      <form className="grid gap-3 border border-zinc-200 bg-white p-4" onSubmit={submit}>
        <label htmlFor="transaction-hash" className="text-sm font-medium">
          Transaction hash
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="transaction-hash"
            value={hash}
            onChange={(event) => setHash(event.target.value)}
            placeholder="64-character hexadecimal hash"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !hash.trim()}>
            {isLoading ? <RefreshCwIcon className="animate-spin" /> : <SearchIcon />}
            {isLoading ? "Inspecting..." : "Inspect transaction"}
          </Button>
        </div>
      </form>

      {inputError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Lookup failed</AlertTitle>
          <AlertDescription>{inputError}</AlertDescription>
        </Alert>
      ) : null}

      {!result ? (
        <div className="border border-dashed border-zinc-300 bg-white px-5 py-10 text-center">
          <SearchIcon className="mx-auto size-6 text-zinc-500" />
          <p className="mt-3 text-sm font-medium">
            Paste a Testnet transaction hash to inspect it.
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-500">Example format: a1b2...64 hex</p>
        </div>
      ) : (
        <div className="grid gap-5">
          <Alert
            variant={
              result.status === "failed" || result.status === "unavailable"
                ? "destructive"
                : "default"
            }
          >
            {StatusIcon ? <StatusIcon /> : null}
            <AlertTitle>{status?.title}</AlertTitle>
            <AlertDescription>
              {result.failureReason ?? result.hint ?? "RPC response decoded successfully."}
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status?.variant}>{status?.label}</Badge>
              <Badge variant="gray">
                {result.source === "cache" ? "Cached result" : "Fresh RPC"}
              </Badge>
              <Badge variant="info">Testnet</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void inspectTransaction(true)}
              disabled={isLoading}
            >
              <RefreshCwIcon className={isLoading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </div>

          <div className="grid overflow-hidden border border-zinc-200 bg-white sm:grid-cols-2 lg:grid-cols-5">
            <SummaryValue label="Status" value={status?.label ?? result.status} />
            <SummaryValue label="Ledger" value={result.ledger?.toString() ?? "Not available"} />
            <SummaryValue label="Fee charged" value={result.feeCharged ?? "Not available"} />
            <SummaryValue label="Result code" value={result.resultCode ?? "Not available"} />
            <SummaryValue label="Timestamp" value={formatTimestamp(result.createdAt)} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <ResultTable
              title="Operations"
              empty="No operations decoded."
              headings={["Index", "Type", "Source"]}
              rows={operations.map((operation, index) => [
                String(operation.index ?? index),
                operation.type ?? "Unknown",
                operation.source ?? "Transaction source",
              ])}
            />
            <ResultTable
              title="Contract calls"
              empty="No contract calls decoded."
              headings={["Operation", "Contract", "Function"]}
              rows={contractCalls.map((call, index) => [
                String(call.operationIndex ?? index),
                call.contractId ?? "Unavailable",
                call.functionName ?? "Unavailable",
              ])}
            />
          </div>

          <div className="border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-base font-semibold">Events</h2>
            </div>
            {events.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-600">No events decoded.</p>
            ) : (
              <div className="grid divide-y divide-zinc-200">
                {events.map((event, index) => (
                  <div key={index} className="grid gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{event.type ?? "contract"}</Badge>
                      <span className="font-mono text-xs break-all">
                        {event.contractId ?? "No contract ID"}
                      </span>
                    </div>
                    <pre className="overflow-x-auto bg-zinc-950 p-3 text-xs text-zinc-100">
                      {displayJson({ topics: event.topics, data: event.data })}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.failureReason || result.hint ? (
            <div className="grid gap-2 border border-zinc-200 bg-white p-4">
              <h2 className="text-base font-semibold">Failure analysis</h2>
              {result.failureReason ? (
                <p className="font-mono text-sm text-red-700">{result.failureReason}</p>
              ) : null}
              {result.hint ? <p className="text-sm text-zinc-700">{result.hint}</p> : null}
            </div>
          ) : null}

          <Accordion type="single" collapsible className="border border-zinc-200 bg-white px-4">
            <AccordionItem value="raw">
              <AccordionTrigger>Raw RPC response</AccordionTrigger>
              <AccordionContent>
                <pre className="max-h-[32rem] overflow-auto bg-zinc-950 p-4 text-xs text-zinc-100">
                  {result.rawResponse}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </section>
  );
}

function ResultTable({
  title,
  empty,
  headings,
  rows,
}: {
  title: string;
  empty: string;
  headings: string[];
  rows: string[][];
}) {
  return (
    <div className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {headings.map((heading) => (
              <TableHead key={heading}>{heading}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={headings.length}
                className="py-8 text-center text-sm text-zinc-600"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((value, cellIndex) => (
                  <TableCell
                    key={cellIndex}
                    className={cellIndex === 0 ? "text-sm" : "max-w-64 font-mono text-xs break-all"}
                  >
                    {value}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
