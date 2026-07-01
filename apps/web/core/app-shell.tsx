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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import {
  MenuIcon,
  MessageSquareIcon,
  PencilIcon,
  PlugZapIcon,
  PowerIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const { user, isNewUser, isLoading } = useUserProfile(wallet.address);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const showWalletNotice = ["unavailable", "unsupported", "rejected", "stale", "error"].includes(
    wallet.status,
  );

  const isProtectedRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/projects");

  useEffect(() => {
    if (wallet.status === "initializing" || isLoading) {
      return;
    }

    if (isProtectedRoute && wallet.status !== "connected") {
      router.push("/login");
    } else if (wallet.status === "connected" && isNewUser && pathname !== "/signup") {
      router.push("/signup");
    }
  }, [wallet.status, isNewUser, isLoading, isProtectedRoute, pathname, router]);

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
        {/* Desktop Header */}
        <header className="hidden lg:flex flex-col gap-4 border-b border-zinc-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link href="/dashboard" className="w-fit">
              <div className="text-xl font-semibold tracking-normal">Velo</div>
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

        {/* Mobile/Tablet Header */}
        <header className="flex lg:hidden items-center justify-between border-b border-zinc-200 pb-4">
          <Link href="/dashboard" className="flex flex-col">
            <div className="text-xl font-bold tracking-tight text-zinc-950">Velo</div>
            <div className="text-xs text-zinc-500">Verify + Debug on Stellar</div>
          </Link>

          <div className="flex items-center gap-2">
            {/* Wallet indicator dot */}
            {wallet.address ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300"></span>
            )}

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                  <MenuIcon className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[85vw] max-w-[360px] p-6 bg-white flex flex-col gap-6"
              >
                <SheetHeader className="p-0 border-b border-zinc-100 pb-4">
                  <SheetTitle className="text-xl font-bold text-zinc-900">Menu</SheetTitle>
                </SheetHeader>

                {/* Mobile Navigation Links */}
                <nav className="flex flex-col gap-2">
                  <Button variant="ghost" className="justify-start w-full text-base h-11" asChild>
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                  <Button variant="ghost" className="justify-start w-full text-base h-11" asChild>
                    <Link href="/debug">Debug</Link>
                  </Button>
                  <Button variant="ghost" className="justify-start w-full text-base h-11" asChild>
                    <Link href="/verify/demo">Public proof</Link>
                  </Button>
                  <Button variant="ghost" className="justify-start w-full text-base h-11" asChild>
                    <Link href="/feedback">
                      <MessageSquareIcon className="size-4 mr-2" />
                      Feedback
                    </Link>
                  </Button>
                </nav>

                {/* Mobile Wallet / Profile Info */}
                <div className="mt-auto border-t border-zinc-100 pt-6 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-zinc-500 font-medium uppercase tracking-wider">
                      <span>Status</span>
                      <Badge variant="info">{stellarConfig.networkLabel}</Badge>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Wallet</span>
                        <Badge
                          variant={
                            wallet.address
                              ? "success"
                              : wallet.status === "stale"
                                ? "warning"
                                : "gray"
                          }
                        >
                          {wallet.walletName ?? "No wallet"}
                        </Badge>
                      </div>

                      {wallet.address && (
                        <div className="flex flex-col gap-1.5 mt-2">
                          <span className="text-zinc-500 text-xs">Address</span>
                          <div className="flex items-center justify-between gap-2 bg-white rounded border border-zinc-200 px-2 py-1.5">
                            <span className="font-mono text-xs truncate select-all">
                              {shortenAddress(wallet.address)}
                            </span>
                            <CopyButton value={wallet.address} label="wallet address" size="sm" />
                          </div>
                        </div>
                      )}

                      {user && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-200/60">
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="size-3.5 text-zinc-500" />
                            <span className="font-medium text-zinc-800">{user.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleEditProfile}
                            title="Edit profile"
                          >
                            <PencilIcon className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {wallet.address ? (
                    <Button
                      variant="outline"
                      className="w-full h-11 justify-center gap-2 text-base text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      onClick={wallet.disconnect}
                    >
                      <PowerIcon className="size-4" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      className="w-full h-11 justify-center gap-2 text-base"
                      onClick={wallet.connect}
                      disabled={wallet.status === "connecting"}
                    >
                      <WalletIcon className="size-4" />
                      Connect Wallet
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
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
