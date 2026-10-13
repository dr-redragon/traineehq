import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CheckCircle, XCircle, Clock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { pendingRequestsQueryKey } from "@/hooks/usePendingRequests";
import { ApproveRequestDialog, type ApprovableRequest, type ApprovalGrant } from "./ApproveRequestDialog";

/**
 * @param specialtyIds When set, only requests for these specialties are shown
 *   — the facilitator panel passes the specialties its reader runs. Admins see
 *   every request, including those with no specialty chosen.
 */
const QUICK_APPROVE_KEY = "admin-quick-approve";

export function AdminAccessRequests({ specialtyIds }: { specialtyIds?: string[] } = {}) {
  const queryClient = useQueryClient();
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  // Admins choose what an approval grants first; the facilitator panel keeps
  // the one-press approve, giving exactly what was asked for.
  //
  // Quick approve puts the one-press approve back for admins too: it grants
  // exactly what was asked for. Off unless the admin turns it on, and
  // remembered on this device only.
  const [quickApprove, setQuickApprove] = useState(() => {
    try { return localStorage.getItem(QUICK_APPROVE_KEY) === "on"; } catch { return false; }
  });
  const toggleQuickApprove = (on: boolean) => {
    setQuickApprove(on);
    try { localStorage.setItem(QUICK_APPROVE_KEY, on ? "on" : "off"); } catch { /* not remembered */ }
  };
  const choosesGrant = !specialtyIds && !quickApprove;
  const [approving, setApproving] = useState<ApprovableRequest | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["access-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: specialties } = useQuery({
    queryKey: ["all-specialties"],
    queryFn: async () => {
      const { data } = await supabase.from("specialties").select("id, short_name");
      return data ?? [];
    },
  });

  // Requests a register owner filed for a colleague name the register.
  const { data: registers } = useQuery({
    queryKey: ["access-request-registers"],
    queryFn: async () => {
      const { data } = await supabase.from("registers" as any).select("id, name");
      return (data ?? []) as unknown as { id: string; name: string }[];
    },
  });
  const getRegisterName = (id: string) =>
    registers?.find((r) => r.id === id)?.name ?? "a teaching register";

  const getSpecialtyName = (id: string | null) => {
    if (!id) return "General";
    return specialties?.find((s) => s.id === id)?.short_name ?? "Unknown";
  };

  const decide = async (id: string, status: "approved" | "rejected" | "pending") => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("access_requests" as any)
      .update(status === "pending"
        ? { status, reviewed_by: null, reviewed_at: null, review_note: null }
        : {
            status,
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString(),
            review_note: reviewNote[id]?.trim() || null,
          } as any)
      .eq("id", id);
    if (error) throw error;
  };

  // Approve with the admin's chosen set-up. The account is only made once the
  // decision is recorded; if the function refuses the set-up, the request goes
  // back to pending rather than sitting approved with no account behind it.
  const approveWithGrant = useMutation({
    mutationFn: async ({ id, grant }: { id: string; grant: ApprovalGrant }) => {
      await decide(id, "approved");
      const { data, error } = await supabase.functions.invoke("access-request-email", {
        body: { type: "approved", request_id: id, grant },
      });
      const failure = error
        ? await ((error as { context?: Response }).context?.json?.().catch(() => null) ?? null)
        : null;
      const message = failure?.error ?? (error ? error.message : data?.error);
      if (message) {
        await decide(id, "pending").catch(() => {});
        throw new Error(message);
      }
      return data as { email_sent?: boolean };
    },
    onSuccess: (data) => {
      if (data?.email_sent === false) {
        toast.warning("Approved and their account is set up, but the email to them could not be sent");
      } else {
        toast.success("Approved — their account is set up and they have been emailed");
      }
      setApproving(null);
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      queryClient.invalidateQueries({ queryKey: pendingRequestsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => {
      toast.error(`Not approved: ${e.message}`);
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
    },
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("access_requests" as any)
        .update({
          status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote[id]?.trim() || null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, status }) => {
      toast.success(`Request ${status}`);
      queryClient.invalidateQueries({ queryKey: ["access-requests"] });
      queryClient.invalidateQueries({ queryKey: pendingRequestsQueryKey });
      // Send approval/rejection email to applicant. The function reads the
      // applicant, specialty and note from the request row it is named by, and
      // checks the reviewer may decide that request — nothing else is sent.
      supabase.functions.invoke("access-request-email", {
        body: { type: status, request_id: id },
      }).catch((e) => console.error("Email notification error:", e));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inScope = (requests ?? []).filter((r: any) =>
    !specialtyIds || (r.specialty_id && specialtyIds.includes(r.specialty_id))
  );

  const filtered = inScope.filter((r: any) =>
    filter === "all" ? true : r.status === filter
  );

  const pendingCount = inScope.filter((r: any) => r.status === "pending").length;

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Account Requests</h3>
          <p className="text-xs text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? "s" : ""}` : "No pending requests"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
        {!specialtyIds && (
          <label htmlFor="quick-approve" className="flex cursor-pointer items-center gap-2 text-xs" title="Approve in one press, giving exactly what they asked for">
            <Switch id="quick-approve" checked={quickApprove} onCheckedChange={toggleQuickApprove} />
            <span className={quickApprove ? "font-medium text-foreground" : "text-muted-foreground"}>Quick approve</span>
          </label>
        )}
        <div className="flex items-center rounded-md border bg-background">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              } first:rounded-l-md last:rounded-r-md`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No {filter === "all" ? "" : filter} requests found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req: any) => (
            <Card key={req.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{req.first_name} {req.last_name}</span>
                      {statusBadge(req.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span>{req.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                      <span>Specialty: <strong className="text-foreground">{getSpecialtyName(req.specialty_id)}</strong></span>
                      {req.training_grade && <span>Grade: <strong className="text-foreground">{req.training_grade}</strong></span>}
                      <span>Submitted: {new Date(req.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    {req.register_id && (
                      <p className="text-xs mt-2 rounded border border-primary/30 bg-primary/5 p-2">
                        Requested by a register owner for <strong>{getRegisterName(req.register_id)}</strong>.
                        Approving creates the account, adds them to that register
                        {req.specialty_id ? <> and makes them a <strong>facilitator of {getSpecialtyName(req.specialty_id)}</strong></> : null}.
                      </p>
                    )}
                    {req.reason && (
                      <p className="text-xs text-muted-foreground mt-2 bg-secondary/50 rounded p-2">
                        "{req.reason}"
                      </p>
                    )}
                    {req.review_note && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Review note: {req.review_note}
                      </p>
                    )}
                  </div>
                </div>

                {req.status === "pending" && (
                  <div className="flex flex-col gap-3 pt-2 border-t sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1">
                      <Textarea
                        value={reviewNote[req.id] ?? ""}
                        onChange={(e) => setReviewNote((prev) => ({ ...prev, [req.id]: e.target.value }))}
                        placeholder="Add a note (required for rejection)…"
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => updateRequest.mutate({ id: req.id, status: "rejected" })}
                        disabled={updateRequest.isPending || !(reviewNote[req.id]?.trim())}
                        title={!(reviewNote[req.id]?.trim()) ? "A reason is required when rejecting" : ""}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                      {!specialtyIds && quickApprove && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setApproving(req)}
                          disabled={updateRequest.isPending || approveWithGrant.isPending}
                          title="Choose their deanery, role and specialties before approving"
                        >
                          Set up…
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => choosesGrant
                          ? setApproving(req)
                          : updateRequest.mutate({ id: req.id, status: "approved" })}
                        disabled={updateRequest.isPending || approveWithGrant.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> {choosesGrant ? "Approve…" : "Approve"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ApproveRequestDialog
        request={approving}
        open={!!approving}
        onOpenChange={(o) => { if (!o) setApproving(null); }}
        approving={approveWithGrant.isPending}
        onApprove={(grant) => approving && approveWithGrant.mutate({ id: approving.id, grant })}
      />
    </div>
  );
}
