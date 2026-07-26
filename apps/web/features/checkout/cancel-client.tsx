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
import { ArrowRightIcon, ClockIcon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type CancelClientProps = {
  paymentIntentId: string;
};

const REDIRECT_DELAY_SECONDS = 5;

export function CancelClient({ paymentIntentId }: CancelClientProps) {
  const intentId = paymentIntentId as Id<"paymentIntents">;
  const intent = useQuery(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId: intentId,
  });

  const [timeLeft, setTimeLeft] = useState(REDIRECT_DELAY_SECONDS);

  // Auto-redirect effect when cancelUrl is present
  useEffect(() => {
    if (!intent || intent.status !== "cancelled" || !intent.cancelUrl) return;

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
        <Card className="w-full max-w-md border border-border/50 bg-card/85">
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
      <Card className="w-full max-w-md border border-white/10 bg-card/80 shadow-2xl backdrop-blur-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 animate-in items-center justify-center rounded-full border border-slate-500/20 bg-slate-500/10 duration-500 zoom-in">
            <XCircleIcon className="h-7 w-7 text-slate-500" />
          </div>
          <CardTitle className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-xl font-bold">
            Payment Cancelled
          </CardTitle>
          <CardDescription className="mt-2 text-sm text-muted-foreground">
            Your payment of{" "}
            <span className="font-semibold text-foreground">
              {Number.parseFloat(intent.amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              })}{" "}
              {intent.asset === "native" ? "XLM" : intent.asset.split(":")[0]}
            </span>{" "}
            to <span className="font-semibold text-foreground">{intent.merchantName}</span> has been
            cancelled.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Auto-redirect Timer message */}
          {intent.cancelUrl && timeLeft > 0 && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <ClockIcon className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "4s" }} />
              <span>Redirecting to merchant's site in {timeLeft}s...</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 border-t border-border/50 pt-4">
          {intent.cancelUrl ? (
            <Button
              className="h-11 w-full cursor-pointer rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/95"
              asChild
            >
              <a href={intent.cancelUrl}>
                Return to Merchant to Try Again
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              This checkout session cannot be reused. To try again, request a new payment link from
              the merchant.
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
      <div className="w-full max-w-md animate-in duration-500 fade-in slide-in-from-bottom-6">
        {children}
      </div>
    </div>
  );
}
