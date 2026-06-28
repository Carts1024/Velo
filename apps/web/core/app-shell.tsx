"use client";

import { stellarConfig } from "@/core/config/stellar";
import { shortenAddress } from "@/core/wallet/format";
import { useWallet } from "@/core/wallet/wallet-provider";
import { OnboardingDialog } from "@/features/onboarding/onboarding-dialog";
import { useUserProfile } from "@/features/onboarding/use-user-profile";
import { CopyButton } from "@repo/ui/components/common/copy-button";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import {
  MessageSquareIcon,
  PencilIcon,
  PlugZapIcon,
  PowerIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { ReactNode, useCallback, useEffect, useState } from "react";

const walletStatusCopy = {
  initializing: "Loading wallet support",
  ready: "Wallet ready",
  connected: "Wallet connected",
  connecting: "Opening wallet modal",
  disconnected: "Wallet disconnected",
  unavailable: "Wallet unavailable",
  rejected: "Connection rejected",
  unsupported: "Unsupported network",
  stale: "Session needs reconnect",
  error: "Wallet error",
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const { user, isNewUser } = useUserProfile(wallet.address);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const showWalletNotice = ["unavailable", "unsupported", "rejected", "stale", "error"].includes(
    wallet.status,
  );

  // Show onboarding dialog for new users after wallet connection
  useEffect(() => {
    if (isNewUser && wallet.status === "connected") {
      setShowOnboarding(true);
    }
  }, [isNewUser, wallet.status]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    setIsEditingProfile(false);
  }, []);

  const handleEditProfile = useCallback(() => {
    setIsEditingProfile(true);
    setShowOnboarding(true);
  }, []);

  return (
    <main className="min-h-svh bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href="/dashboard" className="w-fit">
              <div className="text-xl font-semibold tracking-normal">TalaKit</div>
              <div className="text-sm text-zinc-600">Verify + Debug on Stellar Testnet</div>
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/debug">Debug</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/verify/demo">Public proof</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/feedback">
                  <MessageSquareIcon className="size-4" />
                  Feedback
                </Link>
              </Button>
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">{stellarConfig.networkLabel}</Badge>
            <Badge
              variant={wallet.address ? "success" : wallet.status === "stale" ? "warning" : "gray"}
            >
              {wallet.walletName ?? "No wallet"}
            </Badge>
            <Badge variant={wallet.address ? "success" : "warning"}>
              {wallet.address ? shortenAddress(wallet.address) : walletStatusCopy[wallet.status]}
            </Badge>
            {wallet.address ? (
              <CopyButton value={wallet.address} label="connected wallet address" />
            ) : null}
            {user ? (
              <Badge variant="gray">
                <UserIcon className="size-3" />
                {user.name}
              </Badge>
            ) : null}
            {user ? (
              <Button variant="ghost" size="sm" onClick={handleEditProfile} title="Edit profile">
                <PencilIcon className="size-3.5" />
              </Button>
            ) : null}
            {wallet.address ? (
              <Button variant="outline" size="sm" onClick={wallet.disconnect}>
                <PowerIcon />
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={wallet.connect} disabled={wallet.status === "connecting"}>
                <WalletIcon />
                Connect
              </Button>
            )}
          </div>
        </header>

        {showWalletNotice ? (
          <Alert>
            <PlugZapIcon />
            <AlertTitle>{walletStatusCopy[wallet.status]}</AlertTitle>
            <AlertDescription>
              {wallet.error ??
                (wallet.staleAddress
                  ? `Reconnect ${shortenAddress(wallet.staleAddress)} to continue with owner-scoped projects.`
                  : "Use a Stellar Testnet wallet to create and manage draft projects.")}
            </AlertDescription>
          </Alert>
        ) : null}

        {children}
      </div>

      {/* Onboarding / Profile Edit Dialog */}
      <OnboardingDialog
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        existingProfile={isEditingProfile ? user : undefined}
      />
    </main>
  );
}
