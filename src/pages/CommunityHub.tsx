import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { useDeanery } from "@/contexts/DeaneryContext";
import { cn } from "@/lib/utils";

/** The same relative clock the board itself uses. */
function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/**
 * Discussion boards, across every specialty.
 *
 * This page used to be an index of specialties — a grid of names, each a door
 * to a board — so finding out what was actually being discussed meant opening
 * eight doors. The design reads it the other way round: the page is the
 * threads themselves, newest first, with the specialties as filters over them.
 * A card still leads to its specialty's board, so nothing is lost; you just
 * see what is there before you go.
 */
const CommunityHub = () => {
  const { activeDeanery } = useDeanery();
  const [filter, setFilter] = useState<string | null>(null);

  const { data: specialties } = useQuery({
    queryKey: ["community-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase
        .from("specialties")
        .select("id, name, short_name, parent_specialty_id, sort_order")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      if (activeDeanery) query = query.eq("deanery_id", activeDeanery.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!activeDeanery,
  });

  const { data: discussions, isLoading } = useQuery({
    queryKey: ["community-discussions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("id, title, content, specialty_id, author_id, created_at, is_pinned")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["community-comment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("discussion_comments").select("discussion_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: votes } = useQuery({
    queryKey: ["community-vote-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("discussion_votes").select("discussion_id, vote_type");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profile_display_names");
      if (error) throw error;
      return data;
    },
  });

  const specialtyOf = (id: string) => specialties?.find((s) => s.id === id);

  const authorOf = (id: string) => {
    const p = profiles?.find((pr: { user_id: string }) => pr.user_id === id) as
      | { first_name?: string; last_name?: string }
      | undefined;
    const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
    return name || "Anonymous";
  };

  const replyCount = (id: string) => (comments ?? []).filter((c) => c.discussion_id === id).length;

  const voteCount = (id: string) =>
    (votes ?? [])
      .filter((v) => v.discussion_id === id)
      .reduce((total, v) => total + (v.vote_type ?? 0), 0);

  // Only specialties that actually have a thread earn a filter — a row of
  // chips that return nothing is worse than no row at all.
  const withThreads = (specialties ?? []).filter((s) =>
    (discussions ?? []).some((d) => d.specialty_id === s.id),
  );

  const shown = (discussions ?? []).filter((d) => !filter || d.specialty_id === filter);

  return (
    <DashboardLayout>
      <div className="animate-fade-in space-y-7 p-9">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-border pb-5">
          <div>
            <p className="ds-kicker mb-2">Community</p>
            <h1 className="font-display text-[clamp(32px,4vw,46px)] font-extrabold leading-none tracking-[-0.03em]">
              Discussion boards
            </h1>
          </div>
        </div>

        {/* The specialties become filters over the threads rather than the
            page's content. "All" is a filled tag, the rest outlined — the
            design system's own pairing for a selected chip among unselected. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter(null)}>
              <Badge variant={filter === null ? "default" : "outline"}>All</Badge>
            </button>
            {withThreads.map((s) => (
              <button key={s.id} onClick={() => setFilter(s.id)}>
                <Badge variant={filter === s.id ? "default" : "outline"}>{s.short_name}</Badge>
              </button>
            ))}
          </div>
          <span className="text-[13px] text-muted-foreground">Sorted by most recent</span>
        </div>

        {isLoading ? (
          <p className="py-10 text-sm text-muted-foreground">Loading discussions…</p>
        ) : !shown.length ? (
          <div className="border border-dashed border-border px-4 py-10">
            <p className="text-sm text-muted-foreground">
              No discussions yet. Open a specialty and start the conversation.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {shown.map((d) => {
              const spec = specialtyOf(d.specialty_id);
              const replies = replyCount(d.id);
              const upvotes = voteCount(d.id);
              return (
                <Link
                  key={d.id}
                  to={`/specialty/${d.specialty_id}#discussion`}
                  className={cn(
                    "flex flex-col gap-2.5 bg-card p-4 transition-colors hover:bg-accent",
                    d.is_pinned && "border-l-2 border-rule",
                  )}
                >
                  <span className="ds-kicker">{spec?.short_name ?? "Specialty"}</span>
                  <span className="font-display text-[19px] font-extrabold leading-tight tracking-[-0.01em]">
                    {d.title}
                  </span>
                  <span className="text-[13.5px] text-muted-foreground">
                    {authorOf(d.author_id)} · {timeAgo(d.created_at)}
                  </span>
                  <div className="mt-auto flex gap-4 border-t border-border pt-2.5 text-[13px] text-muted-foreground">
                    <span>
                      {upvotes} {upvotes === 1 ? "upvote" : "upvotes"}
                    </span>
                    <span>
                      {replies} {replies === 1 ? "reply" : "replies"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CommunityHub;
