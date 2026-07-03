import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/ui/sidebar";
import { ChevronRight, type LucideIcon } from "lucide-react";

import type * as React from "react";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  disabled?: boolean;
  items?: {
    title: string;
    url: string;
  }[];
};

export function NavMain({
  items,
  onNavigate,
  onPrefetch,
}: {
  items: NavMainItem[];
  onNavigate?: (url: string) => void;
  onPrefetch?: (url: string) => void;
}) {
  function handleLinkClick(event: React.MouseEvent<HTMLAnchorElement>, url: string) {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    onNavigate(url);
  }

  function prefetch(url: string) {
    onPrefetch?.(url);
  }
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasSubItems = Boolean(item.items?.length);

          if (!hasSubItems) {
            return (
              <SidebarMenuItem key={item.title}>
                {item.disabled ? (
                  <SidebarMenuButton
                    disabled
                    tooltip={`${item.title} requires a selected project`}
                    className="cursor-not-allowed opacity-50"
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton asChild tooltip={item.title} isActive={item.isActive}>
                    <a
                      href={item.url}
                      onClick={(event) => handleLinkClick(event, item.url)}
                      onFocus={() => prefetch(item.url)}
                      onMouseEnter={() => prefetch(item.url)}
                    >
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            );
          }

          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={item.isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={item.isActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild>
                          <a
                            href={subItem.url}
                            onClick={(event) => handleLinkClick(event, subItem.url)}
                            onFocus={() => prefetch(subItem.url)}
                            onMouseEnter={() => prefetch(subItem.url)}
                          >
                            <span>{subItem.title}</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
