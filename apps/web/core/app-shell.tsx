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
import { useQuery, useConvexAuth } from "convex/react";
import { Loader2Icon, PlugZapIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const selectedProjectStoragePrefix = "velo:selected-project";

type SelectedProjectContextValue = {
  selectedProjectId: string | null;
  projectCount: number;
  projectsLoaded: boolean;
};

const SelectedProjectContext = createContext<SelectedProjectContextValue>({
  selectedProjectId: null,
  projectCount: 0,
  projectsLoaded: false,
});

export function useSelectedProject() {
  return useContext(SelectedProjectContext);
}

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
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const { user, isNewUser, isLoading } = useUserProfile(wallet.address);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [storedSelectedProjectId, setStoredSelectedProjectId] = useState<string | null>(null);
  const [loadedSelectedProjectStorageKey, setLoadedSelectedProjectStorageKey] = useState<
    string | null
  >(null);

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
  const rawProjects = useQuery(
    api.projects.query.listByOwner,
    wallet.address && isConvexAuthenticated ? {} : "skip",
  );

  const sidebarProjects = useMemo(() => {
    if (!rawProjects) return [];
    return rawProjects.map((p) => ({
      id: p._id,
      name: p.name,
      status: p.status,
      slug: p.slug,
      logoUrl: p.logoUrl,
    }));
  }, [rawProjects]);

  const selectedProjectStorageKey = useMemo(() => {
    return wallet.address ? `${selectedProjectStoragePrefix}:${wallet.address}` : null;
  }, [wallet.address]);
  const hasLoadedStoredSelectedProject =
    selectedProjectStorageKey === null ||
    loadedSelectedProjectStorageKey === selectedProjectStorageKey;

  useEffect(() => {
    if (!selectedProjectStorageKey) {
      setStoredSelectedProjectId(null);
      setLoadedSelectedProjectStorageKey(null);
      return;
    }

    setStoredSelectedProjectId(window.localStorage.getItem(selectedProjectStorageKey));
    setLoadedSelectedProjectStorageKey(selectedProjectStorageKey);
  }, [selectedProjectStorageKey]);

  // Parse route project from path if applicable (e.g. /projects/projectId or /verify/slug)
  const routeProjectId = useMemo(() => {
    const projectsMatch = pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)/);
    if (projectsMatch && projectsMatch[1] !== "new") {
      return projectsMatch[1];
    }
    const verifyMatch = pathname.match(/^\/verify\/([a-zA-Z0-9_-]+)/);
    if (verifyMatch) {
      const slug = verifyMatch[1];
      const project = sidebarProjects.find((p) => p.slug === slug);
      if (project) {
        return project.id;
      }
    }
    return null;
  }, [pathname, sidebarProjects]);

  const activeProjectId = useMemo(() => {
    if (routeProjectId) {
      return routeProjectId;
    }

    if (!rawProjects) {
      return storedSelectedProjectId;
    }

    if (!hasLoadedStoredSelectedProject) {
      return null;
    }

    const storedProject = sidebarProjects.find((project) => project.id === storedSelectedProjectId);
    return storedProject?.id ?? sidebarProjects[0]?.id ?? null;
  }, [
    hasLoadedStoredSelectedProject,
    rawProjects,
    routeProjectId,
    sidebarProjects,
    storedSelectedProjectId,
  ]);

  const rememberSelectedProject = useCallback(
    (id: string) => {
      setStoredSelectedProjectId(id);
      if (selectedProjectStorageKey) {
        window.localStorage.setItem(selectedProjectStorageKey, id);
      }
    },
    [selectedProjectStorageKey],
  );

  useEffect(() => {
    if (routeProjectId) {
      rememberSelectedProject(routeProjectId);
      return;
    }

    if (
      rawProjects &&
      hasLoadedStoredSelectedProject &&
      activeProjectId &&
      activeProjectId !== storedSelectedProjectId
    ) {
      rememberSelectedProject(activeProjectId);
    }
  }, [
    activeProjectId,
    hasLoadedStoredSelectedProject,
    rawProjects,
    rememberSelectedProject,
    routeProjectId,
    storedSelectedProjectId,
  ]);

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
      rememberSelectedProject(id);

      if (pathname === "/dashboard") {
        return;
      }

      const projectRouteMatch = pathname.match(/^\/projects\/[a-zA-Z0-9_-]+(\/.*)?$/);
      if (projectRouteMatch) {
        router.push(`/projects/${id}${projectRouteMatch[1] ?? ""}`);
        return;
      }

      router.push(`/projects/${id}`);
    },
    [pathname, rememberSelectedProject, router],
  );

  const handleCreateProject = useCallback(() => {
    router.push("/projects/new");
  }, [router]);

  const handleNavigate = useCallback(
    (url: string) => {
      if (url === "/dashboard" && activeProjectId) {
        rememberSelectedProject(activeProjectId);
      }
      router.push(url);
    },
    [activeProjectId, rememberSelectedProject, router],
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
        `/projects/${activeProject.id}/settings`,
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
        <SelectedProjectContext
          value={{
            selectedProjectId: activeProjectId,
            projectCount: sidebarProjects.length,
            projectsLoaded:
              rawProjects !== undefined &&
              (routeProjectId !== null || hasLoadedStoredSelectedProject),
          }}
        >
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
                  {wallet.address
                    ? shortenAddress(wallet.address)
                    : walletStatusCopy[wallet.status]}
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

              {isProtectedRoute && !isConvexAuthenticated ? (
                <div className="flex min-h-[50vh] items-center justify-center">
                  <Loader2Icon className="h-8 w-8 animate-spin text-zinc-400" />
                </div>
              ) : (
                children
              )}
            </main>
          </SidebarInset>

          {/* Onboarding / Profile Edit Dialog */}
          <OnboardingDialog
            open={showOnboarding}
            onComplete={handleOnboardingComplete}
            existingProfile={isEditingProfile ? user : undefined}
          />
        </SelectedProjectContext>
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
