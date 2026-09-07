import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRegisterStore } from "@/lib/register/api";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import { useCurrentUser } from "@/hooks/useUserRole";
import { EMPTY_REGISTER } from "@/lib/register/types";

/**
 * One register.
 *
 * The register's own screens are ported in Stage 6 of
 * docs/REGISTER-INTEGRATION-PLAN.md; what is here now is the route, the
 * membership gate and a read of the stored blob — enough to prove the whole path
 * works end to end, from sign-in through RLS to the data.
 *
 * The gate is a courtesy, not the boundary. Row-level security is what actually
 * withholds the register: a non-member who edits the URL gets a page saying they
 * have no access, and would get nothing back from the database even if they
 * did not.
 */
export default function RegisterDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: user } = useCurrentUser();
  const { data: directory, isLoading: directoryLoading } = useRegisterDirectory();

  const entry = directory?.find((r) => r.slug === slug);

  const { data: store, isLoading: storeLoading } = useQuery({
    queryKey: ["register-store", entry?.id, user?.id],
    queryFn: () => fetchRegisterStore(entry!.id),
    enabled: !!entry?.id && !!entry?.i_am_member,
  });

  if (directoryLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!entry) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            There is no register at this address.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/registers">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All registers
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!entry.i_am_member) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-semibold">
              You do not have access to this register
            </h1>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              {entry.deanery_name} · {entry.specialty_name}. Access is granted per person:
              ask for it from the register list, and anyone who already belongs to this
              register can approve it.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/registers">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All registers
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const blob = store?.data ?? EMPTY_REGISTER;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {entry.specialty_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entry.deanery_name} · {entry.member_count}{" "}
          {entry.member_count === 1 ? "member" : "members"}
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          {storeLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-2xl font-semibold">{blob.trainees?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Trainees</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">{blob.sessions?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Teaching days</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold">
                    {Object.keys(blob.attendance ?? {}).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Attendance marks</p>
                </div>
              </div>

              <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
                The register's own screens — attendance, teaching days, reports, check-in
                and certificates — are still being brought across. This page confirms the
                data is here and readable by you.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
