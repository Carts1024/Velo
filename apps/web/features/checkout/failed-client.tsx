"use client";

import { api } from "@repo/backend/convex/_generated/api";
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
import { AlertCircleIcon, ArrowRightIcon, RefreshCwIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type FailedClientProps = {
  paymentIntentId: string;
};

const REDIRECT_DELAY_SECONDS = 5;

export function FailedClient({ paymentIntentId }: FailedClientProps) {
  const intentId = paymentIntentId as Id<"paymentIntents">;
  const intent = useQuery(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId: intentId,
  });

  const [timeLeft, setTimeLeft] = useState(REDIRECT_DELAY_SECONDS);

  // Auto-redirect effect when cancelUrl (or redirect URL on failure/cancel) is present
  useEffect(() => {
    if (!intent || intent.status !== "failed" || !intent.cancelUrl) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = intent.cancelUrl!;
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
            <Skeleton className="mx-auto h-14 w-14 rounded-full" />
            <Skeleton className="mx-auto mt-3 h-5 w-36" />
            <Skeleton className="mx-auto mt-2 h-4 w-52" />
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  // ─── Not found ───
  if (!intent) {
    return (
      <Shell>
        <Card className="w-full max-w-md border-destructive/30 bg-card/90 backdrop-blur-md">
          <CardHeader className="text-center">
            <CardTitle className="text-lg font-bold">Payment Not Found</CardTitle>
            <CardDescription>This payment link is invalid or has been removed.</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="w-full max-w-md bg-card/80 border border-white/10 shadow-2xl backdrop-blur-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 border border-destructive/20 animate-in zoom-in duration-500">
            <AlertCircleIcon className="h-7 w-7 text-destructive" />
          </div>
          <CardTitle className="text-xl font-bold bg-clip-text bg-gradient-to-r from-foreground to-foreground/80">
            Payment Failed
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm mt-2">
            Your payment of{" "}
            <span className="font-semibold text-foreground">
              {Number.parseFloat(intent.amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              })}{" "}
              {intent.asset === "native" ? "XLM" : intent.asset.split(":")[0]}
            </span>{" "}
            to <span className="font-semibold text-foreground">{intent.merchantName}</span> could
            not be processed.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Auto-redirect Timer message */}
          {intent.cancelUrl && timeLeft > 0 && (
            <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground bg-muted/40 rounded-lg py-2 px-3">
              <ClockIcon className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "4s" }} />
              <span>Redirecting to merchant's site in {timeLeft}s...</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 border-t border-border/50 pt-4">
          {/* Retry payment button */}
          <Button
            className="w-full h-11 text-sm font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-md rounded-xl cursor-pointer"
            asChild
          >
            <Link href={`/pay/${paymentIntentId}`}>
              <RefreshCwIcon className="mr-2 h-4 w-4" />
              Retry Checkout Session
            </Link>
          </Button>

          {intent.cancelUrl ? (
            <Button
              variant="outline"
              className="w-full h-11 text-sm font-bold rounded-xl cursor-pointer"
              asChild
            >
              <a href={intent.cancelUrl}>
                Return to Merchant Immediately
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              No merchant redirect URL configured. You can now close this tab.
            </p>
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
