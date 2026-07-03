"use client";

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
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useQuery, useConvexAuth } from "convex/react";
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  FileCheckIcon,
  FolderPlusIcon,
  GaugeIcon,
  KeyRoundIcon,
  LinkIcon,
  PlugZapIcon,
  RadioTowerIcon,
  WalletIcon,
  WebhookIcon,
} from "lucide-react";
import Link from "next/link";

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
  icon: React.ElementType;
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

export function ProjectDashboard() {
  const wallet = useWallet();
  const { isAuthenticated } = useConvexAuth();
  const summary = useQuery(
    api.projects.query.getDashboardSummary,
    wallet.address && isAuthenticated ? {} : "skip",
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

  if (summary === undefined) {
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

  const webhookRate =
    summary.webhooks.recentDeliveries > 0
      ? Math.round(
          (summary.webhooks.successfulDeliveries / summary.webhooks.recentDeliveries) * 100,
        )
      : 100;
  const paidRate =
    summary.payments.recent > 0
      ? Math.round((summary.payments.paid / summary.payments.recent) * 100)
      : 0;
  const firstProject = summary.recentProjects[0];

  if (summary.projects.total === 0) {
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
              <FolderPlusIcon />
            </EmptyMedia>
            <EmptyTitle>Create your first project</EmptyTitle>
            <EmptyDescription>
              Projects unlock contract verification, event tracking, webhook delivery, and payment
              telemetry.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/projects/new">
                <FolderPlusIcon />
                New project
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Telemetry for {shortenAddress(wallet.address)} across project setup, contracts, events,
            webhooks, and payments.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <FolderPlusIcon />
            New project
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Projects"
          value={summary.projects.total}
          detail={`${summary.projects.registered} registered, ${summary.projects.pending} pending, ${summary.projects.errors} errors`}
          icon={GaugeIcon}
        />
        <MetricCard
          title="Contracts"
          value={summary.contracts.active}
          detail={`${summary.contracts.total} tracked contracts across selected projects`}
          icon={FileCheckIcon}
        />
        <MetricCard
          title="Events"
          value={summary.events.recent}
          detail={`Last observed: ${formatTime(summary.events.lastObservedAt)}`}
          icon={RadioTowerIcon}
        />
        <MetricCard
          title="Webhook health"
          value={`${webhookRate}%`}
          detail={`${summary.webhooks.successfulDeliveries} successful, ${summary.webhooks.failedDeliveries} failed attempts`}
          icon={WebhookIcon}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-5">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">Recent projects</h2>
              <p className="text-sm text-zinc-600">Project picker remains in the sidebar.</p>
            </div>
            <Badge variant="info">{summary.projects.draft} draft</Badge>
          </div>
          <div className="divide-y divide-zinc-200">
            {summary.recentProjects.map((project) => (
              <Link
                key={project._id}
                href={`/projects/${project._id}`}
                className="flex flex-col gap-3 p-5 transition-colors hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-950">{project.name}</span>
                    <Badge variant={statusVariant[project.status]}>
                      {statusLabel[project.status]}
                    </Badge>
                    {project.paymentAccessActive ? (
                      <Badge variant="success">
                        <CheckCircle2Icon className="size-3" />
                        Payments active
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">/{project.slug}</p>
                </div>
                <span className="flex items-center gap-1 text-sm text-zinc-600">
                  Updated {new Date(project.updatedAt).toLocaleDateString()}
                  <ArrowRightIcon className="size-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ActivityIcon className="size-5 text-zinc-700" />
              <h2 className="text-lg font-semibold tracking-normal">Payment activity</h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="text-zinc-600">Recent intents</p>
                <p className="mt-1 text-2xl font-semibold">{summary.payments.recent}</p>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="text-zinc-600">Paid rate</p>
                <p className="mt-1 text-2xl font-semibold">{paidRate}%</p>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="text-zinc-600">Pending</p>
                <p className="mt-1 text-2xl font-semibold">{summary.payments.pending}</p>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <p className="text-zinc-600">Failed</p>
                <p className="mt-1 text-2xl font-semibold">{summary.payments.failed}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <PlugZapIcon className="size-5 text-zinc-700" />
              <h2 className="text-lg font-semibold tracking-normal">Setup actions</h2>
            </div>
            <div className="mt-4 grid gap-2">
              <Button variant="outline" className="justify-start" asChild disabled={!firstProject}>
                <Link
                  href={firstProject ? `/projects/${firstProject._id}/contracts` : "/dashboard"}
                >
                  <FileCheckIcon />
                  Manage contracts
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild disabled={!firstProject}>
                <Link href={firstProject ? `/projects/${firstProject._id}/webhooks` : "/dashboard"}>
                  <WebhookIcon />
                  Configure webhooks
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild disabled={!firstProject}>
                <Link
                  href={firstProject ? `/projects/${firstProject._id}/integration` : "/dashboard"}
                >
                  <KeyRoundIcon />
                  Integration keys
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/debug">
                  <LinkIcon />
                  Debug transaction
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
