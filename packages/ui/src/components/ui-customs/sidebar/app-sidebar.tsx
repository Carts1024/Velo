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
import { LayoutDashboard, Terminal, FileCheck, MessageSquare } from "lucide-react";
import * as React from "react";

export type SidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: SidebarUser | null;
  projects?: SwitcherProject[];
  activeProjectId?: string | null;
  onSelectProject?: (id: string) => void;
  onCreateProject?: () => void;
  onEditProfile?: () => void;
  onDisconnect?: () => void;
};

export function AppSidebar({
  user,
  projects = [],
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onEditProfile,
  onDisconnect,
  ...props
}: SidebarProps) {
  const navMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Debug",
      url: "/debug",
      icon: Terminal,
    },
    {
      title: "Public Proof",
      url: "/verify/demo",
      icon: FileCheck,
    },
    {
      title: "Feedback",
      url: "/feedback",
      icon: MessageSquare,
    },
  ];

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
          <NavUser user={user} onEditProfile={onEditProfile} onDisconnect={onDisconnect} />
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
