import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, Search, ChevronDown, ChevronRight,
  LogOut, User, Shield, MessageSquare
} from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { getIcon } from "@/lib/iconMap";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useDeanery } from "@/contexts/DeaneryContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [specOpen, setSpecOpen] = useState(true);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: role } = useUserRole();
  const { activeDeanery, allDeaneries, setActiveDeaneryId } = useDeanery();

  const { data: specialties } = useQuery({
    queryKey: ["sidebar-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase
        .from("specialties")
        .select("id, short_name, icon_name, color, parent_specialty_id, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (activeDeanery) {
        query = query.eq("deanery_id", activeDeanery.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!activeDeanery,
  });

  // Separate top-level and children
  const topLevel = specialties?.filter((s) => !s.parent_specialty_id) ?? [];
  const childrenOf = (parentId: string) =>
    specialties?.filter((s) => s.parent_specialty_id === parentId) ?? [];

  const toggleParent = (id: string) =>
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src={logoWhite} alt="HST Training Hub" className="h-11 w-11" />
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold font-display text-sidebar-accent-foreground tracking-tight">
                {activeDeanery?.name ?? ""} HST Training Hub
              </h1>
            </div>
          )}
        </Link>
        {!collapsed && (role === "admin" || role === "super_admin") && allDeaneries.length > 1 && (
          <Select value={activeDeanery?.id ?? ""} onValueChange={setActiveDeaneryId}>
            <SelectTrigger className="mt-2 h-7 text-xs bg-sidebar-accent border-sidebar-border">
              <SelectValue placeholder="Select deanery" />
            </SelectTrigger>
            <SelectContent>
              {allDeaneries.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {!collapsed && (
          <div className="px-2 mb-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-md bg-sidebar-accent px-3 py-2 text-xs text-sidebar-muted w-full hover:text-sidebar-accent-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search resources…</span>
              <kbd className="hidden sm:inline-flex text-[10px] bg-sidebar-border rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
          </div>
        )}
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/dashboard" end activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                    <LayoutDashboard className="h-4 w-4" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible open={specOpen} onOpenChange={setSpecOpen}>
            <CollapsibleTrigger className="w-full">
              <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:text-sidebar-accent-foreground transition-colors">
                <span>Specialties</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${specOpen ? "rotate-0" : "-rotate-90"}`} />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {topLevel.map((s) => {
                    const SIcon = getIcon(s.icon_name);
                    const children = childrenOf(s.id);
                    const hasChildren = children.length > 0;
                    const isExpanded = expandedParents[s.id] ?? false;

                    if (!hasChildren) {
                      return (
                        <SidebarMenuItem key={s.id}>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={`/specialty/${s.id}`}
                              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                              className="text-xs"
                            >
                              <SIcon className="h-3.5 w-3.5" />
                              {!collapsed && <span>{s.short_name}</span>}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }

                    return (
                      <div key={s.id}>
                        <SidebarMenuItem>
                          <div className="flex items-center w-full">
                            <SidebarMenuButton asChild className="flex-1">
                              <NavLink
                                to={`/specialty/${s.id}`}
                                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                                className="text-xs"
                              >
                                <SIcon className="h-3.5 w-3.5" />
                                {!collapsed && <span>{s.short_name}</span>}
                              </NavLink>
                            </SidebarMenuButton>
                            {!collapsed && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleParent(s.id); }}
                                className="p-1 rounded hover:bg-sidebar-accent text-white hover:text-sidebar-accent-foreground transition-colors"
                              >
                                <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              </button>
                            )}
                          </div>
                        </SidebarMenuItem>
                        {!collapsed && isExpanded && (
                          <div className="ml-4 pl-2 border-l border-sidebar-border">
                            {children.map((child) => {
                              const CIcon = getIcon(child.icon_name);
                              return (
                                <SidebarMenuItem key={child.id}>
                                  <SidebarMenuButton asChild>
                                    <NavLink
                                      to={`/specialty/${child.id}`}
                                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                                      className="text-[11px]"
                                    >
                                      <CIcon className="h-3 w-3" />
                                      <span>{child.short_name}</span>
                                    </NavLink>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Community</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/community" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                    <MessageSquare className="h-4 w-4" />
                    {!collapsed && <span>Discussion Boards</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/profile" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                    <User className="h-4 w-4" />
                    {!collapsed && <span>My Profile</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {(role === "admin" || role === "super_admin") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>Admin Panel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              className="text-sidebar-muted hover:text-sidebar-accent-foreground cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="text-xs">Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
