"use client";

import { useSelectedProject } from "@/core/app-shell";
import { shortenAddress } from "@/core/wallet/format";
import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import { Progress } from "@repo/ui/components/ui/progress";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useQuery } from "convex/react";
import {
  ActivityIcon,
  CheckCircle2Icon,
  CircleIcon,
  FileCheckIcon,
  GaugeIcon,
  RadioTowerIcon,
  WalletIcon,
  WebhookIcon,
} from "lucide-react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";
import type { ElementType } from "react";

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

type MetricCardProps = {
  title: string;
  value: string | number;
  detail: string;
  icon: ElementType;
};

function MetricCard({ title, value, detail, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-600">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-sm text-zinc-600">{detail}</p>
    </div>
  );
}

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString() : "No activity yet";
}

function formatVolume(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

export function ProjectDashboard() {
  const wallet = useWallet();
  const { selectedProjectId, projectCount, projectsLoaded } = useSelectedProject();
  const typedProjectId = selectedProjectId as Id<"projects"> | null;

  const project = useQuery(
    api.projects.query.getById,
    wallet.address && projectsLoaded && typedProjectId ? { id: typedProjectId } : "skip",
  );
  const contracts = useQuery(
    api.project_contracts.query.listByProject,
    wallet.address && projectsLoaded && typedProjectId ? { projectId: typedProjectId } : "skip",
  );
  const activity = useQuery(
    api.contract_events.query.listByProject,
    wallet.address && projectsLoaded && typedProjectId
      ? { projectId: typedProjectId, limit: 5 }
      : "skip",
  );
  const webhookSummary = useQuery(
    api.webhook_endpoints.query.getSummary,
    wallet.address && projectsLoaded && typedProjectId ? { projectId: typedProjectId } : "skip",
  );
  const stats = useQuery(
    api.payment_intents.queries.getProjectStats,
    wallet.address && projectsLoaded && typedProjectId ? { projectId: typedProjectId } : "skip",
  );

  if (!wallet.address) {
    return (
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Connect a Stellar Testnet wallet to view project telemetry and setup status.
          </p>
        </div>
        <Empty className="border border-zinc-200 bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WalletIcon />
            </EmptyMedia>
            <EmptyTitle>No connected owner wallet</EmptyTitle>
            <EmptyDescription>
              Wallet ownership controls project telemetry, contract status, and payment activity.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={wallet.connect}>
              <WalletIcon />
              Connect wallet
            </Button>
          </EmptyContent>
        </Empty>
      </section>
    );
  }

  if (!projectsLoaded) {
    return (
      <section className="grid gap-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (projectCount === 0) {
    return (
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            No owner projects found for {shortenAddress(wallet.address)}.
          </p>
        </div>
        <Empty className="border border-zinc-200 bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No projects available</EmptyTitle>
            <EmptyDescription>
              Create a project from the sidebar project switcher to start collecting telemetry.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  if (!selectedProjectId) {
    return (
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Select a project from the sidebar project switcher to view its telemetry.
          </p>
        </div>
        <Empty className="border border-zinc-200 bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No selected project</EmptyTitle>
            <EmptyDescription>
              Dashboard metrics are scoped to the current sidebar project selection.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  if (
    project === undefined ||
    contracts === undefined ||
    activity === undefined ||
    webhookSummary === undefined ||
    stats === undefined
  ) {
    return (
      <section className="grid gap-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (project === null) {
    return (
      <section className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-normal">Project unavailable</h1>
        <p className="max-w-2xl text-sm text-zinc-600">
          The selected project does not exist or the connected wallet is not its owner. Choose a
          valid project from the sidebar project switcher.
        </p>
      </section>
    );
  }

  const events = activity?.events ?? [];
  const activeContractCount = contracts.filter((contract) => contract.status === "active").length;
  const webhookRate = webhookSummary?.recentCount
    ? Math.round(((webhookSummary.successCount ?? 0) / webhookSummary.recentCount) * 100)
    : 100;
  const totalPayments = stats?.counts.total ?? 0;
  const paidPayments = stats?.counts.paid ?? 0;
  const paidRate = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0;
  const lastObservedAt = events[0]?.observedAt;
  const readiness = getDemoReadiness({
    project,
    activeContractCount,
    eventCount: events.length,
    webhookConfigured: webhookSummary?.configured ?? false,
    deliveryCount: webhookSummary?.recentCount ?? 0,
  });
  const recentEvents = events.map((event) => ({
    eventId: event.eventId,
    contractId: event.contractId,
    transactionHash: event.transactionHash,
    ledger: event.ledger,
    timestamp: event.timestamp,
    topic: event.topic,
    type: event.type,
    decoded: event.decoded,
    observedAt: event.observedAt,
  }));

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
            <Badge variant={statusVariant[project.status]}>{statusLabel[project.status]}</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Telemetry for {project.name} /{project.slug}, owned by{" "}
            {shortenAddress(project.ownerAddress)}.
          </p>
        </div>
        {project.paymentAccessActive ? (
          <Badge variant="success">
            <CheckCircle2Icon className="size-3" />
            Payments active
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Contracts"
          value={activeContractCount}
          detail={`${contracts.length} tracked contracts for this project`}
          icon={FileCheckIcon}
        />
        <MetricCard
          title="Events"
          value={events.length}
          detail={`Last observed: ${formatTime(lastObservedAt)}`}
          icon={RadioTowerIcon}
        />
        <MetricCard
          title="Webhook health"
          value={`${webhookRate}%`}
          detail={`${webhookSummary?.successCount ?? 0} successful, ${webhookSummary?.failedCount ?? 0} failed recent deliveries`}
          icon={WebhookIcon}
        />
        <MetricCard
          title="Payments"
          value={totalPayments}
          detail={`${paidRate}% paid conversion across this project`}
          icon={ActivityIcon}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-5 text-zinc-700" />
            <h2 className="text-lg font-semibold tracking-normal">Payment activity</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-zinc-600">Paid</p>
              <p className="mt-1 text-2xl font-semibold">{paidPayments}</p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-zinc-600">Pending</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.counts.pending ?? 0}</p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-zinc-600">Created</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.counts.created ?? 0}</p>
            </div>
            <div className="rounded-md bg-zinc-50 p-3">
              <p className="text-zinc-600">Failed</p>
              <p className="mt-1 text-2xl font-semibold">{stats?.counts.failed ?? 0}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 text-sm">
            <p className="font-medium text-zinc-950">Paid volume</p>
            {stats?.volumes.length ? (
              stats.volumes.map((volume) => (
                <div
                  key={volume.asset}
                  className="flex items-center justify-between gap-3 text-zinc-600"
                >
                  <span>{volume.asset}</span>
                  <span className="font-mono text-zinc-950">{formatVolume(volume.volume)}</span>
                </div>
              ))
            ) : (
              <p className="text-zinc-600">No paid payment volume yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <WebhookIcon className="size-5 text-zinc-700" />
            <h2 className="text-lg font-semibold tracking-normal">Webhook health</h2>
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-600">Endpoint</span>
              <Badge variant={webhookSummary?.configured ? "success" : "gray"}>
                {webhookSummary?.configured ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-600">Delivery status</span>
              <Badge variant={webhookSummary?.enabled ? "success" : "warning"}>
                {webhookSummary?.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-600">Destination</span>
              <span className="max-w-64 truncate text-right font-mono text-xs text-zinc-950">
                {webhookSummary?.destinationHost ?? "No host"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-600">Recent deliveries</span>
              <span className="font-medium text-zinc-950">{webhookSummary?.recentCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-600">Average latency</span>
              <span className="font-medium text-zinc-950">
                {Math.round(stats?.webhooks.averageLatency ?? 0)}ms
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <GaugeIcon className="size-5 text-zinc-700" />
            <h2 className="text-lg font-semibold tracking-normal">Project readiness</h2>
          </div>
          <div className="mt-4 grid gap-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-zinc-600">Completion</span>
                <span className="font-medium text-zinc-950">
                  {readiness.completedCount}/{readiness.totalCount} steps
                </span>
              </div>
              <Progress value={readiness.percent} />
            </div>
            <div className="grid gap-3">
              {readiness.items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 text-sm">
                  {item.complete ? (
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                  )}
                  <div>
                    <p className="font-medium text-zinc-950">{item.label}</p>
                    <p className="text-zinc-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-5">
            <div className="flex items-center gap-2">
              <RadioTowerIcon className="size-5 text-zinc-700" />
              <h2 className="text-lg font-semibold tracking-normal">Recent events</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-600">Latest cached activity for this project.</p>
          </div>
          <EventActivityTable
            events={recentEvents}
            emptyMessage="No recent events for this project."
          />
        </div>
      </div>
    </section>
  );
}
