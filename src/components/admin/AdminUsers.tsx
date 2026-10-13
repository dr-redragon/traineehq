import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search, UserPlus, Shield, Trash2, Settings, UserCheck, Eye, Crown, MoreVertical, Mail, KeyRound, Copy,
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { useUserRole } from "@/hooks/useUserRole";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RoleName = "super_admin" | "admin" | "facilitator" | "trainee";

const roleConfig: Record<RoleName, { label: string; icon: typeof Shield; description: string }> = {
  super_admin: { label: "Super Admin", icon: Crown, description: "Full access across all deaneries" },
  admin: { label: "Admin", icon: Shield, description: "Full access within their deanery" },
  facilitator: { label: "Facilitator", icon: UserCheck, description: "Can manage resources for assigned specialties" },
  trainee: { label: "Trainee", icon: Eye, description: "View-only access to assigned specialties" },
};

export function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: currentUserRole } = useUserRole();
  const [search, setSearch] = useState("");
  const [filterDeanery, setFilterDeanery] = useState<string>("all");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleName>("trainee");
  const [permDialogUser, setPermDialogUser] = useState<Tables<"profiles"> | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleName>("trainee");
  const [selectedDeaneryId, setSelectedDeaneryId] = useState<string>("");
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Tables<"profiles"> | null>(null);
  const [resetTarget, setResetTarget] = useState<Tables<"profiles"> | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<Tables<"profiles"> | null>(null);
  const [newPassword, setNewPassword] = useState("");
  // When the reset email cannot be sent, the link is shown here to pass on.
  const [resetLink, setResetLink] = useState<{ name: string; link: string } | null>(null);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: deaneries } = useQuery({
    queryKey: ["admin-deaneries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deaneries").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("specialties").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: facilitatorSpecs } = useQuery({
    queryKey: ["facilitator-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("facilitator_specialties").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: traineeSpecs } = useQuery({
    queryKey: ["trainee-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trainee_specialties").select("*");
      if (error) throw error;
      return data;
    },
  });

  const getUserRole = (userId: string): RoleName => {
    if (roles?.some((r) => r.user_id === userId && r.role === "super_admin")) return "super_admin";
    if (roles?.some((r) => r.user_id === userId && r.role === "admin")) return "admin";
    if (roles?.some((r) => r.user_id === userId && r.role === "facilitator")) return "facilitator";
    return "trainee";
  };

  const getUserDeanery = (userId: string) => {
    const profile = profiles?.find((p) => p.user_id === userId);
    return profile?.deanery_id ?? null;
  };

  const getDeaneryName = (deaneryId: string | null) => {
    if (!deaneryId) return "Unassigned";
    return deaneries?.find((d) => d.id === deaneryId)?.short_name ?? "Unknown";
  };

  const getUserAssignedSpecs = (userId: string, role: RoleName) => {
    if (role === "facilitator") {
      return facilitatorSpecs?.filter((fs) => fs.user_id === userId).map((fs) => fs.specialty_id) ?? [];
    }
    if (role === "trainee") {
      return traineeSpecs?.filter((ts) => ts.user_id === userId).map((ts) => ts.specialty_id) ?? [];
    }
    return [];
  };

  // Specialties filtered to the selected deanery in the permissions dialog
  const dialogDeanerySpecs = specialties?.filter(
    (s) => s.deanery_id === selectedDeaneryId && s.is_active
  ) ?? [];

  // Specialties filtered to the filter deanery for the table filter
  const filterDeanerySpecs = filterDeanery !== "all"
    ? specialties?.filter((s) => s.deanery_id === filterDeanery && s.is_active) ?? []
    : specialties ?? [];

  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole, deaneryId, specialtyIds }: { userId: string; newRole: RoleName; deaneryId: string; specialtyIds: string[] }) => {
      // Update the user's deanery on their profile
      const { error: profErr } = await supabase.from("profiles").update({ deanery_id: deaneryId || null }).eq("user_id", userId);
      if (profErr) throw profErr;

      // Update deanery on user_roles
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId).neq("role", "trainee");
      if (delErr) throw delErr;

      // Remove all specialty assignments
      await supabase.from("facilitator_specialties").delete().eq("user_id", userId);
      await supabase.from("trainee_specialties").delete().eq("user_id", userId);

      if (newRole === "super_admin") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "super_admin" });
        if (error) throw error;
      } else if (newRole === "admin") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin", deanery_id: deaneryId || null });
        if (error) throw error;
      } else if (newRole === "facilitator") {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "facilitator", deanery_id: deaneryId || null });
        if (error) throw error;
        if (specialtyIds.length > 0) {
          const { error: fsErr } = await supabase.from("facilitator_specialties").insert(
            specialtyIds.map((sid) => ({ user_id: userId, specialty_id: sid }))
          );
          if (fsErr) throw fsErr;
        }
      } else {
        // Update trainee role's deanery
        await supabase.from("user_roles").update({ deanery_id: deaneryId || null }).eq("user_id", userId).eq("role", "trainee");
        if (specialtyIds.length > 0) {
          const { error: tsErr } = await supabase.from("trainee_specialties").insert(
            specialtyIds.map((sid) => ({ user_id: userId, specialty_id: sid }))
          );
          if (tsErr) throw tsErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Permissions updated");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["facilitator-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["trainee-specialties"] });
      setPermDialogUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: inviteEmail,
          first_name: inviteFirst,
          last_name: inviteLast,
          role: inviteRole,
          redirect_to: `${window.location.origin}/reset-password`,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { email_sent?: boolean };
    },
    onSuccess: (data) => {
      toast.success(
        data?.email_sent === false
          ? "User created, but the invitation email could not be sent"
          : "Invitation sent",
      );
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFirst("");
      setInviteLast("");
      setInviteRole("trainee");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Acting on somebody's sign-in account needs the service role, so it goes
  // through the admin-user function, which re-checks can_admin_user().
  const adminUserAction = async (body: Record<string, string>) => {
    const { data, error } = await supabase.functions.invoke("admin-user", { body });
    if (error) {
      // A non-2xx response carries the function's own message in its body.
      const context = (error as { context?: Response }).context;
      const detail = context && typeof context.json === "function"
        ? await context.json().catch(() => null)
        : null;
      throw new Error(detail?.error ?? error.message);
    }
    if (data?.error) throw new Error(data.error);
    return data as { email_sent?: boolean; link?: string };
  };

  const deleteUser = useMutation({
    mutationFn: (userId: string) => adminUserAction({ action: "delete", user_id: userId }),
    onSuccess: () => {
      toast.success("User deleted — they can no longer sign in");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["facilitator-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["trainee-specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendResetLink = useMutation({
    mutationFn: (profile: Tables<"profiles">) =>
      adminUserAction({
        action: "send_reset_link",
        user_id: profile.user_id,
        redirect_to: `${window.location.origin}/reset-password`,
      }),
    onSuccess: (data, profile) => {
      setResetTarget(null);
      if (data?.email_sent === false && data.link) {
        setResetLink({ name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(), link: data.link });
      } else {
        toast.success(`Reset link sent to ${profile.email}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPassword = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      adminUserAction({ action: "set_password", user_id: userId, password }),
    onSuccess: () => {
      toast.success("Password updated");
      setPasswordTarget(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPermissions = (profile: Tables<"profiles">) => {
    const role = getUserRole(profile.user_id);
    setPermDialogUser(profile);
    setSelectedRole(role);
    setSelectedDeaneryId(profile.deanery_id ?? "");
    setSelectedSpecialties(getUserAssignedSpecs(profile.user_id, role));
  };

  const toggleSpecialty = (specId: string) => {
    setSelectedSpecialties((prev) =>
      prev.includes(specId) ? prev.filter((s) => s !== specId) : [...prev, specId]
    );
  };

  const selectAllSpecialties = () => {
    setSelectedSpecialties(dialogDeanerySpecs.map((s) => s.id));
  };

  const clearAllSpecialties = () => setSelectedSpecialties([]);

  // Filtering
  const filtered = profiles?.filter((p) => {
    // Text search - supports multi-word queries like "John Smith"
    if (search.trim()) {
      const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const q = search.toLowerCase().trim();
      if (
        !fullName.includes(q) &&
        !p.email?.toLowerCase().includes(q)
      ) return false;
    }
    // Deanery filter
    if (filterDeanery !== "all") {
      if (filterDeanery === "unassigned") {
        if (p.deanery_id) return false;
      } else {
        if (p.deanery_id !== filterDeanery) return false;
      }
    }
    // Specialty filter
    if (filterSpecialty !== "all") {
      const role = getUserRole(p.user_id);
      const specs = getUserAssignedSpecs(p.user_id, role);
      if (role === "admin" || role === "super_admin") {
        // Admins have access to all, so show them
      } else if (!specs.includes(filterSpecialty)) {
        return false;
      }
    }
    return true;
  });

  const specLabelFn = (role: RoleName, userId: string) => {
    if (role === "super_admin") return "All (all deaneries)";
    if (role === "admin") return "All (within deanery)";
    const specs = getUserAssignedSpecs(userId, role);
    if (specs.length === 0) return role === "trainee" ? "None assigned" : "—";
    return specialties?.filter((s) => specs.includes(s.id)).map((s) => s.short_name).join(", ") ?? "—";
  };

  // A render function, not a component: defined in here, a component would be
  // a new type every render and remount its menu each time.
  const userActions = (profile: Tables<"profiles">) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Actions for ${profile.first_name ?? ""} ${profile.last_name ?? ""}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => openPermissions(profile)}>
          <Settings className="mr-2 h-3.5 w-3.5" /> Manage permissions
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setResetTarget(profile)}>
          <Mail className="mr-2 h-3.5 w-3.5" /> Send password reset link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setNewPassword(""); setPasswordTarget(profile); }}>
          <KeyRound className="mr-2 h-3.5 w-3.5" /> Set password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(profile)}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete user
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Role legend. On a phone it is a single line of names (the description
          is the tooltip); the cards with descriptions come back from sm up. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:hidden">
        {(Object.entries(roleConfig) as [RoleName, typeof roleConfig.admin][]).map(([key, cfg]) => (
          <span key={key} className="inline-flex items-center gap-1" title={cfg.description}>
            <cfg.icon className="h-3 w-3" /> {cfg.label}
          </span>
        ))}
      </div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(roleConfig) as [RoleName, typeof roleConfig.admin][]).map(([key, cfg]) => (
          <Card key={key} className="border-dashed">
            <CardContent className="p-3 flex items-center gap-3">
              <cfg.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold">{cfg.label}</p>
                <p className="text-[10px] text-muted-foreground">{cfg.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-10 sm:h-10" />
        </div>
        <Select value={filterDeanery} onValueChange={(v) => { setFilterDeanery(v); setFilterSpecialty("all"); }}>
          <SelectTrigger className="h-9 flex-1 sm:h-10 sm:w-[180px] sm:flex-none"><SelectValue placeholder="All Deaneries" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Deaneries</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {deaneries?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.short_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSpecialty} onValueChange={setFilterSpecialty}>
          <SelectTrigger className="h-9 flex-1 sm:h-10 sm:w-[180px] sm:flex-none"><SelectValue placeholder="All Specialties" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Specialties</SelectItem>
            {filterDeanerySpecs.filter((s) => s.is_active).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><UserPlus className="h-4 w-4" /> Invite User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite New User</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First name</Label>
                  <Input value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@nhs.net" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as RoleName)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trainee">Trainee</SelectItem>
                    <SelectItem value="facilitator">Facilitator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    {currentUserRole === "super_admin" && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => inviteUser.mutate()} disabled={!inviteEmail || inviteUser.isPending}>
                {inviteUser.isPending ? "Sending…" : "Send Invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* User count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered?.length ?? 0} of {profiles?.length ?? 0} users
        {filterDeanery !== "all" && ` in ${filterDeanery === "unassigned" ? "unassigned" : getDeaneryName(filterDeanery)}`}
        {filterSpecialty !== "all" && ` · ${specialties?.find((s) => s.id === filterSpecialty)?.short_name}`}
      </p>

      {/* Permissions dialog */}
      <Dialog open={!!permDialogUser} onOpenChange={(o) => { if (!o) setPermDialogUser(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage Permissions — {permDialogUser?.first_name} {permDialogUser?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Deanery assignment */}
            <div className="space-y-2">
              <Label>Deanery</Label>
              <Select
                value={selectedDeaneryId || "none"}
                onValueChange={(v) => {
                  setSelectedDeaneryId(v === "none" ? "" : v);
                  setSelectedSpecialties([]);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a deanery" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No deanery</SelectItem>
                  {deaneries?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The user will be allocated to this deanery.</p>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={(v) => { setSelectedRole(v as RoleName); setSelectedSpecialties([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trainee">
                    <span className="flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> Trainee</span>
                  </SelectItem>
                  <SelectItem value="facilitator">
                    <span className="flex items-center gap-2"><UserCheck className="h-3.5 w-3.5" /> Facilitator</span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2"><Shield className="h-3.5 w-3.5" /> Admin</span>
                  </SelectItem>
                  {currentUserRole === "super_admin" && (
                    <SelectItem value="super_admin">
                      <span className="flex items-center gap-2"><Crown className="h-3.5 w-3.5" /> Super Admin</span>
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Specialty assignment — only for facilitator/trainee and when a deanery is selected */}
            {(selectedRole === "facilitator" || selectedRole === "trainee") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    {selectedRole === "facilitator" ? "Can manage resources in:" : "Can access resources in:"}
                  </Label>
                  <div className="flex gap-2">
                    <button className="text-[10px] text-accent-deep hover:underline" onClick={selectAllSpecialties}>Select all</button>
                    <button className="text-[10px] text-muted-foreground hover:underline" onClick={clearAllSpecialties}>Clear</button>
                  </div>
                </div>

                {!selectedDeaneryId ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-4 text-center">
                    Select a deanery first to see available specialties.
                  </p>
                ) : dialogDeanerySpecs.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md p-4 text-center">
                    No active specialties in this deanery.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {selectedRole === "trainee"
                        ? "This trainee will only see specialties ticked below."
                        : "This facilitator can add/edit/delete resources only within these specialties."}
                    </p>
                    <div className="grid grid-cols-2 gap-1 max-h-60 overflow-y-auto border rounded-md p-3">
                      {dialogDeanerySpecs.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5">
                          <Checkbox
                            checked={selectedSpecialties.includes(s.id)}
                            onCheckedChange={() => toggleSpecialty(s.id)}
                          />
                          <span className="text-xs">
                            {s.parent_specialty_id ? "↳ " : ""}{s.short_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {selectedDeaneryId && selectedSpecialties.length === 0 && (
                  <p className="text-xs text-destructive">
                    {selectedRole === "trainee"
                      ? "⚠ No specialties selected — this user won't see any resources"
                      : "Select at least one specialty"}
                  </p>
                )}
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => {
                if (permDialogUser) {
                  updateRole.mutate({
                    userId: permDialogUser.user_id,
                    newRole: selectedRole,
                    deaneryId: selectedDeaneryId,
                    specialtyIds: (selectedRole === "admin" || selectedRole === "super_admin") ? [] : selectedSpecialties,
                  });
                }
              }}
              disabled={updateRole.isPending}
            >
              {updateRole.isPending ? "Saving…" : "Save Permissions"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Users table */}
      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Deanery</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Specialties</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-14"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : !filtered?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            ) : (
              filtered.map((p) => {
                const role = getUserRole(p.user_id);
                const cfg = roleConfig[role];
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.first_name} {p.last_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getDeaneryName(p.deanery_id)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={role === "super_admin" || role === "admin" ? "destructive" : role === "facilitator" ? "default" : "secondary"}
                        className="text-xs gap-1"
                      >
                        <cfg.icon className="h-3 w-3" /> {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={specLabelFn(role, p.user_id)}>
                      {specLabelFn(role, p.user_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(p.created_at).toLocaleDateString("en-GB")}
                    </TableCell>
                    <TableCell>
                      {userActions(p)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Users on a phone: a compact card each, instead of a seven-column
          table that has to be scrolled sideways. */}
      <div className="space-y-2 md:hidden">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !filtered?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No users found</p>
        ) : (
          filtered.map((p) => {
            const role = getUserRole(p.user_id);
            const cfg = roleConfig[role];
            return (
              <div key={p.id} className="flex items-start gap-2 rounded-md border bg-card px-3 py-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{p.first_name} {p.last_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge
                      variant={role === "super_admin" || role === "admin" ? "destructive" : role === "facilitator" ? "default" : "secondary"}
                      className="gap-1 px-1.5 py-0 text-[10px]"
                    >
                      <cfg.icon className="h-2.5 w-2.5" /> {cfg.label}
                    </Badge>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{getDeaneryName(p.deanery_id)}</Badge>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{specLabelFn(role, p.user_id)}</p>
                </div>
                {userActions(p)}
              </div>
            );
          })
        )}
      </div>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleteUser.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.first_name} {deleteTarget?.last_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This deletes their sign-in account along with their profile, roles,
              specialty assignments and register memberships. They will no longer be
              able to log in. Resources they added stay in the library. This cannot be
              undone — to let them back in, invite them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUser.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUser.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteUser.mutate(deleteTarget.user_id);
              }}
            >
              {deleteUser.isPending ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send reset link */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => { if (!o && !sendResetLink.isPending) setResetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send a password reset link?</AlertDialogTitle>
            <AlertDialogDescription>
              {resetTarget?.first_name} {resetTarget?.last_name} will be emailed a link at{" "}
              <span className="font-medium text-foreground">{resetTarget?.email}</span> to choose a new
              password. Their current password keeps working until they do.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendResetLink.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sendResetLink.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (resetTarget) sendResetLink.mutate(resetTarget);
              }}
            >
              {sendResetLink.isPending ? "Sending…" : "Send link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset link that could not be emailed */}
      <Dialog open={!!resetLink} onOpenChange={(o) => { if (!o) setResetLink(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>The email could not be sent</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pass this link to {resetLink?.name || "them"} yourself. It lets whoever opens it
              set the password, so send it only to them. It expires after a short while.
            </p>
            <Input readOnly value={resetLink?.link ?? ""} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button
              className="w-full gap-1.5"
              onClick={() => {
                if (!resetLink) return;
                navigator.clipboard.writeText(resetLink.link).then(
                  () => toast.success("Link copied"),
                  () => toast.error("Could not copy — select the link and copy it"),
                );
              }}
            >
              <Copy className="h-4 w-4" /> Copy link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Set password */}
      <Dialog
        open={!!passwordTarget}
        onOpenChange={(o) => { if (!o && !setPassword.isPending) { setPasswordTarget(null); setNewPassword(""); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set password — {passwordTarget?.first_name} {passwordTarget?.last_name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (passwordTarget && newPassword.length >= 8) {
                setPassword.mutate({ userId: passwordTarget.user_id, password: newPassword });
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="admin-new-password">New password</Label>
              <Input
                id="admin-new-password"
                type="text"
                autoComplete="off"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <p className="text-xs text-muted-foreground">
                Their old password stops working straight away. Tell them the new one
                securely, and ask them to change it from their profile.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={newPassword.length < 8 || setPassword.isPending}>
              {setPassword.isPending ? "Saving…" : "Set password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
