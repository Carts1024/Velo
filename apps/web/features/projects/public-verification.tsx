"use client";

import { shortenAddress } from "@/core/wallet/format";
import { api } from "@repo/backend/convex/_generated/api";
import { CopyButton } from "@repo/ui/components/common/copy-button";
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

import { EventActivityTable } from "./event-activity";

type PublicVerificationProps = {
  slug: string;
};

function formatTimestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : "Not synced";
}

function ProofRow({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  copyValue?: string;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-zinc-200 bg-white p-3">
      <span className="text-xs font-medium tracking-normal text-zinc-500 uppercase">{label}</span>
      <div className="flex min-w-0 items-start gap-1">
        <span className="min-w-0 flex-1 font-mono text-sm break-all text-zinc-900">{value}</span>
        {copyValue ? <CopyButton value={copyValue} label={label.toLowerCase()} /> : null}
      </div>
    </div>
  );
}

export function PublicVerification({ slug }: PublicVerificationProps) {
  const proof = useQuery(api.projects.query.getPublicVerification, { slug });
  const recentActivity = useQuery(api.contract_events.query.listPublicBySlug, { slug, limit: 5 });

  if (proof === undefined) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (proof === null) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <h1 className="text-3xl font-semibold tracking-normal">Project not found</h1>
        <Button asChild className="w-fit">
          <Link href="/dashboard">Back to Velo</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-5xl gap-6">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheckIcon className="size-7 text-emerald-600" />
            <h1 className="min-w-0 break-words text-3xl font-semibold tracking-normal">
              {proof.name}
            </h1>
            <Badge variant={proof.active ? "success" : "warning"}>
              {proof.active ? "Active" : "Needs sync"}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">{proof.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Velo</Link>
          </Button>
          <CopyButton value={`/verify/${proof.slug}`} label="public proof URL" size="sm" />
        </div>
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
            The project is not fully registered, or its stored registry fields do not align with the
            expected proof state.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ProofRow
          label="Owner wallet"
          value={`${shortenAddress(proof.ownerAddress)} (${proof.ownerAddress})`}
          copyValue={proof.ownerAddress}
        />
        <ProofRow
          label="Registry project ID"
          value={proof.registryProjectId?.toString() ?? "Not registered"}
        />
        <ProofRow label="Metadata hash" value={proof.metadataHash} copyValue={proof.metadataHash} />
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
        <div className="overflow-x-auto w-full">
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
                    <TableCell className="whitespace-normal break-all font-mono text-xs">
                      <div className="flex items-start gap-1">
                        <span className="min-w-0 flex-1">{contractId}</span>
                        <CopyButton value={contractId} label="contract ID" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 p-4">
          <h2 className="text-base font-semibold tracking-normal">Recent public activity</h2>
          <p className="text-sm text-zinc-600">
            Public event fields only. Raw payloads and poller errors remain dashboard-only.
          </p>
        </div>
        {recentActivity === undefined ? (
          <div className="space-y-3 p-5" aria-label="Loading recent public activity">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <EventActivityTable
            events={recentActivity}
            emptyMessage="No recent public activity is available."
          />
        )}
      </div>
    </div>
  );
}
