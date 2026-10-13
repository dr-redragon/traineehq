import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, Crown, Eye, RotateCcw, Shield, UserCheck } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

export type GrantRole = "trainee" | "facilitator" | "admin" | "super_admin";
export interface ApprovalGrant { role: GrantRole; deanery_id: string | null; specialty_ids: string[] }

/** The fields of an access request this dialog reads. */
export interface ApprovableRequest {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  specialty_id: string | null;
  deanery_id: string | null;
  register_id: string | null;
}

interface Spec { id: string; short_name: string; deanery_id: string; is_active: boolean; parent_specialty_id: string | null }

/**
 * What a request turns into once it is approved, decided before Approve is
 * pressed. It opens set to what the applicant asked for — their deanery and
 * specialty, as a trainee (or a facilitator, for a register's request) — and
 * the admin can change any of it. The function re-checks every choice against
 * what this admin may grant.
 */
export function ApproveRequestDialog({
  request, open, onOpenChange, onApprove, approving,
}: {
  request: ApprovableRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (grant: ApprovalGrant) => void;
  approving: boolean;
}) {
  const { data: myRole } = useUserRole();

  const { data: deaneries } = useQuery({
    queryKey: ["approval-deaneries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deaneries").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: specialties } = useQuery({
    queryKey: ["approval-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties").select("id, short_name, deanery_id, is_active, parent_specialty_id").order("sort_order");
      if (error) throw error;
      return data as Spec[];
    },
  });

  const [role, setRole] = useState<GrantRole>("trainee");
  const [deaneryId, setDeaneryId] = useState("");
  const [specIds, setSpecIds] = useState<string[]>([]);

  // What the applicant asked for.
  const requested = (): { role: GrantRole; deaneryId: string; specIds: string[] } => {
    const spec = specialties?.find((s) => s.id === request?.specialty_id);
    return {
      role: request?.register_id ? "facilitator" : "trainee",
      deaneryId: request?.deanery_id ?? spec?.deanery_id ?? "",
      specIds: request?.specialty_id ? [request.specialty_id] : [],
    };
  };
  const resetToRequested = () => {
    const r = requested();
    setRole(r.role);
    setDeaneryId(r.deaneryId);
    setSpecIds(r.specIds);
  };

  // Start from the request each time a different one is opened.
  useEffect(() => {
    if (open && request) resetToRequested();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request?.id, specialties]);

  const deanerySpecs = specialties?.filter((s) => s.deanery_id === deaneryId && s.is_active) ?? [];
  const takesSpecialties = role === "trainee" || role === "facilitator";
  const allSelected = deanerySpecs.length > 0 && deanerySpecs.every((s) => specIds.includes(s.id));
  const nameOf = (id: string | null) => specialties?.find((s) => s.id === id)?.short_name;
  const deaneryName = (id: string | null) => deaneries?.find((d) => d.id === id)?.name;

  const asked = requested();
  const changed =
    role !== asked.role || deaneryId !== asked.deaneryId ||
    specIds.length !== asked.specIds.length || specIds.some((id) => !asked.specIds.includes(id));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!approving) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve {request?.first_name} {request?.last_name}</DialogTitle>
          <DialogDescription>
            Choose what their account gets. It starts as they asked; change anything before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-sm border bg-muted/40 p-3 text-xs">
          <p className="font-semibold text-foreground">They asked for</p>
          <p className="text-muted-foreground">
            Deanery: <strong className="text-foreground">{deaneryName(asked.deaneryId || null) ?? "None given"}</strong>
            {" · "}Specialty: <strong className="text-foreground">{nameOf(request?.specialty_id ?? null) ?? "None given"}</strong>
          </p>
          {changed && (
            <button type="button" className="inline-flex items-center gap-1 text-accent-deep hover:underline" onClick={resetToRequested}>
              <RotateCcw className="h-3 w-3" /> Use what they asked for
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="approve-deanery">Deanery</Label>
            <Select value={deaneryId || "none"} onValueChange={(v) => { setDeaneryId(v === "none" ? "" : v); setSpecIds([]); }}>
              <SelectTrigger id="approve-deanery"><SelectValue placeholder="Select a deanery" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No deanery</SelectItem>
                {deaneries?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="approve-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as GrantRole)}>
              <SelectTrigger id="approve-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trainee"><span className="flex items-center gap-2"><Eye className="h-3.5 w-3.5" /> Trainee</span></SelectItem>
                <SelectItem value="facilitator"><span className="flex items-center gap-2"><UserCheck className="h-3.5 w-3.5" /> Facilitator</span></SelectItem>
                <SelectItem value="admin"><span className="flex items-center gap-2"><Shield className="h-3.5 w-3.5" /> Admin</span></SelectItem>
                {myRole === "super_admin" && (
                  <SelectItem value="super_admin"><span className="flex items-center gap-2"><Crown className="h-3.5 w-3.5" /> Super Admin</span></SelectItem>
                )}
              </SelectContent>
            </Select>
            {(role === "admin" || role === "super_admin") && (
              <p className="text-xs text-muted-foreground">
                {role === "admin"
                  ? deaneryId ? "Full access within this deanery." : "No deanery: full access across every deanery (super admins only)."
                  : "Full access across all deaneries."}
              </p>
            )}
          </div>

          {takesSpecialties && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{role === "facilitator" ? "Can manage resources in" : "Can access resources in"}</Label>
                {deanerySpecs.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-accent-deep hover:underline"
                    onClick={() => setSpecIds(allSelected ? [] : deanerySpecs.map((s) => s.id))}
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                )}
              </div>
              {!deaneryId ? (
                <p className="rounded-sm border p-3 text-center text-xs text-muted-foreground">Choose a deanery to see its specialties.</p>
              ) : deanerySpecs.length === 0 ? (
                <p className="rounded-sm border p-3 text-center text-xs text-muted-foreground">No active specialties in this deanery.</p>
              ) : (
                <div className="grid max-h-56 grid-cols-1 gap-0.5 overflow-y-auto rounded-sm border p-2 sm:grid-cols-2">
                  {deanerySpecs.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted/50">
                      <Checkbox
                        checked={specIds.includes(s.id)}
                        onCheckedChange={() =>
                          setSpecIds((prev) => prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                      />
                      <span>{s.parent_specialty_id ? "↳ " : ""}{s.short_name}{s.id === request?.specialty_id ? " (requested)" : ""}</span>
                    </label>
                  ))}
                </div>
              )}
              {deaneryId && specIds.length === 0 && (
                <p className="text-xs text-destructive">
                  No specialties ticked — they will be able to sign in but see no resources.
                </p>
              )}
            </div>
          )}

          {request?.register_id && (
            <p className="text-xs text-muted-foreground">
              They will also be added to the teaching register that asked for this account.
            </p>
          )}

          <Button
            className="w-full gap-1.5"
            disabled={approving}
            onClick={() => onApprove({
              role,
              deanery_id: deaneryId || null,
              specialty_ids: takesSpecialties ? specIds : [],
            })}
          >
            <CheckCircle className="h-4 w-4" /> {approving ? "Approving…" : "Approve and send their email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
