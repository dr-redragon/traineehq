import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Clock, Mail, User } from "lucide-react";
import { toast } from "sonner";

export function AdminAccessRequests() {
  const queryClient = useQueryClient();
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

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

  const getSpecialtyName = (id: string | null) => {
    if (!id) return "General";
    return specialties?.find((s) => s.id === id)?.short_name ?? "Unknown";
  };

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
      // Send approval/rejection email to applicant
      const req = requests?.find((r: any) => r.id === id);
      if (req) {
        supabase.functions.invoke("access-request-email", {
          body: {
            type: status,
            applicant_email: req.email,
            applicant_name: `${req.first_name} ${req.last_name}`,
            specialty_id: req.specialty_id || undefined,
            deanery_id: req.deanery_id || undefined,
            specialty_name: getSpecialtyName(req.specialty_id),
            review_note: status === "rejected" ? (reviewNote[id]?.trim() || undefined) : undefined,
          },
        }).catch((e) => console.error("Email notification error:", e));
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = requests?.filter((r: any) =>
    filter === "all" ? true : r.status === filter
  ) ?? [];

  const pendingCount = requests?.filter((r: any) => r.status === "pending").length ?? 0;

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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Access Requests</h3>
          <p className="text-xs text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} pending request${pendingCount > 1 ? "s" : ""}` : "No pending requests"}
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
                  <div className="flex items-end gap-3 pt-2 border-t">
                    <div className="flex-1 space-y-1">
                      <Textarea
                        value={reviewNote[req.id] ?? ""}
                        onChange={(e) => setReviewNote((prev) => ({ ...prev, [req.id]: e.target.value }))}
                        placeholder="Add a note (required for rejection)…"
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
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
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => updateRequest.mutate({ id: req.id, status: "approved" })}
                        disabled={updateRequest.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Approve
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
