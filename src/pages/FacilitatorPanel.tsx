import { Link } from "react-router-dom";
import { BookOpen, MessageSquare, Phone, Stethoscope, UserCheck, UserPlus } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminAccessRequests } from "@/components/admin/AdminAccessRequests";
import { AdminSpecialtyRequests } from "@/components/admin/AdminSpecialtyRequests";
import { CountBadge } from "@/components/CountBadge";
import { getIcon } from "@/lib/iconMap";
import { useFacilitatedSpecialties } from "@/hooks/useFacilitatedSpecialties";
import { usePendingRequestCounts } from "@/hooks/usePendingRequests";

/**
 * The admin panel, cut down to what a facilitator may do.
 *
 * Two tabs. Requests: account requests that chose one of their specialties,
 * and existing users asking to join one — the same review cards admins use,
 * scoped (specialty requests by row-level security, account requests here,
 * since every facilitator can read those). My specialties: one card per
 * specialty they run, with the way into each thing they can edit there —
 * resources and notices, key contacts, the discussion board. Those are edited
 * where they live rather than copied into a second editor here.
 */
const FacilitatorPanel = () => {
  const { data: specialties, isLoading } = useFacilitatedSpecialties();
  const { data: pending } = usePendingRequestCounts();
  const ids = (specialties ?? []).map((s) => s.id);

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-8 p-9">
        <div className="flex items-center gap-4 border-b-2 border-border pb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-accent">
            <UserCheck className="h-6 w-6 text-rule" />
          </div>
          <div>
            <p className="ds-kicker mb-1">Facilitation</p>
            <h1 className="font-display text-[32px] font-extrabold leading-tight tracking-tight">Facilitator Panel</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Review access requests and manage the specialties you run
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !ids.length ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              You are not a facilitator of any specialty yet. An administrator can assign you
              from the Admin Panel.
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="requests" className="w-full">
            <TabsList className="h-auto flex-wrap gap-0">
              <TabsTrigger value="requests" className="gap-1.5 text-xs">
                <UserPlus className="h-3.5 w-3.5" /> Requests
                <CountBadge count={pending?.total} label="pending requests" />
              </TabsTrigger>
              <TabsTrigger value="specialties" className="gap-1.5 text-xs">
                <Stethoscope className="h-3.5 w-3.5" /> My specialties
              </TabsTrigger>
            </TabsList>

            <TabsContent value="requests" className="mt-4 space-y-10">
              <AdminAccessRequests specialtyIds={ids} />
              <AdminSpecialtyRequests />
            </TabsContent>

            <TabsContent value="specialties" className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {specialties!.map((s) => {
                  const Icon = getIcon(s.icon_name);
                  return (
                    <Card key={s.id}>
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-rule" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{s.short_name}</p>
                            <p className="truncate text-xs text-muted-foreground">{s.name}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline" className="gap-1.5">
                            <Link to={`/specialty/${s.id}`}>
                              <BookOpen className="h-3.5 w-3.5" /> Resources &amp; notices
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="gap-1.5">
                            <Link to={`/specialty/${s.id}#contacts`}>
                              <Phone className="h-3.5 w-3.5" /> Key contacts
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="gap-1.5">
                            <Link to={`/community/${s.id}`}>
                              <MessageSquare className="h-3.5 w-3.5" /> Discussion board
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
};

export default FacilitatorPanel;
