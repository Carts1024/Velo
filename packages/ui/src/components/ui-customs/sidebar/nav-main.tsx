import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/ui/sidebar";
import { ChevronRight, type LucideIcon } from "lucide-react";
import * as React from "react";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  disabled?: boolean;
};

export type NavMainGroup = {
  title: string;
  icon?: LucideIcon;
  items: NavMainItem[];
  isActive?: boolean;
};

export function NavMain({
  groups,
  onNavigate,
  onPrefetch,
}: {
  groups: NavMainGroup[];
  onNavigate?: (url: string) => void;
  onPrefetch?: (url: string) => void;
}) {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  const activeGroupTitle = groups.find((group) => group.isActive)?.title;

  React.useEffect(() => {
    if (!activeGroupTitle) return;

    setOpenGroups((current) => {
      if (current[activeGroupTitle]) return current;
      return { ...current, [activeGroupTitle]: true };
    });
  }, [activeGroupTitle]);

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
    <>
      {groups.map((group) => {
        const isOpen = openGroups[group.title] ?? group.isActive ?? false;

        return (
          <SidebarGroup key={group.title}>
            <Collapsible
              asChild
              open={isOpen}
              onOpenChange={(open) =>
                setOpenGroups((current) => ({ ...current, [group.title]: open }))
              }
              className="group/principle"
            >
              <SidebarMenu>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={group.title} isActive={group.isActive}>
                      {group.icon && <group.icon />}
                      <span className="group-data-[collapsible=icon]:hidden">{group.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[collapsible=icon]:hidden group-data-[state=open]/principle:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {group.items.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          {item.disabled ? (
                            <SidebarMenuSubButton
                              aria-disabled="true"
                              className="cursor-not-allowed opacity-50"
                              title={`${item.title} requires a selected project`}
                            >
                              {item.icon && <item.icon />}
                              <span>{item.title}</span>
                            </SidebarMenuSubButton>
                          ) : (
                            <SidebarMenuSubButton asChild isActive={item.isActive}>
                              <a
                                href={item.url}
                                onClick={(event) => handleLinkClick(event, item.url)}
                                onFocus={() => prefetch(item.url)}
                                onMouseEnter={() => prefetch(item.url)}
                              >
                                {item.icon && <item.icon />}
                                <span>{item.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          )}
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </SidebarMenu>
            </Collapsible>
          </SidebarGroup>
        );
      })}
    </>
  );
}
