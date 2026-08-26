import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, CheckCircle } from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const RequestAccess = () => {
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
    if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(trimmedEmail)) {
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
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center text-center p-8 space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle className="h-8 w-8 text-accent" />
            </div>
            <h2 className="text-xl font-display font-bold">Request Submitted</h2>
            <p className="text-muted-foreground text-sm">
              Thank you for your interest! Your access request has been submitted and will be reviewed by an administrator.
              You'll receive an email once your account has been approved.
            </p>
            <Link to="/login">
              <Button variant="outline" className="gap-2 mt-4">
                <ArrowLeft className="h-4 w-4" /> Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left - branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden flex-col justify-between p-12">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <img src={logoWhite} alt="HST Training Hub" className="h-10 w-10" />
            <h1 className="text-xl font-display font-semibold text-primary-foreground tracking-tight">
              HST Training Hub
            </h1>
          </div>
          <h2 className="text-4xl font-display font-bold text-primary-foreground leading-tight mb-6">
            Join the<br />community.
          </h2>
          <p className="text-primary-foreground/70 text-lg max-w-md leading-relaxed">
            Request access to the HST Training Hub. Once approved, you'll have access to specialty-specific resources, discussion boards, and key contacts.
          </p>
        </div>
        <p className="relative z-10 text-primary-foreground/40 text-sm">
          © 2026 HST Training Hub. All rights reserved.
        </p>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full border border-accent/10" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full border border-accent/10" />
        <div className="absolute top-20 right-20 w-32 h-32 rounded-full bg-accent/5" />
      </div>

      {/* Right - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src={logoWhite} alt="HST Training Hub" className="h-9 w-9 rounded-lg bg-primary p-1" />
            <h1 className="text-lg font-display font-semibold tracking-tight">HST Training Hub</h1>
          </div>

          <h2 className="text-2xl font-display font-bold mb-2">Request Access</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Fill in your details below. An administrator will review your request.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@nhs.net"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Deanery</Label>
              <Select value={deaneryId} onValueChange={(v) => { setDeaneryId(v); setSpecialtyId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Select a deanery" /></SelectTrigger>
                <SelectContent>
                  {deaneries?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Specialty of interest</Label>
              <Select value={specialtyId} onValueChange={setSpecialtyId} disabled={!deaneryId}>
                <SelectTrigger><SelectValue placeholder={deaneryId ? "Select a specialty" : "Select a deanery first"} /></SelectTrigger>
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

            <div className="space-y-1.5">
              <Label htmlFor="grade">Training grade (optional)</Label>
              <Input
                id="grade"
                value={trainingGrade}
                onChange={(e) => setTrainingGrade(e.target.value)}
                placeholder="e.g. ST3, ST5, CT2"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Why would you like access? (optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Brief description of your training needs…"
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={submitting}>
              {submitting ? "Submitting…" : <>Submit Request <Send className="h-4 w-4" /></>}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-accent hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RequestAccess;
