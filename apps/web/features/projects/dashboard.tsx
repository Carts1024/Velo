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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useQuery } from "convex/react";
import { FolderPlusIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
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

export function ProjectDashboard() {
  const wallet = useWallet();
  const projects = useQuery(
    api.projects.query.listByOwner,
    wallet.address ? { ownerAddress: wallet.address } : "skip",
  );

  if (!wallet.address) {
    return (
      <section className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Projects</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Connect a Stellar Testnet wallet to create owner-scoped draft projects.
          </p>
        </div>
        <Empty className="border border-zinc-200 bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WalletIcon />
            </EmptyMedia>
            <EmptyTitle>No connected owner wallet</EmptyTitle>
            <EmptyDescription>
              Wallet state controls the project list. Rejected, disconnected, unsupported, and stale
              sessions stay visible in the shell.
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

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Projects</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Projects for {shortenAddress(wallet.address)} with registration and contract proof
            status.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <FolderPlusIcon />
            New project
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        {projects === undefined ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : projects.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderPlusIcon />
              </EmptyMedia>
              <EmptyTitle>No draft projects</EmptyTitle>
              <EmptyDescription>
                Create DemoPay or another Stellar app profile before registering it on-chain.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/projects/new">Create project</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-x-auto w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Metadata hash</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project._id}>
                    <TableCell className="font-medium">
                      <Link
                        className="underline-offset-4 hover:underline"
                        href={`/projects/${project._id}`}
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>{project.slug}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[project.status]}>
                        {statusLabel[project.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {project.metadataHash.slice(0, 16)}...
                    </TableCell>
                    <TableCell className="text-right text-sm text-zinc-600">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <RefreshCwIcon className="size-4" />
        Project data is scoped by connected owner wallet and updates through Convex.
      </div>
    </section>
  );
}
