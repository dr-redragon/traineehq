import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MessageSquare, Pin } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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

const PREVIEW_COUNT = 4;

/**
 * The last few threads in a specialty, at the foot of its page.
 *
 * The whole board used to live here — composer, voting, comment threads, the
 * lot — which made the discussion the longest thing on a page that is meant to
 * be about the specialty's files, and put a second scrolling list under the
 * first. The board now has a page of its own; this is the doorway to it.
 *
 * Pinned threads first, then the most recent, because a pinned thread is
 * pinned precisely so it is seen from here.
 */
export function SpecialtyDiscussionPreview({
  specialtyId,
  specialtyName,
}: {
  specialtyId: string;
  specialtyName: string;
}) {
  const { data: threads, isLoading } = useQuery({
    queryKey: ["specialty-discussion-preview", specialtyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("id, title, author_id, created_at, is_pinned")
        .eq("specialty_id", specialtyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["specialty-discussion-preview-counts", specialtyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("discussion_comments").select("discussion_id");
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

  const authorOf = (id: string) => {
    const p = profiles?.find((pr: { user_id: string }) => pr.user_id === id) as
      | { first_name?: string; last_name?: string }
      | undefined;
    return `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Anonymous";
  };

  const replyCount = (id: string) => (comments ?? []).filter((c) => c.discussion_id === id).length;

  const ordered = [...(threads ?? [])].sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const shown = ordered.slice(0, PREVIEW_COUNT);
  const more = ordered.length - shown.length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-border pb-2.5">
        <h2 className="font-display text-xl font-extrabold tracking-tight">Discussion</h2>
        <Button asChild size="sm">
          <Link to={`/community/${specialtyId}`}>New post</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading discussion…</p>
      ) : !shown.length ? (
        <div className="flex flex-wrap items-center gap-3 py-6">
          <MessageSquare className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No discussions in {specialtyName} yet.
          </p>
          <Link
            to={`/community/${specialtyId}`}
            className="text-sm font-medium text-accent-deep underline underline-offset-[3px] hover:text-primary"
          >
            Start one
          </Link>
        </div>
      ) : (
        <>
          {shown.map((t) => (
            <Link
              key={t.id}
              to={`/community/${specialtyId}`}
              className="ds-row flex items-baseline justify-between gap-5 border-b border-border px-1 py-3.5"
            >
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  {t.is_pinned && <Pin className="h-3 w-3 shrink-0 self-center text-rule" aria-label="Pinned" />}
                  <span className="text-[16px] font-semibold">{t.title}</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                  {authorOf(t.author_id)} · {timeAgo(t.created_at)}
                </span>
              </span>
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {replyCount(t.id)} {replyCount(t.id) === 1 ? "reply" : "replies"}
              </span>
            </Link>
          ))}

          <Link
            to={`/community/${specialtyId}`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-deep underline underline-offset-[3px] hover:text-primary"
          >
            {more > 0
              ? `All ${ordered.length} discussions in ${specialtyName}`
              : `Open the ${specialtyName} board`}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}
