import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Kind = "account_requests" | "register_account_requests" | "specialty_requests";

interface Prefs {
  account_requests: boolean;
  register_account_requests: boolean;
  specialty_requests: boolean;
  deanery_ids: string[] | null;
}

// No saved row means everything on, for every deanery — what admins got before
// these settings existed.
const DEFAULTS: Prefs = {
  account_requests: true,
  register_account_requests: true,
  specialty_requests: true,
  deanery_ids: null,
};

const KINDS: { kind: Kind; label: string; hint: string }[] = [
  {
    kind: "account_requests",
    label: "New account requests",
    hint: "Someone fills in the Request access form.",
  },
  {
    kind: "register_account_requests",
    label: "Account requests from register owners",
    hint: "A register owner asks for an account for a colleague.",
  },
  {
    kind: "specialty_requests",
    label: "Specialty access requests",
    hint: "A signed-in user asks to join another specialty.",
  },
];

/**
 * Which request emails an administrator receives, and for which deaneries.
 * Each change saves straight away. access-request-email reads these when it
 * decides who to notify.
 */
export function NotificationPreferences({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  const { data: saved, isLoading } = useQuery({
    queryKey: ["notification-preferences", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("account_requests, register_account_requests, specialty_requests, deanery_ids")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Prefs | null) ?? DEFAULTS;
    },
  });

  const { data: deaneries } = useQuery({
    queryKey: ["notification-deaneries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deaneries").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => { if (saved) setPrefs(saved); }, [saved]);

  const save = useMutation({
    mutationFn: async (next: Prefs) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification settings saved");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences", userId] });
    },
    onError: (e: Error) => {
      toast.error(`Not saved: ${e.message}`);
      if (saved) setPrefs(saved);
    },
  });

  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    save.mutate(next);
  };

  const someDeaneries = prefs.deanery_ids !== null;
  const toggleDeanery = (id: string) => {
    const current = prefs.deanery_ids ?? [];
    update({ deanery_ids: current.includes(id) ? current.filter((d) => d !== id) : [...current, id] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-rule" /> Email notifications
        </CardTitle>
        <CardDescription>
          Choose which requests you are emailed about. They still appear in the admin panel
          either way. Changes save as you make them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="divide-y border">
              {KINDS.map(({ kind, label, hint }) => (
                <label key={kind} htmlFor={`notify-${kind}`} className="flex cursor-pointer items-center justify-between gap-4 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                  <Switch
                    id={`notify-${kind}`}
                    checked={prefs[kind]}
                    disabled={save.isPending}
                    onCheckedChange={(on) => update({ [kind]: on } as Partial<Prefs>)}
                  />
                </label>
              ))}
            </div>

            {(deaneries?.length ?? 0) > 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Which deaneries</p>
                <RadioGroup
                  value={someDeaneries ? "some" : "all"}
                  onValueChange={(v) => update({ deanery_ids: v === "all" ? null : prefs.deanery_ids ?? [] })}
                  className="gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all" id="notify-all-deaneries" />
                    <Label htmlFor="notify-all-deaneries" className="font-normal">
                      Every deanery I review requests for
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="some" id="notify-some-deaneries" />
                    <Label htmlFor="notify-some-deaneries" className="font-normal">Only these deaneries</Label>
                  </div>
                </RadioGroup>
                {someDeaneries && (
                  <div className="ml-6 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {deaneries!.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                        <Checkbox
                          checked={prefs.deanery_ids!.includes(d.id)}
                          disabled={save.isPending}
                          onCheckedChange={() => toggleDeanery(d.id)}
                        />
                        {d.name}
                      </label>
                    ))}
                    {prefs.deanery_ids!.length === 0 && (
                      <p className="text-xs text-red-700 dark:text-red-400 sm:col-span-2">
                        No deaneries ticked, so you will not be emailed about any requests.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
