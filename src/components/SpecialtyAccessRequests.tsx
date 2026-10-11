import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Clock, Plus, Stethoscope, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MAX_REASON = 2000;

/**
 * Asking for another specialty, from the profile page.
 *
 * Specialties a person is not on are unreadable to them, so the list comes
 * from requestable_specialties(), which returns exactly the live ones they
 * cannot see yet. A request is decided in the admin panel (or by that
 * specialty's facilitators); approval enrols them, and the specialty appears
 * in their sidebar on the next load.
 */
export function SpecialtyAccessRequests({
  userId, homeDeaneryId,
}: {
  userId: string;
  homeDeaneryId: string | null;
}) {
  const queryClient = useQueryClient();
  const [deaneryId, setDeaneryId] = useState<string>("");
  const [specialtyId, setSpecialtyId] = useState<string>("");
  const [reason, setReason] = useState("");

  const { data: available, isLoading: loadingAvailable } = useQuery({
    queryKey: ["requestable-specialties", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("requestable_specialties");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myRequests } = useQuery({
    queryKey: ["my-specialty-requests", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialty_access_requests")
        .select("id, specialty_id, status, reason, review_note, created_at, reviewed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendingIds = useMemo(
    () => new Set((myRequests ?? []).filter((r) => r.status === "pending").map((r) => r.specialty_id)),
    [myRequests],
  );

  const deaneries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of available ?? []) seen.set(s.deanery_id, s.deanery_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [available]);

  // Default to the person's own deanery when it has anything to offer, else
  // the first that does. An explicit choice always wins.
  const activeDeanery =
    deaneryId ||
    (homeDeaneryId && deaneries.some((d) => d.id === homeDeaneryId) ? homeDeaneryId : deaneries[0]?.id) ||
    "";

  const inDeanery = (available ?? []).filter((s) => s.deanery_id === activeDeanery);
  const nameOf = (id: string) => {
    const s = available?.find((x) => x.id === id);
    return s?.short_name;
  };

  // Decided requests are for specialties the person may now hold, which the
  // requestable list no longer carries; their names come from here instead.
  const { data: requestedNames } = useQuery({
    queryKey: ["my-specialty-request-names", (myRequests ?? []).map((r) => r.specialty_id)],
    queryFn: async () => {
      const ids = [...new Set((myRequests ?? []).map((r) => r.specialty_id))];
      if (!ids.length) return {};
      const { data } = await supabase.from("specialties").select("id, short_name").in("id", ids);
      return Object.fromEntries((data ?? []).map((s) => [s.id, s.short_name]));
    },
    enabled: (myRequests?.length ?? 0) > 0,
  });
  const requestLabel = (id: string) => requestedNames?.[id] ?? nameOf(id) ?? "Specialty";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["my-specialty-requests", userId] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!specialtyId) throw new Error("Choose a specialty first.");
      const trimmed = reason.trim();
      if (trimmed.length > MAX_REASON) throw new Error(`Reason must be under ${MAX_REASON} characters.`);
      const { error } = await supabase.from("specialty_access_requests").insert({
        user_id: userId,
        specialty_id: specialtyId,
        reason: trimmed || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("You already have a pending request for this specialty.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Request sent. An administrator will review it.");
      setSpecialtyId("");
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("specialty_access_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request withdrawn");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
      default:
        return null;
    }
  };

  const topLevel = inDeanery.filter((s) => !s.parent_specialty_id || !inDeanery.some((p) => p.id === s.parent_specialty_id));
  const childrenOf = (id: string) => inDeanery.filter((s) => s.parent_specialty_id === id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-rule" /> Request specialty access
        </CardTitle>
        <CardDescription>
          Ask to be added to another specialty&apos;s pages. An administrator or the
          specialty&apos;s facilitator will review your request.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadingAvailable ? (
          <p className="text-sm text-muted-foreground">Loading specialties…</p>
        ) : !available?.length ? (
          <p className="text-sm text-muted-foreground">
            You already have access to every specialty available.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {deaneries.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="sar-deanery">Deanery</Label>
                  <Select
                    value={activeDeanery}
                    onValueChange={(v) => {
                      setDeaneryId(v);
                      setSpecialtyId("");
                    }}
                  >
                    <SelectTrigger id="sar-deanery">
                      <SelectValue placeholder="Select a deanery" />
                    </SelectTrigger>
                    <SelectContent>
                      {deaneries.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="sar-specialty">Specialty</Label>
                <Select value={specialtyId} onValueChange={setSpecialtyId}>
                  <SelectTrigger id="sar-specialty">
                    <SelectValue placeholder="Select a specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    {topLevel.flatMap((s) => [
                      <SelectItem key={s.id} value={s.id} disabled={pendingIds.has(s.id)}>
                        {s.short_name}{pendingIds.has(s.id) ? " (requested)" : ""}
                      </SelectItem>,
                      ...childrenOf(s.id).map((c) => (
                        <SelectItem key={c.id} value={c.id} disabled={pendingIds.has(c.id)}>
                          {"  ↳ "}{c.short_name}{pendingIds.has(c.id) ? " (requested)" : ""}
                        </SelectItem>
                      )),
                    ])}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sar-reason">Why do you need access? (optional)</Label>
              <Textarea
                id="sar-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={MAX_REASON}
                placeholder="e.g. Starting a rotation in this specialty"
                className="resize-none"
              />
            </div>

            <Button type="submit" size="sm" className="gap-1.5" disabled={!specialtyId || submit.isPending}>
              <Plus className="h-4 w-4" /> {submit.isPending ? "Sending…" : "Request access"}
            </Button>
          </form>
        )}

        {(myRequests?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your requests</p>
            <ul className="divide-y border">
              {myRequests!.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{requestLabel(r.specialty_id)}</span>
                      {statusBadge(r.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Requested{" "}
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    {r.review_note && (
                      <p className="text-xs italic text-muted-foreground">Note: {r.review_note}</p>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 gap-1 text-xs text-muted-foreground"
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate(r.id)}
                    >
                      <X className="h-3.5 w-3.5" /> Withdraw
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
