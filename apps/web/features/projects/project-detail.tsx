"use client";

import { stellarConfig } from "@/core/config/stellar";
import { shortenAddress } from "@/core/wallet/format";
import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import {
  buildRegisterProjectTransaction,
  confirmRegistration,
  submitSignedTransaction,
  buildActivatePaymentsTransaction,
  confirmActivatePayments,
} from "@repo/stellar";
import { CopyButton } from "@repo/ui/components/common/copy-button";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Progress } from "@repo/ui/components/ui/progress";
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
  CircleIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  SendIcon,
  WalletIcon,
  WebhookIcon,
  KeyIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

import { getDemoReadiness } from "./demo-readiness";
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

function DetailRow({
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
  const project = useQuery(
    api.projects.query.getById,
    wallet.address ? { id: projectId as Id<"projects">, ownerAddress: wallet.address } : "skip",
  );
  const contracts = useQuery(
    api.project_contracts.query.listByProject,
    wallet.address
      ? { projectId: projectId as Id<"projects">, ownerAddress: wallet.address }
      : "skip",
  );
  const recentActivity = useQuery(
    api.contract_events.query.listByProject,
    wallet.address
      ? {
          projectId: projectId as Id<"projects">,
          ownerAddress: wallet.address,
          limit: 5,
        }
      : "skip",
  );
  const webhookSummary = useQuery(
    api.webhook_endpoints.query.getSummary,
    wallet.address
      ? {
          projectId: projectId as Id<"projects">,
          ownerAddress: wallet.address,
        }
      : "skip",
  );
  const markPending = useMutation(api.projects.mutation.markRegistrationPending);
  const markSynced = useMutation(api.projects.mutation.markRegistrationSynced);
  const markStale = useMutation(api.projects.mutation.markRegistrationStale);
  const markError = useMutation(api.projects.mutation.markRegistrationError);
  const generateApiKey = useMutation(api.projects.mutation.generateApiKey);
  const revokeApiKey = useMutation(api.projects.mutation.revokeApiKey);
  const markPaymentAccessActive = useMutation(api.projects.mutation.markPaymentAccessActive);

  const apiKeys = useQuery(
    api.projects.query.listApiKeys,
    wallet.address
      ? {
          projectId: projectId as Id<"projects">,
          ownerAddress: wallet.address,
        }
      : "skip",
  );

  const [isRegistering, setIsRegistering] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isRevokingKey, setIsRevokingKey] = useState(false);
  const [isActivatingPayments, setIsActivatingPayments] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [apiKeyLabel, setApiKeyLabel] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!wallet.address) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold">Owner project</h1>
        <Alert>
          <WalletIcon />
          <AlertTitle>Connect the owner wallet</AlertTitle>
          <AlertDescription>
            Private project state loads only after wallet ownership is verified.
          </AlertDescription>
        </Alert>
        <Button onClick={wallet.connect} className="w-fit">
          <WalletIcon />
          Connect wallet
        </Button>
      </section>
    );
  }

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
        <h1 className="text-3xl font-semibold tracking-normal">Project unavailable</h1>
        <p className="text-sm text-zinc-600">
          The project does not exist or the connected wallet is not its owner.
        </p>
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
  const activeContractCount =
    contracts?.filter((contract) => contract.status === "active").length ?? 0;
  const demoReadiness = getDemoReadiness({
    project: currentProject,
    activeContractCount,
    eventCount: recentActivity?.events.length ?? 0,
    webhookConfigured: webhookSummary?.configured ?? false,
    deliveryCount: webhookSummary?.recentCount ?? 0,
  });
  const readinessLoading =
    ownerMatches &&
    (contracts === undefined || recentActivity === undefined || webhookSummary === undefined);

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
      setLocalError("Set NEXT_PUBLIC_VELO_REGISTRY_CONTRACT_ID before registration.");
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

  async function handleGenerateKey(label: string) {
    if (!wallet.address) return;
    if (!label.trim()) {
      setLocalError("Please provide a label for the API Key.");
      return;
    }
    setIsGeneratingKey(true);
    setNewRawKey(null);
    setLocalError(null);
    try {
      const result = await generateApiKey({
        id: currentProject._id,
        ownerAddress: wallet.address,
        label: label.trim(),
      });
      setNewRawKey(result.rawKey);
      setApiKeyLabel("");
    } catch (err) {
      console.error(err);
      setLocalError("Failed to generate API Key.");
    } finally {
      setIsGeneratingKey(false);
    }
  }

  async function handleRevokeKey(keyId: Id<"apiKeys">) {
    if (!wallet.address) return;
    if (
      !window.confirm(
        "Are you sure you want to revoke this API key? This action will instantly disable access for any clients using it.",
      )
    ) {
      return;
    }
    setIsRevokingKey(true);
    setLocalError(null);
    try {
      await revokeApiKey({
        keyId,
        projectId: currentProject._id,
        ownerAddress: wallet.address,
      });
      setNewRawKey(null);
    } catch (err) {
      console.error(err);
      setLocalError("Failed to revoke API Key.");
    } finally {
      setIsRevokingKey(false);
    }
  }

  async function handleActivatePayments() {
    if (!wallet.address) {
      setLocalError("Connect your wallet before activating Velo Pay.");
      return;
    }
    if (!currentProject.registryProjectId) {
      setLocalError("Register the project on-chain first.");
      return;
    }
    if (!stellarConfig.payAccessContractId) {
      setLocalError("Set NEXT_PUBLIC_VELO_PAY_ACCESS_CONTRACT_ID before activation.");
      return;
    }

    setIsActivatingPayments(true);
    setLocalError(null);

    try {
      const transactionXdr = await buildActivatePaymentsTransaction({
        rpcUrl: stellarConfig.rpcUrl,
        networkPassphrase: stellarConfig.networkPassphrase,
        payAccessContractId: stellarConfig.payAccessContractId,
        sourcePublicKey: wallet.address,
        registryProjectId: currentProject.registryProjectId,
      });

      const signedXdr = await wallet.signTransaction(transactionXdr);
      const transactionHash = await submitSignedTransaction({
        rpcUrl: stellarConfig.rpcUrl,
        networkPassphrase: stellarConfig.networkPassphrase,
        signedXdr,
      });

      const confirmation = await confirmActivatePayments({
        rpcUrl: stellarConfig.rpcUrl,
        transactionHash,
      });

      if (confirmation.status === "error") {
        setLocalError(`Activation failed: ${confirmation.message}`);
        return;
      }

      await markPaymentAccessActive({
        id: currentProject._id,
        ownerAddress: wallet.address,
      });
    } catch (error) {
      setLocalError(`Activation error: ${errorMessage(error)}`);
    } finally {
      setIsActivatingPayments(false);
    }
  }

  function copyEndpoint(path: string) {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
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

      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">DemoPay readiness</h2>
            <p className="text-sm text-zinc-600">
              Complete this owner flow before the timed demo. No database edits are required.
            </p>
          </div>
          <p className="text-sm font-medium" aria-live="polite">
            {readinessLoading
              ? "Checking readiness..."
              : `${demoReadiness.completedCount} of ${demoReadiness.totalCount} complete`}
          </p>
        </div>
        <Progress value={demoReadiness.percent} aria-label="DemoPay readiness progress" />
        <ol className="grid gap-2 md:grid-cols-2">
          {demoReadiness.items.map((item) => {
            const href = item.href?.startsWith("/")
              ? item.href
              : item.href
                ? `/projects/${currentProject._id}/${item.href}`
                : undefined;

            return (
              <li key={item.id} className="flex gap-3 border border-zinc-200 p-3">
                {item.complete ? (
                  <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleIcon className="mt-0.5 size-5 shrink-0 text-zinc-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{item.label}</span>
                    {!item.complete && href ? (
                      <Button variant="outline" size="xs" asChild>
                        <Link href={href}>Continue</Link>
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">{item.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DetailRow
          label="Owner wallet"
          value={currentProject.ownerAddress}
          copyValue={currentProject.ownerAddress}
        />
        <DetailRow
          label="Metadata hash"
          value={currentProject.metadataHash}
          copyValue={currentProject.metadataHash}
        />
        <DetailRow
          label="Transaction hash"
          value={currentProject.registrationTxHash ?? "Not submitted"}
          copyValue={currentProject.registrationTxHash}
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
          <div className="overflow-x-auto w-full">
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
                        <div className="flex items-start gap-1">
                          <span className="min-w-0 flex-1">{contract.contractId}</span>
                          <CopyButton value={contract.contractId} label="contract ID" />
                        </div>
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
          </div>
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
        {ownerMatches && recentActivity === undefined ? (
          <div className="space-y-3 p-5" aria-label="Loading recent activity">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <EventActivityTable
            events={recentActivity?.events ?? []}
            emptyMessage={
              wallet.address
                ? "No recent events cached for this project."
                : "Connect the owner wallet to view dashboard activity."
            }
          />
        )}
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
        {ownerMatches && webhookSummary === undefined ? (
          <div className="grid gap-3 p-4 sm:grid-cols-3" aria-label="Loading webhook summary">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
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
        )}
      </div>

      {/* Velo Pay Access Card */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm hover:shadow duration-200">
        <div className="flex flex-col gap-2 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-normal flex items-center gap-1.5">
                <SendIcon className="size-4.5 text-zinc-500" />
                Velo Pay Access
              </h2>
              <Badge variant={currentProject.paymentAccessActive ? "success" : "gray"}>
                {currentProject.paymentAccessActive ? "active" : "inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              {currentProject.paymentAccessActive
                ? `Payment access is active on-chain • ${currentProject.checkoutCredits ?? 100} checkout credits remaining`
                : "Activate on-chain payment access to enable hosted checkout pages and payment processing."}
            </p>
          </div>
          <div className="flex gap-2">
            {currentProject.status !== "registered" ? (
              <span className="text-xs text-zinc-400 self-center">Register project first</span>
            ) : currentProject.paymentAccessActive ? (
              <span className="text-xs text-emerald-600 font-medium self-center flex items-center gap-1">
                <CheckCircle2Icon className="size-4" /> Ready to process payments
              </span>
            ) : (
              <Button
                size="sm"
                onClick={handleActivatePayments}
                disabled={isActivatingPayments}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isActivatingPayments ? (
                  <>
                    <RefreshCwIcon className="mr-1.5 size-4 animate-spin" />
                    Activating...
                  </>
                ) : (
                  <>
                    <SendIcon className="mr-1.5 size-4" />
                    Activate Velo Pay
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* API Key Access Section */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm hover:shadow duration-200">
        <div className="p-4 border-b border-zinc-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold tracking-normal flex items-center gap-1.5">
                <KeyIcon className="size-4.5 text-zinc-500" />
                API keys
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Generate and manage API keys to access Velo services programmatically.
              </p>
            </div>

            <div className="flex items-center gap-2 max-w-md w-full sm:w-auto">
              <input
                type="text"
                placeholder="Key label (e.g. Production)"
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isGeneratingKey}
                aria-label="API key label"
              />
              <Button
                size="sm"
                onClick={() => handleGenerateKey(apiKeyLabel)}
                disabled={isGeneratingKey || !apiKeyLabel.trim()}
                className="whitespace-nowrap"
              >
                <KeyIcon className="mr-1.5 size-4" />
                {isGeneratingKey ? "Generating..." : "Generate key"}
              </Button>
            </div>
          </div>
        </div>

        {/* Display newly generated raw API key (one-time show) */}
        {newRawKey && (
          <div className="border-b border-zinc-200 bg-zinc-50 p-4">
            <Alert className="border-emerald-200 bg-emerald-50/50 text-emerald-950">
              <KeyIcon className="size-5 text-emerald-600" />
              <AlertTitle className="font-semibold text-emerald-900">Save your API Key</AlertTitle>
              <AlertDescription className="text-emerald-800">
                <p className="mb-3 text-xs leading-relaxed text-emerald-900">
                  Please copy this key and save it securely. For security reasons, you will **not**
                  be able to see it again after closing this box or refreshing the page.
                </p>
                <div className="flex items-center gap-2 rounded border border-emerald-200 bg-white p-2.5 font-mono text-xs font-semibold text-zinc-900 shadow-sm break-all">
                  <span className="min-w-0 flex-1 select-all">{newRawKey}</span>
                  <CopyButton value={newRawKey} label="API key" size="sm" />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 bg-white text-zinc-800 hover:bg-zinc-100 hover:text-zinc-900 border-zinc-200"
                  onClick={() => setNewRawKey(null)}
                >
                  I have copied the key
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* List of keys */}
        <div className="p-0 overflow-x-auto">
          {apiKeys === undefined ? (
            <div className="p-4 text-center text-sm text-zinc-500">Loading keys...</div>
          ) : apiKeys.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              No API keys generated yet. Use the form above to create your first key.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key._id}>
                    <TableCell className="font-medium text-sm">{key.label}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">{key.prefix}</TableCell>
                    <TableCell>
                      <Badge variant={key.revoked ? "gray" : "success"}>
                        {key.revoked ? "revoked" : "active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {formatTimestamp(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      <div>{key.requestCount} requests</div>
                      {key.lastUsedAt && (
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Last used {formatTimestamp(key.lastUsedAt)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!key.revoked && (
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleRevokeKey(key._id)}
                          disabled={isRevokingKey}
                        >
                          <Trash2Icon className="mr-1 size-3" />
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Available endpoints list */}
        {apiKeys && apiKeys.some((k) => !k.revoked) && (
          <div className="p-4 bg-zinc-50/40 border-t border-zinc-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
              Available API endpoints
            </h3>
            <div className="grid gap-2.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-2.5 rounded border border-zinc-100 bg-white">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800 font-mono mr-2">
                    GET
                  </span>
                  <span className="font-mono text-xs text-zinc-700">/api/v1/events</span>
                  <p className="text-xs text-zinc-500 mt-1">
                    Retrieve recent contract events observed for this project.
                  </p>
                </div>
                <Button variant="outline" size="xs" onClick={() => copyEndpoint("/api/v1/events")}>
                  Copy URL
                </Button>
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-2.5 rounded border border-zinc-100 bg-white">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800 font-mono mr-2">
                    GET
                  </span>
                  <span className="font-mono text-xs text-zinc-700">
                    /api/v1/transactions/[hash]
                  </span>
                  <p className="text-xs text-zinc-500 mt-1">
                    Lookup a Stellar transaction by its hash.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => copyEndpoint("/api/v1/transactions/[hash]")}
                >
                  Copy URL
                </Button>
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-2.5 rounded border border-zinc-100 bg-white">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800 font-mono mr-2">
                    GET
                  </span>
                  <span className="font-mono text-xs text-zinc-700">
                    /api/v1/webhooks/deliveries
                  </span>
                  <p className="text-xs text-zinc-500 mt-1">
                    Check recent webhook delivery attempts.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => copyEndpoint("/api/v1/webhooks/deliveries")}
                >
                  Copy URL
                </Button>
              </div>
            </div>
          </div>
        )}
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
        <Button
          variant="outline"
          asChild={currentProject.paymentAccessActive ? true : undefined}
          className={!currentProject.paymentAccessActive ? "opacity-50 cursor-not-allowed" : ""}
          onClick={
            !currentProject.paymentAccessActive
              ? () => setLocalError("Activate Velo Pay to configure Webhooks.")
              : undefined
          }
        >
          {currentProject.paymentAccessActive ? (
            <Link href={`/projects/${currentProject._id}/webhooks`}>
              <WebhookIcon />
              Webhooks
            </Link>
          ) : (
            <span className="flex items-center gap-2">
              <WebhookIcon className="opacity-50" />
              Webhooks (Inactive)
            </span>
          )}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/verify/${currentProject.slug}`}>
            <ExternalLinkIcon />
            Public proof
          </Link>
        </Button>
        <CopyButton value={`/verify/${currentProject.slug}`} label="public proof URL" size="sm" />
      </div>
    </section>
  );
}
