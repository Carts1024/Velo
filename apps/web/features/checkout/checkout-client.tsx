"use client";

import { stellarConfig, STELLAR_TESTNET_NETWORK_PASSPHRASE } from "@/core/config/stellar";
import { useWallet } from "@/core/wallet/wallet-provider";
import { api } from "@repo/backend/convex/_generated/api";
import { buildCheckoutPaymentTransaction, submitCheckoutTransaction } from "@repo/stellar";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
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
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircleIcon,
  ClockIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  WalletIcon,
  XCircleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Id } from "@repo/backend/convex/_generated/dataModel";

type CheckoutClientProps = {
  paymentIntentId: string;
};

type PaymentStep = "connect" | "review" | "submitting" | "submitted";

function formatAsset(asset: string) {
  if (asset === "native" || asset === "XLM") return "XLM";
  const parts = asset.split(":");
  return parts[0] || asset;
}

function formatAmount(amount: string, asset: string) {
  const num = Number.parseFloat(amount);
  if (Number.isNaN(num)) return `${amount} ${formatAsset(asset)}`;
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} ${formatAsset(asset)}`;
}

function useTimeRemaining(expiresAt: number | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    const update = () => {
      const diff = expiresAt - Date.now();
      setRemaining(Math.max(0, diff));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (remaining === null) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return { remaining, minutes, seconds, expired: remaining <= 0 };
}

export function CheckoutClient({ paymentIntentId }: CheckoutClientProps) {
  const router = useRouter();
  const wallet = useWallet();
  const [step, setStep] = useState<PaymentStep>("connect");
  const [error, setError] = useState<string | null>(null);

  const intentId = paymentIntentId as Id<"paymentIntents">;
  const intent = useQuery(api.payment_intents.queries.getPaymentIntent, {
    paymentIntentId: intentId,
  });

  const updateStatus = useMutation(api.payment_intents.mutations.updateStatus);
  const timer = useTimeRemaining(intent?.expiresAt);

  // Auto-advance step when wallet connects
  useEffect(() => {
    if (wallet.status === "connected" && step === "connect") {
      setStep("review");
    }
  }, [wallet.status, step]);

  // Check if already paid/cancelled/failed to redirect to proper landing screen
  useEffect(() => {
    if (!intent) return;
    if (intent.status === "paid") {
      router.replace(`/pay/${paymentIntentId}/success`);
    } else if (intent.status === "cancelled") {
      router.replace(`/pay/${paymentIntentId}/cancel`);
    } else if (intent.status === "failed") {
      router.replace(`/pay/${paymentIntentId}/failed`);
    }
  }, [intent, paymentIntentId, router]);

  const handlePay = useCallback(async () => {
    if (!intent || !wallet.address) return;

    setError(null);
    setStep("submitting");

    try {
      // 1. Transition to pending state in database
      await updateStatus({
        paymentIntentId: intentId,
        status: "pending",
        payerAddress: wallet.address,
      });

      // 2. Build the payment transaction
      const unsignedXdr = await buildCheckoutPaymentTransaction({
        payerAddress: wallet.address,
        receiverAddress: intent.receiverAddress,
        amount: intent.amount,
        asset: intent.asset,
        networkPassphrase: STELLAR_TESTNET_NETWORK_PASSPHRASE,
        horizonUrl: stellarConfig.horizonUrl,
      });

      // 3. Request signature from connected wallet
      const signedXdr = await wallet.signTransaction(unsignedXdr);

      // 4. Submit signed XDR to Stellar network
      const result = await submitCheckoutTransaction({
        signedXdr,
        horizonUrl: stellarConfig.horizonUrl,
      });

      // 5. Check submission status and transition database state
      if (result.successful) {
        await updateStatus({
          paymentIntentId: intentId,
          status: "paid",
          txHash: result.hash,
        });
        setStep("submitted");
        router.push(`/pay/${paymentIntentId}/success`);
      } else {
        await updateStatus({
          paymentIntentId: intentId,
          status: "failed",
        });
        router.push(`/pay/${paymentIntentId}/failed`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";

      // If user rejected the signing, go back to review step
      if (/reject|denied|cancel/i.test(message)) {
        setStep("review");
        setError("Transaction signing was rejected.");
        // Revert status to created if user rejects transaction
        try {
          await updateStatus({
            paymentIntentId: intentId,
            status: "failed", // transition to failed first, or handle failed screen
          });
          router.push(`/pay/${paymentIntentId}/failed`);
        } catch {
          // ignore status update failures
        }
        return;
      }

      setError(message);
      setStep("review");

      // Update intent status to failed in database
      try {
        await updateStatus({
          paymentIntentId: intentId,
          status: "failed",
        });
        router.push(`/pay/${paymentIntentId}/failed`);
      } catch {
        // ignore status update failures
      }
    }
  }, [intent, wallet, intentId, updateStatus, paymentIntentId, router]);

  const handleCancelClick = useCallback(async () => {
    try {
      await updateStatus({
        paymentIntentId: intentId,
        status: "cancelled",
      });
      router.push(`/pay/${paymentIntentId}/cancel`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel payment");
    }
  }, [intentId, updateStatus, paymentIntentId, router]);

  // ─── Loading state ───
  if (intent === undefined) {
    return <CheckoutSkeleton />;
  }

  // ─── Not found ───
  if (intent === null) {
    return (
      <CheckoutShell>
        <Card className="w-full max-w-md border-destructive/30 bg-card/90 backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <XCircleIcon className="h-7 w-7 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold">Payment Not Found</CardTitle>
            <CardDescription>This payment link is invalid or has been removed.</CardDescription>
          </CardHeader>
        </Card>
      </CheckoutShell>
    );
  }

  // ─── Expired ───
  if (intent.status === "expired" || timer?.expired) {
    return (
      <CheckoutShell>
        <Card className="w-full max-w-md border-muted bg-card/90 backdrop-blur-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <ClockIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl font-bold">Payment Expired</CardTitle>
            <CardDescription>
              This payment link has expired. Please request a new one from the merchant.
            </CardDescription>
          </CardHeader>
        </Card>
      </CheckoutShell>
    );
  }

  const isSubmitting = step === "submitting";
  const canPay = step === "review" && wallet.status === "connected" && !isSubmitting;
  const assetLabel = formatAsset(intent.asset);

  return (
    <CheckoutShell>
      <Card className="w-full max-w-md bg-card/80 border border-white/10 shadow-2xl backdrop-blur-lg">
        {/* Merchant header */}
        <CardHeader className="text-center border-b border-border/50 pb-4">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <CreditCardIcon className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold bg-clip-text bg-gradient-to-r from-foreground to-foreground/80">
            {intent.merchantName}
          </CardTitle>
          {intent.description && (
            <CardDescription className="text-muted-foreground text-sm mt-1">
              {intent.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Amount display */}
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Amount due
            </p>
            <p className="text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-b from-foreground to-foreground/90">
              {Number.parseFloat(intent.amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              })}
            </p>
            <Badge
              variant="secondary"
              className="mt-2 text-xs px-2.5 py-0.5 rounded-full font-bold"
            >
              {assetLabel}
            </Badge>
          </div>

          {/* Expiry Timer */}
          {timer && !timer.expired && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 rounded-lg py-1.5 px-3 w-fit mx-auto border border-amber-500/20">
              <ClockIcon className="h-3.5 w-3.5 animate-pulse" />
              <span>
                Expires in {timer.minutes}:{timer.seconds.toString().padStart(2, "0")}
              </span>
            </div>
          )}

          {/* Payment details */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground font-medium">Network</span>
              <span className="font-semibold text-foreground">{stellarConfig.networkLabel}</span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground font-medium">Asset</span>
              <span className="font-semibold text-foreground">{assetLabel}</span>
            </div>
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground font-medium">Recipient Address</span>
              <span className="font-mono text-xs text-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                {intent.receiverAddress.slice(0, 6)}...{intent.receiverAddress.slice(-6)}
              </span>
            </div>
            {wallet.address && (
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground font-medium">Your Wallet</span>
                <span className="font-mono text-xs text-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-6)}
                </span>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle className="font-bold">Payment Error</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Wallet connection / Pay button */}
          {wallet.status !== "connected" ? (
            <Button
              id="checkout-connect-wallet"
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer rounded-xl"
              onClick={wallet.connect}
              disabled={wallet.status === "connecting" || wallet.status === "initializing"}
            >
              {wallet.status === "connecting" ? (
                <>
                  <Spinner className="mr-2" />
                  Connecting Wallet...
                </>
              ) : (
                <>
                  <WalletIcon className="mr-2 h-5 w-5" />
                  Connect Stellar Wallet
                </>
              )}
            </Button>
          ) : (
            <Button
              id="checkout-pay-now"
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer rounded-xl"
              onClick={handlePay}
              disabled={!canPay}
            >
              {isSubmitting ? (
                <>
                  <Spinner className="mr-2 text-primary-foreground" />
                  Processing Payment...
                </>
              ) : (
                <>
                  <ShieldCheckIcon className="mr-2 h-5 w-5" />
                  Pay {formatAmount(intent.amount, intent.asset)}
                </>
              )}
            </Button>
          )}
        </CardContent>

        {/* Footer with immediate cancel option */}
        <CardFooter className="flex-col gap-3 border-t border-border/50 pt-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <ShieldCheckIcon className="h-3.5 w-3.5 text-green-500" />
            <span>Secured by Velo Pay</span>
          </div>
          <button
            onClick={handleCancelClick}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
          >
            Cancel and return to merchant
          </button>
        </CardFooter>
      </Card>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background/95 to-slate-900/50 p-4">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-6 duration-500">
        {children}
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <CheckoutShell>
      <Card className="w-full max-w-md bg-card/85 border border-border/50">
        <CardHeader className="text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto mt-3 h-6 w-36" />
          <Skeleton className="mx-auto mt-2 h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <Skeleton className="mx-auto h-10 w-36" />
            <Skeleton className="mx-auto h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
    </CheckoutShell>
  );
}
