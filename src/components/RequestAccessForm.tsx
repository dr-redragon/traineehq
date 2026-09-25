import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { portalField, portalLabel } from "@/components/PortalShell";

/**
 * Asking for an account.
 *
 * This used to be a page of its own. It is a tab on the sign-in page now — the
 * two doors are one decision, and sending somebody to a second URL to make it
 * lost the address they had already typed. It is a component rather than markup
 * inside that page because /request-access still resolves, and both arrive here.
 *
 * The validation, the insert and the confirmation email are the page's own,
 * carried over unchanged: the deanery is what scopes the specialty list, and a
 * specialty may be nested under a parent.
 */
export function RequestAccessForm({ onSignIn }: { onSignIn: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [deaneryId, setDeaneryId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("none");
  const [trainingGrade, setTrainingGrade] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: deaneries } = useQuery({
    queryKey: ["public-deaneries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("deaneries")
        .select("id, name, short_name")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: specialties } = useQuery({
    queryKey: ["public-specialties", deaneryId],
    queryFn: async () => {
      if (!deaneryId) return [];
      const { data } = await supabase
        .from("specialties")
        .select("id, short_name, parent_specialty_id")
        .eq("deanery_id", deaneryId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      return data ?? [];
    },
    enabled: !!deaneryId,
  });

  const topLevel = specialties?.filter((s) => !s.parent_specialty_id) ?? [];
  const childrenOf = (parentId: string) =>
    specialties?.filter((s) => s.parent_specialty_id === parentId) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedReason = reason.trim();
    const trimmedGrade = trainingGrade.trim();

    if (trimmedFirst.length < 1 || trimmedFirst.length > 100) {
      toast.error("First name must be between 1 and 100 characters."); return;
    }
    if (trimmedLast.length < 1 || trimmedLast.length > 100) {
      toast.error("Last name must be between 1 and 100 characters."); return;
    }
    // Trailing `-` in a character class is literal, so it needs no escape.
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address."); return;
    }
    if (trimmedReason.length > 2000) {
      toast.error("Reason must be under 2000 characters."); return;
    }
    if (trimmedGrade.length > 50) {
      toast.error("Training grade must be under 50 characters."); return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("access_requests").insert({
      first_name: trimmedFirst,
      last_name: trimmedLast,
      email: trimmedEmail,
      deanery_id: deaneryId || null,
      specialty_id: specialtyId === "none" ? null : specialtyId,
      training_grade: trimmedGrade || null,
      reason: trimmedReason || null,
    });

    setSubmitting(false);
    if (error) {
      if (error.message?.includes("already submitted")) {
        toast.error("You've already submitted a request recently. Please wait before trying again.");
      } else {
        toast.error("Failed to submit request. Please try again.");
      }
    } else {
      setSubmitted(true);
      const selectedSpecialty = specialties?.find((s) => s.id === specialtyId);
      supabase.functions.invoke("access-request-email", {
        body: {
          type: "submission_confirmation",
          applicant_email: trimmedEmail,
          applicant_name: `${trimmedFirst} ${trimmedLast}`,
          specialty_name: selectedSpecialty?.short_name || "General",
          training_grade: trimmedGrade || undefined,
        },
      }).catch((e) => console.error("Email notification error:", e));
    }
  };

  if (submitted) {
    return (
      <div className="space-y-4 border-2 border-foreground p-6">
        <CheckCircle className="h-8 w-8 text-rule" />
        <h3 className="font-display text-2xl font-extrabold tracking-tight">Request submitted</h3>
        <p className="text-pretty text-sm text-muted-foreground">
          An administrator will review it. You&apos;ll get an email once your account has been
          approved.
        </p>
        <Button variant="outline" onClick={onSignIn} className="h-11 w-full justify-between">
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-[18px]">
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ra-first" className={portalLabel}>First name</Label>
          <Input
            id="ra-first"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={portalField}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ra-last" className={portalLabel}>Last name</Label>
          <Input
            id="ra-last"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={portalField}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ra-email" className={portalLabel}>Email address</Label>
        <Input
          id="ra-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={portalField}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ra-deanery" className={portalLabel}>Deanery</Label>
        <Select
          value={deaneryId}
          onValueChange={(v) => {
            setDeaneryId(v);
            setSpecialtyId("none");
          }}
        >
          <SelectTrigger id="ra-deanery" className={portalField}>
            <SelectValue placeholder="Select a deanery" />
          </SelectTrigger>
          <SelectContent>
            {deaneries?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ra-specialty" className={portalLabel}>Specialty</Label>
          <Select value={specialtyId} onValueChange={setSpecialtyId} disabled={!deaneryId}>
            <SelectTrigger id="ra-specialty" className={portalField}>
              <SelectValue placeholder={deaneryId ? "Select a specialty" : "Deanery first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not sure / General</SelectItem>
              {topLevel.map((s) => {
                const children = childrenOf(s.id);
                if (children.length === 0) {
                  return <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>;
                }
                return [
                  <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>,
                  ...children.map((c) => (
                    <SelectItem key={c.id} value={c.id}>  ↳ {c.short_name}</SelectItem>
                  )),
                ];
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ra-grade" className={portalLabel}>Grade</Label>
          <Input
            id="ra-grade"
            value={trainingGrade}
            onChange={(e) => setTrainingGrade(e.target.value)}
            placeholder="e.g. ST3"
            className={portalField}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ra-reason" className={portalLabel}>
          Why would you like access? (optional)
        </Label>
        <Textarea
          id="ra-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="resize-none px-3.5 py-2.5 text-base"
        />
      </div>

      <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground">
        Requests are approved by the programme admin team, usually within two working days.
      </p>

      <Button
        type="submit"
        className="h-12 w-full justify-between text-[15px]"
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
