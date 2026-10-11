import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Clock, Mail, User, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { pendingRequestsQueryKey } from "@/hooks/usePendingRequests";

type Filter = "pending" | "approved" | "rejected" | "all";

/**
 * Signed-in users asking for another specialty, from their profile page.
 *
 * Sits under the account requests on the same tab and works the same way:
 * approve, or decline with a reason. The decision goes through
 * decide_specialty_access_request(), which enrols the person on approval in
 * the same transaction — there is no second step to forget.
 */
export function AdminSpecialtyRequests() {
  const queryClient = useQueryClient();
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("pending");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["specialty-access-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialty_access_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const userIds = [...new Set((requests ?? []).map((r) => r.user_id))];

  const { data: people } = useQuery({
    queryKey: ["specialty-access-request-people", userIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, training_grade")
        .in("user_id", userIds);
      return data ?? [];
    },
    enabled: userIds.length > 0,
  });

  const { data: specialties } = useQuery({
    queryKey: ["all-specialties"],
    queryFn: async () => {
      const { data } = await supabase.from("specialties").select("id, short_name");
      return data ?? [];
    },
  });

  const personOf = (id: string) => people?.find((p) => p.user_id === id);
  const specialtyName = (id: string) =>
    specialties?.find((s) => s.id === id)?.short_name ?? "Unknown";

  const decide = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("decide_specialty_access_request", {
        _request_id: id,
        _approve: approve,
        _note: reviewNote[id]?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, { id, approve }) => {
      toast.success(approve ? "Request approved — access granted" : "Request declined");
      supabase.functions
        .invoke("access-request-email", {
          body: { type: "specialty_request_decided", request_id: id },
        })
        .catch((e) => console.error("Email notification error:", e));
      queryClient.invalidateQueries({ queryKey: ["specialty-access-requests"] });
      queryClient.invalidateQueries({ queryKey: pendingRequestsQueryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = requests?.filter((r) => (filter === "all" ? true : r.status === filter)) ?? [];
  const pendingCount = requests?.filter((r) => r.status === "pending").length ?? 0;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Specialty Access Requests</h3>
          <p className="text-xs text-muted-foreground">
            Existing users asking to join another specialty ·{" "}
            {pendingCount > 0 ? `${pendingCount} pending` : "none pending"}
          </p>
        </div>
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No {filter === "all" ? "" : filter} specialty requests found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const person = personOf(req.user_id);
            const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Unknown user";
            const note = reviewNote[req.id]?.trim();
            return (
              <Card key={req.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{name}</span>
                      {statusBadge(req.status)}
                    </div>
                    {person?.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{person.email}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                      <span className="inline-flex items-center gap-1">
                        <Stethoscope className="h-3 w-3" />
                        Requesting: <strong className="text-foreground">{specialtyName(req.specialty_id)}</strong>
                      </span>
                      {person?.training_grade && <span>Grade: <strong className="text-foreground">{person.training_grade}</strong></span>}
                      <span>Submitted: {new Date(req.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
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

                  {req.status === "pending" && (
                    <div className="flex items-end gap-3 pt-2 border-t">
                      <div className="flex-1">
                        <Textarea
                          value={reviewNote[req.id] ?? ""}
                          onChange={(e) => setReviewNote((prev) => ({ ...prev, [req.id]: e.target.value }))}
                          placeholder="Add a note (required to decline)…"
                          rows={2}
                          className="text-xs"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => decide.mutate({ id: req.id, approve: false })}
                          disabled={decide.isPending || !note}
                          title={!note ? "A reason is required when declining" : ""}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Decline
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => decide.mutate({ id: req.id, approve: true })}
                          disabled={decide.isPending}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Approve
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
