"use client";

import { api } from "@repo/backend/convex/_generated/api";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useQuery } from "convex/react";
import { CheckCircle2Icon, ExternalLinkIcon, ArrowLeftIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type SuccessClientProps = {
  paymentIntentId: string;
};

const REDIRECT_DELAY_SECONDS = 5;

function shortenHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export function SuccessClient({ paymentIntentId }: SuccessClientProps) {
  const intentId = paymentIntentId as Id<"paymentIntents">;
  const intent = useQuery(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId: intentId,
  });

  const [timeLeft, setTimeLeft] = useState(REDIRECT_DELAY_SECONDS);

  // Auto-redirect effect when successUrl is present
  useEffect(() => {
    if (!intent || intent.status !== "paid" || !intent.successUrl) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = intent.successUrl!;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [intent]);

  // ─── Loading ───
  if (intent === undefined) {
    return (
      <Shell>
        <Card className="w-full max-w-md bg-card/85 border border-border/50">
          <CardHeader className="text-center">
            <Skeleton className="mx-auto h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto mt-4 h-6 w-40" />
            <Skeleton className="mx-auto mt-2 h-4 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full rounded-lg" />
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // ─── Not found or not paid ───
  if (!intent || intent.status !== "paid") {
    return (
      <Shell>
        <Card className="w-full max-w-md border-destructive/30 bg-card/90 backdrop-blur-md">
          <CardHeader className="text-center">
            <CardTitle className="text-lg font-bold">Payment Status Unconfirmed</CardTitle>
            <CardDescription>
              We couldn't confirm that this payment has been completed.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" asChild className="cursor-pointer rounded-xl">
              <Link href={`/pay/${paymentIntentId}`}>
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Back to Checkout
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </Shell>
    );
  }

  const explorerUrl = intent.txHash
    ? `https://stellar.expert/explorer/testnet/tx/${intent.txHash}`
    : null;

  return (
    <Shell>
      <Card className="w-full max-w-md bg-card/80 border border-white/10 shadow-2xl backdrop-blur-lg">
        <CardHeader className="text-center">
          {/* Animated success check icon */}
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/20 animate-in zoom-in duration-500">
            <CheckCircle2Icon className="h-9 w-9 text-green-500 animate-pulse" />
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-foreground to-foreground/80">
            Payment Completed
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm mt-2">
            Successfully paid{" "}
            <span className="font-semibold text-foreground">
              {Number.parseFloat(intent.amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              })}{" "}
              {intent.asset === "native" ? "XLM" : intent.asset.split(":")[0]}
            </span>{" "}
            to <span className="font-semibold text-foreground">{intent.merchantName}</span>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Transaction details card */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
            {intent.txHash && (
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground font-medium">Stellar Transaction</span>
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  >
                    {shortenHash(intent.txHash)}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="font-mono text-xs">{shortenHash(intent.txHash)}</span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground font-medium">Status</span>
              <Badge variant="success" className="rounded-full px-2 py-0.5 font-bold">Paid</Badge>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground font-medium">Network</span>
              <span className="font-semibold text-foreground">Stellar Testnet</span>
            </div>
          </div>

          {/* Auto-redirect Timer message */}
          {intent.successUrl && timeLeft > 0 && (
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground bg-muted/40 rounded-lg py-2 px-3">
              <ClockIcon className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: '4s' }} />
              <span>Redirecting to merchant's site in {timeLeft}s...</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 border-t border-border/50 pt-4">
          {intent.successUrl ? (
            <Button className="w-full h-11 text-sm font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-md rounded-xl cursor-pointer" asChild>
              <a href={intent.successUrl}>Return to Merchant Immediately</a>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              No redirect URL configured. You can now close this tab.
            </p>
          )}

          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors hover:underline mt-1"
            >
              Verify on Stellar Expert Explorer
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          )}
        </CardFooter>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background/95 to-slate-900/50 p-4">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-6 duration-500">
        {children}
      </div>
    </div>
  );
}
