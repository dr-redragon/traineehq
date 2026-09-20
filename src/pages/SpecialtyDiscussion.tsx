import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DiscussionBoard } from "@/components/DiscussionBoard";

/**
 * One specialty's discussion board, on a page of its own.
 *
 * The board used to be bolted to the foot of the specialty page, under the
 * files. That put two long lists on one page and made the discussion — which
 * people come back to repeatedly, and link each other to — something you could
 * only reach by scrolling past a file browser. It has its own address now, so
 * it can be linked, bookmarked and opened directly; the specialty page keeps a
 * short preview of the latest threads pointing here.
 */
const SpecialtyDiscussion = () => {
  const { id } = useParams<{ id: string }>();

  const { data: specialty, isLoading } = useQuery({
    queryKey: ["specialty-name", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("id, name, short_name")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <DashboardLayout breadcrumb="Community / Discussion">
        <p className="p-9 text-sm text-muted-foreground">Loading discussion…</p>
      </DashboardLayout>
    );
  }

  if (!specialty) {
    return (
      <DashboardLayout breadcrumb="Community / Discussion">
        <div className="space-y-4 p-9">
          <p className="text-sm text-muted-foreground">That specialty could not be found.</p>
          <Link
            to="/community"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep underline underline-offset-[3px] hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All discussion boards
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumb={`Community / ${specialty.short_name}`}>
      <div className="animate-fade-in space-y-7 p-9">
        <div className="border-b-2 border-border pb-5">
          <p className="ds-kicker mb-2">Community</p>
          <h1 className="font-display text-[clamp(32px,4vw,46px)] font-extrabold leading-none tracking-[-0.03em]">
            {specialty.short_name} discussion
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link
              to={`/specialty/${specialty.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep underline underline-offset-[3px] hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {specialty.short_name} library
            </Link>
            <Link
              to="/community"
              className="text-sm font-medium text-accent-deep underline underline-offset-[3px] hover:text-primary"
            >
              All discussion boards
            </Link>
          </div>
        </div>

        <DiscussionBoard specialtyId={specialty.id} />
      </div>
    </DashboardLayout>
  );
};

export default SpecialtyDiscussion;
