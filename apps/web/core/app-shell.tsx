"use client";

import { stellarConfig } from "@/core/config/stellar";
import { shortenAddress } from "@/core/wallet/format";
import { useWallet } from "@/core/wallet/wallet-provider";
import { OnboardingDialog } from "@/features/onboarding/onboarding-dialog";
import { useUserProfile } from "@/features/onboarding/use-user-profile";
import { api } from "@repo/backend/convex/_generated/api";
import { Badge } from "@repo/ui/components/ui-customs/badge";
import { AppSidebar } from "@repo/ui/components/ui-customs/sidebar/app-sidebar";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Separator } from "@repo/ui/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui/components/ui/sidebar";
import { useQuery } from "convex/react";
import { PlugZapIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

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
  const showSidebar =
    isProtectedRoute ||
    pathname.startsWith("/verify") ||
    pathname === "/debug" ||
    pathname === "/docs" ||
    pathname === "/feedback";

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

  // Fetch projects list for the sidebar switcher
  const rawProjects = useQuery(api.projects.query.listByOwner, wallet.address ? {} : "skip");

  // Parse activeProjectId from path if applicable (e.g. /projects/projectId)
  const activeProjectId = useMemo(() => {
    const match = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)/);
    return match && match[1] !== "new" ? match[1] : null;
  }, [pathname]);

  const sidebarProjects = useMemo(() => {
    if (!rawProjects) return [];
    return rawProjects.map((p) => ({
      id: p._id,
      name: p.name,
      status: p.status,
      slug: p.slug,
    }));
  }, [rawProjects]);

  const sidebarUser = useMemo(() => {
    if (user) {
      return {
        name: user.name,
        email: user.email,
        avatar: "",
      };
    }
    if (wallet.address) {
      return {
        name: shortenAddress(wallet.address),
        email: `${wallet.address.slice(0, 8)}...`,
        avatar: "",
      };
    }
    return null;
  }, [user, wallet.address]);

  const handleSelectProject = useCallback(
    (id: string) => {
      router.push(`/projects/${id}`);
    },
    [router],
  );

  const handleCreateProject = useCallback(() => {
    router.push("/projects/new");
  }, [router]);

  const handleNavigate = useCallback(
    (url: string) => {
      router.push(url);
    },
    [router],
  );

  const handlePrefetch = useCallback(
    (url: string) => {
      router.prefetch(url);
    },
    [router],
  );

  useEffect(() => {
    const activeProject = sidebarProjects.find((project) => project.id === activeProjectId);
    const urls = ["/dashboard", "/debug", "/docs", "/projects/new"];

    if (activeProject) {
      urls.push(
        `/projects/${activeProject.id}`,
        `/projects/${activeProject.id}/contracts`,
        `/projects/${activeProject.id}/events`,
        `/projects/${activeProject.id}/webhooks`,
        `/projects/${activeProject.id}/integration`,
      );

      if (activeProject.slug) {
        urls.push(`/verify/${activeProject.slug}`);
      }
    }

    for (const url of urls) {
      router.prefetch(url);
    }
  }, [activeProjectId, router, sidebarProjects]);

  if (showSidebar) {
    return (
      <SidebarProvider>
        <AppSidebar
          user={sidebarUser}
          projects={sidebarProjects}
          activeProjectId={activeProjectId}
          currentPath={pathname}
          onSelectProject={handleSelectProject}
          onCreateProject={handleCreateProject}
          onNavigate={handleNavigate}
          onPrefetch={handlePrefetch}
          onEditProfile={handleEditProfile}
          onDisconnect={wallet.disconnect}
          onConnect={wallet.connect}
          isConnecting={wallet.status === "connecting"}
        />
        <SidebarInset className="flex flex-col min-h-svh bg-zinc-50 text-zinc-950">
          {/* Top Bar for Protected Pages */}
          <header className="flex h-16 shrink-0 items-center gap-4 border-b border-zinc-200 px-6 bg-white">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <Badge variant="info">{stellarConfig.networkLabel}</Badge>
              <Badge
                variant={
                  wallet.address ? "success" : wallet.status === "stale" ? "warning" : "gray"
                }
              >
                {wallet.walletName ?? "No wallet"}
              </Badge>
              <Badge variant={wallet.address ? "success" : "warning"}>
                {wallet.address ? shortenAddress(wallet.address) : walletStatusCopy[wallet.status]}
              </Badge>
            </div>
          </header>

          <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
            {showWalletNotice ? (
              <Alert className="mb-6">
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
          </main>
        </SidebarInset>

        {/* Onboarding / Profile Edit Dialog */}
        <OnboardingDialog
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
          existingProfile={isEditingProfile ? user : undefined}
        />
      </SidebarProvider>
    );
  }

  return (
    <main className="min-h-svh bg-zinc-50 text-zinc-950 flex flex-col justify-center">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
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
