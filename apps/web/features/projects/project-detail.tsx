"use client";

import { stellarConfig } from "@/core/config/stellar";
import { shortenAddress } from "@/core/wallet/format";
import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import {
  buildRegisterProjectTransaction,
  confirmRegistration,
  submitSignedTransaction,
} from "@repo/stellar";
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
import { useMutation, useQuery } from "convex/react";
import {
  ActivityIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  SendIcon,
  WalletIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

import { EventActivityTable } from "./event-activity";

const statusLabel = {
  draft: "Draft",
  pending_registration: "Pending",
  registered: "Registered",
  registration_error: "Error",
  stale: "Stale",
} as const;

const statusVariant = {
  draft: "info",
  pending_registration: "warning",
  registered: "success",
  registration_error: "destructive",
  stale: "warning",
} as const;

const contractStatusLabel = {
  pending_add: "Pending add",
  active: "Active",
  pending_remove: "Pending remove",
  contract_error: "Error",
  stale: "Stale",
} as const;

const contractStatusVariant = {
  pending_add: "warning",
  active: "success",
  pending_remove: "warning",
  contract_error: "destructive",
  stale: "warning",
} as const;

type ProjectDetailProps = {
  projectId: string;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-zinc-200 bg-white p-3">
      <span className="text-xs font-medium tracking-normal text-zinc-500 uppercase">{label}</span>
      <span className="font-mono text-sm break-all text-zinc-900">{value}</span>
    </div>
  );
}

function formatTimestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : "Not synced";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Registration request failed";
}

function isRejectedSignature(error: unknown) {
  return /reject|denied|cancel/i.test(errorMessage(error));
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const wallet = useWallet();
  const project = useQuery(api.projects.getById, { id: projectId as Id<"projects"> });
  const contracts = useQuery(api.projects.listContracts, {
    projectId: projectId as Id<"projects">,
  });
  const recentActivity = useQuery(
    api.contractEvents.listByProject,
    wallet.address
      ? {
          projectId: projectId as Id<"projects">,
          ownerAddress: wallet.address,
          limit: 5,
        }
      : "skip",
  );
  const webhookSummary = useQuery(
    api.webhooks.getSummary,
    wallet.address
      ? {
          projectId: projectId as Id<"projects">,
          ownerAddress: wallet.address,
        }
      : "skip",
  );
  const markPending = useMutation(api.projects.markRegistrationPending);
  const markSynced = useMutation(api.projects.markRegistrationSynced);
  const markStale = useMutation(api.projects.markRegistrationStale);
  const markError = useMutation(api.projects.markRegistrationError);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (project === undefined) {
    return (
      <section className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  if (project === null) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-normal">Project not found</h1>
        <Button asChild className="w-fit">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </section>
    );
  }

  const currentProject = project;
  const ownerMatches = wallet.address?.toUpperCase() === currentProject.ownerAddress;
  const canRegister =
    ownerMatches &&
    (currentProject.status === "draft" ||
      currentProject.status === "registration_error" ||
      currentProject.status === "stale");
  const canSync = ownerMatches && Boolean(currentProject.registrationTxHash);

  async function syncRegistration(transactionHash = currentProject.registrationTxHash) {
    if (!transactionHash || !wallet.address || !stellarConfig.registryContractId) {
      return;
    }

    setIsSyncing(true);
    setLocalError(null);

    try {
      const confirmation = await confirmRegistration({
        rpcUrl: stellarConfig.rpcUrl,
        networkPassphrase: stellarConfig.networkPassphrase,
        registryContractId: stellarConfig.registryContractId,
        transactionHash,
      });

      if (confirmation.status === "pending") {
        await markStale({ id: currentProject._id, ownerAddress: wallet.address });
        return;
      }

      if (confirmation.status === "error") {
        await markError({
          id: currentProject._id,
          ownerAddress: wallet.address,
          registrationError: confirmation.message,
        });
        return;
      }

      await markSynced({
        id: currentProject._id,
        ownerAddress: wallet.address,
        registryProjectId: confirmation.registryProjectId ?? undefined,
        createdLedger: confirmation.createdLedger ?? undefined,
      });
    } catch (error) {
      const message = `RPC unavailable: ${errorMessage(error)}`;
      setLocalError(message);
      await markError({
        id: currentProject._id,
        ownerAddress: wallet.address,
        registrationError: message,
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function registerProject() {
    if (!wallet.address) {
      setLocalError("Connect the owner wallet before registering.");
      return;
    }

    if (!stellarConfig.registryContractId) {
      setLocalError("Set NEXT_PUBLIC_TALAKIT_REGISTRY_CONTRACT_ID before registration.");
      return;
    }

    setIsRegistering(true);
    setLocalError(null);

    try {
      const transactionXdr = await buildRegisterProjectTransaction({
        rpcUrl: stellarConfig.rpcUrl,
        networkPassphrase: stellarConfig.networkPassphrase,
        registryContractId: stellarConfig.registryContractId,
        sourcePublicKey: wallet.address,
        ownerPublicKey: wallet.address,
        projectName: currentProject.name,
        metadataHash: currentProject.metadataHash,
      });
      const signedXdr = await wallet.signTransaction(transactionXdr);
      const transactionHash = await submitSignedTransaction({
        rpcUrl: stellarConfig.rpcUrl,
        networkPassphrase: stellarConfig.networkPassphrase,
        signedXdr,
      });

      await markPending({
        id: currentProject._id,
        ownerAddress: wallet.address,
        registrationTxHash: transactionHash,
      });
      await syncRegistration(transactionHash);
    } catch (error) {
      const message = isRejectedSignature(error)
        ? `Rejected signature: ${errorMessage(error)}`
        : errorMessage(error);

      setLocalError(message);
      await markError({
        id: currentProject._id,
        ownerAddress: wallet.address,
        registrationError: message,
      });
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-normal">{currentProject.name}</h1>
            <Badge variant={statusVariant[currentProject.status]}>
              {statusLabel[currentProject.status]}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">{currentProject.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={registerProject} disabled={!canRegister || isRegistering || isSyncing}>
            <SendIcon />
            {isRegistering ? "Registering..." : "Register on-chain"}
          </Button>
          <Button
            variant="outline"
            onClick={() => syncRegistration()}
            disabled={!canSync || isRegistering || isSyncing}
          >
            <RefreshCwIcon />
            {isSyncing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {!wallet.address ? (
        <Alert>
          <WalletIcon />
          <AlertTitle>Owner wallet required</AlertTitle>
          <AlertDescription>
            Connect {shortenAddress(currentProject.ownerAddress)} to register this draft.
          </AlertDescription>
        </Alert>
      ) : !ownerMatches ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Connected wallet is not the owner</AlertTitle>
          <AlertDescription>
            Switch to {shortenAddress(currentProject.ownerAddress)} to register or sync this
            project.
          </AlertDescription>
        </Alert>
      ) : null}

      {currentProject.status === "pending_registration" ? (
        <Alert>
          <ClockIcon />
          <AlertTitle>Registration pending</AlertTitle>
          <AlertDescription>
            Sync checks the submitted transaction and records the registry project ID after
            confirmation.
          </AlertDescription>
        </Alert>
      ) : null}

      {currentProject.status === "registered" ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Project registered</AlertTitle>
          <AlertDescription>
            Convex has stored the confirmed registry state for this project.
          </AlertDescription>
        </Alert>
      ) : null}

      {localError || currentProject.registrationError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Registration needs attention</AlertTitle>
          <AlertDescription>{localError ?? currentProject.registrationError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <DetailRow label="Owner wallet" value={currentProject.ownerAddress} />
        <DetailRow label="Metadata hash" value={currentProject.metadataHash} />
        <DetailRow
          label="Transaction hash"
          value={currentProject.registrationTxHash ?? "Not submitted"}
        />
        <DetailRow
          label="Registry project ID"
          value={currentProject.registryProjectId?.toString() ?? "Not registered"}
        />
        <DetailRow
          label="Created ledger"
          value={currentProject.createdLedger?.toString() ?? "Not available"}
        />
        <DetailRow label="Last sync" value={formatTimestamp(currentProject.lastSyncAt)} />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-normal">Official contracts</h2>
            <p className="text-sm text-zinc-600">
              Active contract IDs are published on the public proof page.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${currentProject._id}/contracts`}>Manage</Link>
          </Button>
        </div>
        {contracts === undefined ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-zinc-600">
                    No official contracts linked.
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract._id}>
                    <TableCell className="max-w-[20rem] font-mono text-xs break-all">
                      {contract.contractId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={contractStatusVariant[contract.status]}>
                        {contractStatusLabel[contract.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-zinc-600">
                      {formatTimestamp(contract.lastSyncAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-normal">Recent activity</h2>
            <p className="text-sm text-zinc-600">
              Bounded Testnet events observed for active official contracts.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${currentProject._id}/events`}>
              <ActivityIcon />
              View events
            </Link>
          </Button>
        </div>
        <EventActivityTable
          events={recentActivity?.events ?? []}
          emptyMessage={
            wallet.address
              ? "No recent events cached for this project."
              : "Connect the owner wallet to view dashboard activity."
          }
        />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-normal">Webhook delivery</h2>
              <Badge
                variant={
                  webhookSummary?.lastDelivery?.status === "success"
                    ? "success"
                    : webhookSummary?.lastDelivery?.status === "failed"
                      ? "destructive"
                      : webhookSummary?.enabled
                        ? "info"
                        : "gray"
                }
              >
                {webhookSummary?.lastDelivery?.status ??
                  (webhookSummary?.enabled ? "ready" : "not configured")}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              {webhookSummary?.destinationHost
                ? `${webhookSummary.destinationHost} - ${webhookSummary.eventTypeCount} event types`
                : "Configure a private endpoint and send a demo delivery."}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${currentProject._id}/webhooks`}>
              <WebhookIcon />
              Manage webhooks
            </Link>
          </Button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <DetailRow
            label="Last delivery"
            value={formatTimestamp(webhookSummary?.lastDelivery?.lastAttemptAt)}
          />
          <DetailRow
            label="Recent successes"
            value={`${webhookSummary?.successCount ?? 0} of ${webhookSummary?.recentCount ?? 0}`}
          />
          <DetailRow
            label="Failed attempts"
            value={(webhookSummary?.failedCount ?? 0).toString()}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href={`/projects/${currentProject._id}/contracts`}>
            <ExternalLinkIcon />
            Contracts
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/projects/${currentProject._id}/events`}>
            <ActivityIcon />
            Events
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/projects/${currentProject._id}/webhooks`}>
            <WebhookIcon />
            Webhooks
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/verify/${currentProject.slug}`}>
            <ExternalLinkIcon />
            Public proof
          </Link>
        </Button>
      </div>
    </section>
  );
}
