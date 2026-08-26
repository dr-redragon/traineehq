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
import { Search, UserPlus, Shield, Trash2, Settings, UserCheck, Eye, Crown } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { useUserRole } from "@/hooks/useUserRole";

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


  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("profiles").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("User removed");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
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

  return (
    <div className="space-y-4">
      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterDeanery} onValueChange={(v) => { setFilterDeanery(v); setFilterSpecialty("all"); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Deaneries" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Deaneries</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {deaneries?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.short_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSpecialty} onValueChange={setFilterSpecialty}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Specialties" /></SelectTrigger>
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
                    <button className="text-[10px] text-accent hover:underline" onClick={selectAllSpecialties}>Select all</button>
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
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Deanery</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Specialties</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-28">Actions</TableHead>
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
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Manage permissions" onClick={() => openPermissions(p)}>
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete user" onClick={() => deleteUser.mutate(p.user_id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
