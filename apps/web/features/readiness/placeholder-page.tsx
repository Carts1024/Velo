"use client";

import { stellarConfig } from "@/core/config/stellar";
import { VELO_APP_NAME, VELO_APP_TAGLINE } from "@/core/constants";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

type PlaceholderPageProps = {
  title: string;
  eyebrow?: string;
  description: string;
  primaryAction?: {
    href: string;
    label: string;
  };
  secondaryAction?: {
    href: string;
    label: string;
  };
  checklist?: string[];
  status?: "ready" | "pending" | "deferred";
};

const statusVariant = {
  ready: "success",
  pending: "warning",
  deferred: "gray",
} as const;

export function PlaceholderPage({
  title,
  eyebrow = "Phase 1 readiness",
  description,
  primaryAction,
  secondaryAction,
  checklist = [],
  status = "pending",
}: PlaceholderPageProps) {
  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="w-fit">
            <div className="text-lg font-semibold tracking-normal">{VELO_APP_NAME}</div>
            <div className="text-sm text-slate-600">{VELO_APP_TAGLINE}</div>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">{stellarConfig.networkLabel}</Badge>
            <Badge variant={stellarConfig.registryContractId ? "success" : "warning"}>
              {stellarConfig.registryContractId ? "Registry configured" : "Registry pending"}
            </Badge>
          </div>
        </header>

        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <Badge variant={statusVariant[status]} className="w-fit">
              {eyebrow}
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal md:text-5xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">{description}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {primaryAction ? (
              <Button asChild>
                <Link href={primaryAction.href}>
                  {primaryAction.label}
                  <ArrowRightIcon />
                </Link>
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button variant="outline" asChild>
                <Link href={secondaryAction.href}>
                  {secondaryAction.label}
                  <ExternalLinkIcon />
                </Link>
              </Button>
            ) : null}
          </div>
        </section>

        <Alert>
          <AlertTitle>Sprint 0 scaffold</AlertTitle>
          <AlertDescription>
            This screen is intentionally a placeholder. It pins routing, shared UI imports, and
            Testnet configuration before the vertical product slices are implemented.
          </AlertDescription>
        </Alert>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Readiness item</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Public product name</TableCell>
                <TableCell>
                  <Badge variant="success">Velo</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>First wallet target</TableCell>
                <TableCell>
                  <Badge variant="info">{stellarConfig.firstWallet}</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Transaction debugger</TableCell>
                <TableCell>
                  <Badge variant="info">Hash required; XDR deferred</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Webhook signing and retries</TableCell>
                <TableCell>
                  <Badge variant="gray">Deferred</Badge>
                </TableCell>
              </TableRow>
              {checklist.map((item) => (
                <TableRow key={item}>
                  <TableCell>{item}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[status]}>{status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
  );
}
