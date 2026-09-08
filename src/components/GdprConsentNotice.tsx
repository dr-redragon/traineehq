import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  PRIVACY_POLICY_URL, SPECIAL_CATEGORY_NOTE, WHAT_WE_HOLD, hasPublishedPolicies,
} from "@/lib/legal";

/**
 * The data-protection notice, shown once per account.
 *
 * `profiles.gdpr_consent_at` has existed since the baseline with nothing ever
 * setting it, and the README has promised this since the beginning.
 *
 * IT SAYS "ACKNOWLEDGE", NOT "I CONSENT", AND THAT IS DELIBERATE. Consent is
 * one lawful basis among several, and it is the wrong one for a tool trainees
 * have to use: consent must be freely given and freely withdrawn, and neither
 * is true of the system that records your attendance. An NHS training tool is
 * far more likely to be relying on public task or legitimate interests. So
 * this records that somebody was told — which is an obligation under any
 * basis — rather than pretending to a permission that was never really
 * optional. The column keeps its name; the wording tells the truth.
 *
 * Which basis actually applies is the organisation's answer to give, alongside
 * the DPIA. See docs/GO-LIVE.md 6.4.
 */
export function GdprConsentNotice() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["gdpr-consent", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("gdpr_consent_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ gdpr_consent_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gdpr-consent"] });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Nothing to show when signed out, still loading, or already acknowledged.
  // Rendering on an unresolved profile would flash the notice at somebody who
  // dealt with it months ago.
  if (!user || !profile || profile.gdpr_consent_at) return null;

  return (
    <div
      role="region"
      aria-label="Data protection notice"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 backdrop-blur-sm print:hidden"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
        <ShieldCheck className="hidden h-5 w-5 shrink-0 text-accent sm:mt-0.5 sm:block" />

        <div className="flex-1 space-y-2 text-sm">
          <p className="font-semibold">What this site keeps about you</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {WHAT_WE_HOLD.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="text-muted-foreground">{SPECIAL_CATEGORY_NOTE}</p>
          <p className="text-xs text-muted-foreground">
            Essential cookies only — there is no tracking and no advertising. You can
            download or delete your data at any time from your profile.
            {hasPublishedPolicies() && (
              <>
                {" "}
                <a
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline underline-offset-4"
                >
                  Read the full privacy policy
                </a>
                .
              </>
            )}
          </p>
        </div>

        <Button
          size="sm"
          className="shrink-0 self-start"
          disabled={acknowledge.isPending}
          onClick={() => acknowledge.mutate()}
        >
          {acknowledge.isPending ? "Saving…" : "I understand"}
        </Button>
      </div>
    </div>
  );
}
