"use client";

import { AppShell } from "@/core/app-shell";
import { useWallet } from "@/core/wallet/wallet-provider";
import { useUserProfile } from "@/features/onboarding/use-user-profile";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { useConvexAuth } from "convex/react";
import { AlertCircleIcon, Loader2Icon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const wallet = useWallet();
  const { isNewUser, isLoading } = useUserProfile(wallet.address);
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } = useConvexAuth();
  const router = useRouter();

  // Redirect to dashboard or signup once authenticated
  useEffect(() => {
    if (wallet.status === "connected" && isConvexAuthenticated && !isConvexLoading && !isLoading) {
      if (isNewUser) {
        router.push("/signup");
      } else {
        router.push("/dashboard");
      }
    }
  }, [wallet.status, isConvexAuthenticated, isConvexLoading, isNewUser, isLoading, router]);

  const handleConnect = async () => {
    try {
      await wallet.connect();
    } catch {
      // Errors are handled in the wallet state context
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center py-12 md:py-24">
        <div className="w-full max-w-md space-y-6">
          {/* Login Card */}
          <div className="rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
            <div className="space-y-2 mb-6">
              <h1 className="text-2xl font-semibold tracking-normal text-zinc-900">
                Connect to Console
              </h1>
              <p className="text-sm text-zinc-600">
                Log in to manage developer projects, verify smart contracts, and view real-time
                Stellar events.
              </p>
            </div>

            {/* Wallet Error Alerts */}
            {wallet.error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircleIcon className="h-4 w-4" />
                <AlertTitle>Wallet Error</AlertTitle>
                <AlertDescription className="text-xs">{wallet.error}</AlertDescription>
              </Alert>
            )}

            {/* Action Button */}
            <Button
              onClick={handleConnect}
              disabled={
                wallet.status === "connecting" ||
                wallet.status === "connected" ||
                wallet.status === "initializing" ||
                isConvexLoading ||
                isLoading
              }
              className="w-full flex items-center justify-center gap-2"
            >
              {wallet.status === "connecting" ||
              wallet.status === "initializing" ||
              isConvexLoading ||
              isLoading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <WalletIcon className="h-4 w-4" />
                  <span>Connect Wallet</span>
                </>
              )}
            </Button>

            {wallet.status === "stale" && wallet.staleAddress && (
              <p className="mt-4 text-center text-xs text-zinc-500 font-mono">
                Reconnecting to {wallet.staleAddress.slice(0, 6)}...{wallet.staleAddress.slice(-6)}
              </p>
            )}
          </div>

          {/* Back Link */}
          <div className="text-center">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-700 transition-colors">
              ← Back to Landing Page
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
