"use client";

import { shortenAddress } from "@/core/wallet/format";
import { api } from "@repo/backend/convex/_generated/api";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useQuery } from "convex/react";
import { AlertCircleIcon, CheckCircle2Icon, ExternalLinkIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

type PublicVerificationProps = {
  slug: string;
};

function formatTimestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : "Not synced";
}

function ProofRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-zinc-200 bg-white p-3">
      <span className="text-xs font-medium uppercase tracking-normal text-zinc-500">{label}</span>
      <span className="break-all font-mono text-sm text-zinc-900">{value}</span>
    </div>
  );
}

export function PublicVerification({ slug }: PublicVerificationProps) {
  const proof = useQuery(api.projects.getPublicVerification, { slug });

  if (proof === undefined) {
    return (
      <main className="min-h-svh bg-zinc-50 text-zinc-950">
        <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    );
  }

  if (proof === null) {
    return (
      <main className="min-h-svh bg-zinc-50 text-zinc-950">
        <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-semibold tracking-normal">Project not found</h1>
          <Button asChild className="w-fit">
            <Link href="/dashboard">Back to TalaKit</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-svh bg-zinc-50 text-zinc-950">
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheckIcon className="size-7 text-emerald-600" />
              <h1 className="text-3xl font-semibold tracking-normal">{proof.name}</h1>
              <Badge variant={proof.active ? "success" : "warning"}>
                {proof.active ? "Active" : "Needs sync"}
              </Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">{proof.description}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard">TalaKit</Link>
          </Button>
        </header>

        {proof.active ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>Registered project proof</AlertTitle>
            <AlertDescription>
              This page is public and uses only registry-safe project data and active official
              contracts.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Registry data needs attention</AlertTitle>
            <AlertDescription>
              The project is not fully registered, or its stored registry fields do not align with
              the expected proof state.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <ProofRow
            label="Owner wallet"
            value={`${shortenAddress(proof.ownerAddress)} (${proof.ownerAddress})`}
          />
          <ProofRow
            label="Registry project ID"
            value={proof.registryProjectId?.toString() ?? "Not registered"}
          />
          <ProofRow label="Metadata hash" value={proof.metadataHash} />
          <ProofRow
            label="Created ledger"
            value={proof.createdLedger?.toString() ?? "Not available"}
          />
          <ProofRow label="Last sync" value={formatTimestamp(proof.lastSyncAt)} />
          <ProofRow label="Slug" value={proof.slug} />
        </div>

        {proof.website ? (
          <Button variant="outline" asChild className="w-fit">
            <Link href={proof.website}>
              <ExternalLinkIcon />
              Website
            </Link>
          </Button>
        ) : null}

        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Official contract IDs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proof.officialContractIds.length === 0 ? (
                <TableRow>
                  <TableCell className="py-8 text-center text-sm text-zinc-600">
                    No active official contracts confirmed.
                  </TableCell>
                </TableRow>
              ) : (
                proof.officialContractIds.map((contractId) => (
                  <TableRow key={contractId}>
                    <TableCell className="break-all font-mono text-xs">{contractId}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
}
