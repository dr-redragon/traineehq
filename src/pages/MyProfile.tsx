import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, GraduationCap, Stethoscope, Save, Download, Trash2, Shield, Eye, UserCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

const TRAINING_GRADES = [
  "Foundation Year 1 (FY1)",
  "Foundation Year 2 (FY2)",
  "Core Surgical Training (CST1)",
  "Core Surgical Training (CST2)",
  "Specialty Training Year 3 (ST3)",
  "Specialty Training Year 4 (ST4)",
  "Specialty Training Year 5 (ST5)",
  "Specialty Training Year 6 (ST6)",
  "Specialty Training Year 7 (ST7)",
  "Specialty Training Year 8 (ST8)",
  "Post-CCT Fellow",
  "Consultant",
  "Other",
];

const roleIcons: Record<string, typeof Shield> = {
  admin: Shield,
  facilitator: UserCheck,
  trainee: Eye,
};

const MyProfile = () => {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [trainingGrade, setTrainingGrade] = useState("");
  const [dirty, setDirty] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: userRole } = useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      if (data?.some((r) => r.role === "admin")) return "admin";
      if (data?.some((r) => r.role === "facilitator")) return "facilitator";
      return "trainee";
    },
    enabled: !!user,
  });

  const { data: assignedSpecialties } = useQuery({
    queryKey: ["my-specialties", user?.id, userRole],
    queryFn: async () => {
      if (!user) return [];
      if (userRole === "admin") {
        const { data } = await supabase.from("specialties").select("short_name");
        return data?.map((s) => s.short_name) ?? [];
      }
      if (userRole === "facilitator") {
        const { data } = await supabase.from("facilitator_specialties").select("specialty_id").eq("user_id", user.id);
        if (!data?.length) return [];
        const ids = data.map((d) => d.specialty_id);
        const { data: specs } = await supabase.from("specialties").select("short_name").in("id", ids);
        return specs?.map((s) => s.short_name) ?? [];
      }
      const { data } = await supabase.from("trainee_specialties").select("specialty_id").eq("user_id", user.id);
      if (!data?.length) return [];
      const ids = data.map((d) => d.specialty_id);
      const { data: specs } = await supabase.from("specialties").select("short_name").in("id", ids);
      return specs?.map((s) => s.short_name) ?? [];
    },
    enabled: !!user && !!userRole,
  });

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name ?? "");
      setLastName(profile.last_name ?? "");
      setEmail(profile.email ?? "");
      setTrainingGrade((profile as any).training_grade ?? "");
      setDirty(false);
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          training_grade: trainingGrade || null,
        } as any)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadData = async () => {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-data.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data downloaded");
  };

  const deleteAccount = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not logged in");
      await supabase.from("profiles").delete().eq("user_id", user.id);
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      toast.success("Account deleted");
      window.location.href = "/login";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const RoleIcon = roleIcons[userRole ?? "trainee"] ?? Eye;

  const handleFieldChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setDirty(true);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading profile…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-display font-bold">My Profile</h1>
          <p className="text-sm text-muted-foreground">View and manage your account details</p>
        </div>

        {/* Role & Specialty summary */}
        <Card>
          <CardContent className="p-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <RoleIcon className="h-4 w-4 text-accent" />
              <Badge variant={userRole === "admin" ? "destructive" : userRole === "facilitator" ? "default" : "secondary"} className="text-xs capitalize">
                {userRole}
              </Badge>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2 flex-wrap">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              {assignedSpecialties?.length ? (
                assignedSpecialties.map((s) => (
                  <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No specialties assigned</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Personal details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-accent" /> Personal Details
            </CardTitle>
            <CardDescription>Update your name, email address, and training grade</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={firstName} onChange={handleFieldChange(setFirstName)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={lastName} onChange={handleFieldChange(setLastName)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">
                <Mail className="inline h-3.5 w-3.5 mr-1" />Email
              </Label>
              <Input id="email" type="email" value={email} onChange={handleFieldChange(setEmail)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                <GraduationCap className="inline h-3.5 w-3.5 mr-1" />Training Grade
              </Label>
              <Select
                value={trainingGrade}
                onValueChange={(v) => { setTrainingGrade(v); setDirty(true); }}
              >
                <SelectTrigger><SelectValue placeholder="Select your training grade" /></SelectTrigger>
                <SelectContent>
                  {TRAINING_GRADES.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => updateProfile.mutate()}
              disabled={!dirty || updateProfile.isPending}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {updateProfile.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5 text-accent" /> Change Password
            </CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmNewPassword">Confirm new password</Label>
              <Input
                id="confirmNewPassword"
                type="password"
                placeholder="••••••••"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>
            {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
            {newPassword && newPassword.length < 6 && (
              <p className="text-xs text-destructive">Password must be at least 6 characters</p>
            )}
            <Button
              disabled={!newPassword || newPassword.length < 6 || newPassword !== confirmNewPassword}
              onClick={async () => {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) {
                  toast.error(error.message);
                } else {
                  toast.success("Password updated successfully");
                  setNewPassword("");
                  setConfirmNewPassword("");
                }
              }}
              className="gap-1.5"
            >
              <Lock className="h-4 w-4" /> Update Password
            </Button>
          </CardContent>
        </Card>

        {/* GDPR / Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Data & Privacy</CardTitle>
            <CardDescription>
              In accordance with GDPR, you can download or delete your stored data at any time.
              We store your name, email, specialty, training grade, and login timestamps.
              Your data is not shared with third parties.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadData}>
              <Download className="h-4 w-4" /> Download My Data
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-1.5">
                  <Trash2 className="h-4 w-4" /> Delete My Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove your profile and all associated data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteAccount.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteAccount.isPending ? "Deleting…" : "Yes, delete my account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MyProfile;
