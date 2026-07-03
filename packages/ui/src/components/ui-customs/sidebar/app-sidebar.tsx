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
  SidebarRail,
} from "@repo/ui/components/ui/sidebar";
import {
  ActivityIcon,
  BookOpenIcon,
  BracesIcon,
  FileCheckIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  TerminalIcon,
  WebhookIcon,
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
  ...props
}: SidebarProps) {
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectBaseUrl = activeProject ? `/projects/${activeProject.id}` : "/dashboard";
  const publicProofUrl = activeProject?.slug ? `/verify/${activeProject.slug}` : "/dashboard";

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
      title: "Pages",
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
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        {user ? (
          <NavUser
            user={user}
            onEditProfile={onEditProfile}
            onDisconnect={onDisconnect}
            feedbackUrl="/feedback"
          />
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
