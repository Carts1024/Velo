"use client";

import { NavMain } from "@repo/ui/components/ui-customs/sidebar/nav-main";
import { NavUser, SidebarUser } from "@repo/ui/components/ui-customs/sidebar/nav-user";
import {
  ProjectSwitcher,
  SwitcherProject,
} from "@repo/ui/components/ui-customs/sidebar/project-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@repo/ui/components/ui/sidebar";
import {
  ActivityIcon,
  BookOpenIcon,
  BracesIcon,
  FileCheckIcon,
  FileTextIcon,
  KeyIcon,
  LayoutDashboardIcon,
  TerminalIcon,
  WalletIcon,
  WebhookIcon,
  BanknoteIcon,
} from "lucide-react";
import * as React from "react";

export type SidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser | null;
  projects?: SwitcherProject[];
  activeProjectId?: string | null;
  currentPath?: string;
  onSelectProject?: (id: string) => void;
  onCreateProject?: () => void;
  onEditProfile?: () => void;
  onDisconnect?: () => void;
  onNavigate?: (url: string) => void;
  onPrefetch?: (url: string) => void;
  onConnect?: () => void;
  isConnecting?: boolean;
};

function isPathActive(currentPath: string | undefined, url: string) {
  if (!currentPath) return false;
  if (url === "/dashboard") return currentPath === url;
  return currentPath === url || currentPath.startsWith(`${url}/`);
}

export function AppSidebar({
  user,
  projects = [],
  activeProjectId,
  currentPath,
  onSelectProject,
  onCreateProject,
  onEditProfile,
  onDisconnect,
  onNavigate,
  onPrefetch,
  onConnect,
  isConnecting,
  ...props
}: SidebarProps) {
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectBaseUrl = activeProject ? `/projects/${activeProject.id}` : "/dashboard";
  const publicProofUrl = activeProject?.slug ? `/verify/${activeProject.slug}` : "/dashboard";
  const settingsUrl = activeProject ? `/projects/${activeProject.id}/settings` : undefined;

  const navMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboardIcon,
    },
    {
      title: "Contracts",
      url: `${projectBaseUrl}/contracts`,
      icon: FileCheckIcon,
      disabled: !activeProject,
    },
    {
      title: "Events",
      url: `${projectBaseUrl}/events`,
      icon: ActivityIcon,
      disabled: !activeProject,
    },
    {
      title: "Webhooks",
      url: `${projectBaseUrl}/webhooks`,
      icon: WebhookIcon,
      disabled: !activeProject,
    },
    {
      title: "API Keys",
      url: `${projectBaseUrl}/api-keys`,
      icon: KeyIcon,
      disabled: !activeProject,
    },
    {
      title: "Settlement",
      url: `${projectBaseUrl}/settlement`,
      icon: BanknoteIcon,
      disabled: !activeProject,
    },
    {
      title: "Integration",
      url: `${projectBaseUrl}/integration`,
      icon: BracesIcon,
      disabled: !activeProject,
    },
    {
      title: "Public Proof",
      url: publicProofUrl,
      icon: FileTextIcon,
      disabled: !activeProject?.slug,
    },
    {
      title: "Debug",
      url: "/debug",
      icon: TerminalIcon,
    },
    {
      title: "Docs",
      url: "/docs",
      icon: BookOpenIcon,
    },
  ].map((item) => ({
    ...item,
    isActive: !item.disabled && isPathActive(currentPath, item.url),
  }));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <ProjectSwitcher
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} onNavigate={onNavigate} onPrefetch={onPrefetch} />
      </SidebarContent>
      <SidebarFooter>
        {user ? (
          <NavUser
            user={user}
            onEditProfile={onEditProfile}
            onDisconnect={onDisconnect}
            feedbackUrl="/feedback"
            settingsUrl={settingsUrl}
            onNavigate={onNavigate}
          />
        ) : onConnect ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onConnect}
                disabled={isConnecting}
                className="gap-2 text-zinc-600 hover:text-zinc-900"
              >
                <WalletIcon className="size-4" />
                <span>Connect Wallet</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
