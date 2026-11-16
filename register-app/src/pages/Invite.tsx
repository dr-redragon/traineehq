import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { acceptInvite, fetchInvitePreview } from "@/lib/register/api";

/**
 * The page an invitation link opens. Signed-out visitors are sent to sign in
 * first and brought back here.
 *
 * The link is the invitation: whoever holds it and signs in may accept it,
 * once. That is deliberate — somebody invited at an nhs.net address who signs
 * in with Apple's private relay has no address that would match.
 */
export default function Invite() {
  const { token = "" } = useParams<{ token: string }>();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: preview, isLoading } = useQuery({
    queryKey: ["invite-preview", token, user?.id],
    queryFn: () => fetchInvitePreview(token),
    enabled: !!user && !!token,
  });

  const accept = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: ({ slug, name }) => {
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
      toast.success(`You now have access to ${name}.`);
      navigate(`/registers/${slug}`, { replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="mx-auto h-56 w-full max-w-lg" />;

  const problem = !preview
    ? "This invitation has been withdrawn or replaced by a newer one."
    : !preview.usable && !preview.already_member
      ? "This invitation has expired or has already been used."
      : null;
  const role = preview?.role === "owner" ? "an owner" : preview?.role === "viewer" ? "a viewer" : "an editor";

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-5 p-6 sm:p-8">
        {problem ? (
          <>
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              This invitation no longer works
            </h1>
            <p className="text-sm text-muted-foreground">
              {problem} Ask whoever invited you to send it again.
            </p>
            <Button asChild variant="outline"><Link to="/registers">Your registers</Link></Button>
          </>
        ) : (
          <>
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">
              Invitation
            </p>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
              {preview!.register_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {preview!.invited_by ? `${preview!.invited_by} has` : "You have been"} invited
              {preview!.invited_by ? " you" : ""} to help run this{" "}
              {preview!.kind === "event" ? "event register" : "teaching register"}
              {preview!.organisation ? ` for ${preview!.organisation}` : ""} as{" "}
              {role}.{" "}
              {preview!.role === "owner"
                ? "Owners can do everything, including inviting and removing people."
                : preview!.role === "viewer"
                  ? "Viewers can see and export everything, and change nothing."
                  : "Editors record attendance, run check-in and send certificates."}{" "}
              It costs you nothing.
            </p>
            {preview!.already_member ? (
              <Button asChild><Link to={`/registers/${preview!.slug}`}>Open the register</Link></Button>
            ) : preview!.wrong_account ? (
              <p className="border-l-4 border-rule pl-3 text-sm">
                This invitation makes its holder an owner, so it only works for the address
                it was sent to. Sign out, then sign in with that address and open the link
                again.
              </p>
            ) : (
              <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
                {accept.isPending ? "Accepting…" : "Accept invitation"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Signed in as {user?.email}.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
