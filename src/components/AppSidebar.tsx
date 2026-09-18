import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, Search, ChevronDown, ChevronRight,
  LogOut, User, Shield, MessageSquare, ClipboardCheck, ClipboardList
} from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { getIcon } from "@/lib/iconMap";
import { useUserRole } from "@/hooks/useUserRole";
import { useMyRegisterMemberships } from "@/hooks/useRegisters";
import { useMyRegisterMemberships as useMyClassicRegisterMemberships }
  from "@/hooks/classic/useRegisters";
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

/**
 * The rail's active marker.
 *
 * Modernist marks a selection with a rule in the accent rather than with a
 * pill or a fill — the same move as the underline on a selected tab, stood on
 * its end. The 2px red edge is the marker; the tonal fill behind it only
 * separates the row from the ink.
 *
 * It is defined once because it is passed to eleven links by hand: the rail's
 * links are NavLinks with an `activeClassName`, not shadcn's `data-active`, so
 * there is no variant to hang it off.
 */
const RAIL_ACTIVE =
  "border-l-2 border-sidebar-primary bg-sidebar-accent font-extrabold text-sidebar-accent-foreground";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [specOpen, setSpecOpen] = useState(true);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: role } = useUserRole();
  const { activeDeanery, allDeaneries, setActiveDeaneryId } = useDeanery();

  // Shown because you hold a register, never because of your TraineeHQ role: a
  // trainee who organises a teaching day gets this link and an admin who
  // organises none does not. The link is only a shortcut — row-level security,
  // not its visibility, is what decides who can open a register.
  //
  // It fails *open*: the link is hidden only once the membership query comes
  // back and positively says there are none. A query that is still loading, or
  // that failed on a dropped connection or an expired token, leaves the link in
  // place — losing it would strand a register holder with no way back in, which
  // is far worse than showing a non-member a directory they may ask access from.
  const { data: myRegisters, isSuccess: membershipsLoaded } = useMyRegisterMemberships();
  const hasRegisters = !membershipsLoaded || (myRegisters?.length ?? 0) > 0;

  // The classic register keeps its own membership table, so it is asked
  // separately and shown on its own terms: somebody may hold a register in one
  // system and none in the other, and while the two are being compared that is
  // the normal state rather than a mistake.
  const { data: myClassicRegisters, isSuccess: classicLoaded } =
    useMyClassicRegisterMemberships();
  const hasClassicRegisters = !classicLoaded || (myClassicRegisters?.length ?? 0) > 0;

  const { data: specialties } = useQuery({
    queryKey: ["sidebar-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase
        .from("specialties")
        .select("id, short_name, icon_name, color, parent_specialty_id, sort_order")
        .eq("is_active", true)
        .is("deleted_at", null)
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
      <SidebarHeader className="border-b-2 border-sidebar-border p-4">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src={logoWhite} alt="HST Training Hub" className="h-10 w-10 shrink-0" />
          {!collapsed && (
            <div>
              <h1 className="font-display text-sm font-extrabold uppercase leading-tight tracking-[0.04em] text-sidebar-accent-foreground">
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
              className="flex w-full items-center gap-2 border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-muted transition-colors hover:border-sidebar-primary hover:text-sidebar-accent-foreground"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search resources…</span>
              <kbd className="hidden bg-sidebar-border px-1.5 py-0.5 text-[10px] sm:inline-flex">⌘K</kbd>
            </button>
          </div>
        )}
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/dashboard" end activeClassName={RAIL_ACTIVE}>
                    <LayoutDashboard className="h-4 w-4" />
                    {!collapsed && <span>Dashboard</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/contacts" activeClassName={RAIL_ACTIVE}>
                    <Users className="h-4 w-4" />
                    {!collapsed && <span>Key Contacts</span>}
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
                              activeClassName={RAIL_ACTIVE}
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
                                activeClassName={RAIL_ACTIVE}
                                className="text-xs"
                              >
                                <SIcon className="h-3.5 w-3.5" />
                                {!collapsed && <span>{s.short_name}</span>}
                              </NavLink>
                            </SidebarMenuButton>
                            {!collapsed && (
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleParent(s.id); }}
                                className="p-1 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              >
                                <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                              </button>
                            )}
                          </div>
                        </SidebarMenuItem>
                        {!collapsed && isExpanded && (
                          <div className="ml-4 border-l-2 border-sidebar-border pl-2">
                            {children.map((child) => {
                              const CIcon = getIcon(child.icon_name);
                              return (
                                <SidebarMenuItem key={child.id}>
                                  <SidebarMenuButton asChild>
                                    <NavLink
                                      to={`/specialty/${child.id}`}
                                      activeClassName={RAIL_ACTIVE}
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
                  <NavLink to="/community" activeClassName={RAIL_ACTIVE}>
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
                  <NavLink to="/profile" activeClassName={RAIL_ACTIVE}>
                    <User className="h-4 w-4" />
                    {!collapsed && <span>My Profile</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {hasRegisters && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/registers" activeClassName={RAIL_ACTIVE}>
                      <ClipboardCheck className="h-4 w-4" />
                      {!collapsed && <span>Teaching Registers</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {/* The second register, on its own link beside the first. Both are
                  listed while the two are being compared; when one is chosen,
                  its link and its code go together. */}
              {hasClassicRegisters && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/classic-registers" activeClassName={RAIL_ACTIVE}>
                      <ClipboardList className="h-4 w-4" />
                      {!collapsed && <span>Registers (Classic)</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {(role === "admin" || role === "super_admin") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/admin" activeClassName={RAIL_ACTIVE}>
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

      <SidebarFooter className="border-t-2 border-sidebar-border p-3">
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
