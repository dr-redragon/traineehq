import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/RichText";
import { RichTextArea } from "@/components/RichTextArea";
import { Plus, Trash2, X, Pencil, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

/**
 * Say what a refused write actually means.
 *
 * Row-level security does not explain itself: a blocked update comes back as
 * an empty result or a policy violation, neither of which tells the person at
 * the keyboard that they are allowed to write notices but not to change this
 * one. Left raw, that reads as the feature being broken.
 */
function noticeWriteError(e: Error): string {
  const message = e.message ?? "";
  if (/row-level security|violates row/i.test(message)) {
    return "You do not have permission to change this notice.";
  }
  return message || "That did not save.";
}

/**
 * A row of `specialty_notices`.
 *
 * Declared here rather than taken from the generated Supabase types, which
 * predate the table — the same reason the queries below reach for `as any`.
 * Regenerating them would remove both.
 */
interface Notice {
  id: string;
  specialty_id: string;
  content: string;
  author_id: string;
  created_at: string;
  is_active: boolean;
}

interface SpecialtyNoticeBoardProps {
  specialtyId: string;
  canManage: boolean;
}

/**
 * A specialty's notices, drawn the way the dashboard draws its own.
 *
 * The dashboard already had a notice bar — ink across the full width, NOTICE
 * flush left in small caps, the text inline after it and the attribution at
 * the far end — and the design system runs the accent as a poster in exactly
 * one place, inverting the notice under it so two fields never compete. This
 * board used to be a collapsible panel with a megaphone and a chevron, which
 * said "a widget on a page" where the dashboard's said "a notice". They are
 * the same thing and now read the same.
 *
 * The bands are full-bleed, so this renders its own `px-9` rather than sitting
 * inside the banner's padding: an ink strip inset by a gutter on each side
 * would read as a box, which is the thing being removed.
 *
 * Composing stays on the light ground. The bands are for reading; a rich-text
 * toolbar and a pair of form buttons inverted onto ink would be a second,
 * worse copy of controls that already work.
 */
export function SpecialtyNoticeBoard({ specialtyId, canManage }: SpecialtyNoticeBoardProps) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: notices } = useQuery({
    queryKey: ["specialty-notices", specialtyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialty_notices" as any)
        .select("*")
        .eq("specialty_id", specialtyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Notice[];
    },
    enabled: !!specialtyId,
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profile_display_names");
      if (error) throw error;
      return data;
    },
  });

  const getAuthorName = (authorId: string) => {
    const p = profiles?.find((pr) => pr.user_id === authorId);
    return p ? `${p.first_name} ${p.last_name}`.trim() || "Admin" : "Admin";
  };

  const addNotice = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Not logged in");
      const { error } = await supabase.from("specialty_notices" as any).insert({
        specialty_id: specialtyId,
        author_id: currentUser.id,
        content: newContent,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice posted");
      queryClient.invalidateQueries({ queryKey: ["specialty-notices", specialtyId] });
      setNewContent("");
      setAdding(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteNotice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("specialty_notices" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice removed");
      queryClient.invalidateQueries({ queryKey: ["specialty-notices", specialtyId] });
      setDeletingId(null);
    },
    onError: (e: Error) => { setDeletingId(null); toast.error(noticeWriteError(e)); },
  });

  const updateNotice = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase.from("specialty_notices" as any).update({ content } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notice updated");
      queryClient.invalidateQueries({ queryKey: ["specialty-notices", specialtyId] });
      setEditingId(null);
      setEditContent("");
    },
    onError: (e: Error) => toast.error(noticeWriteError(e)),
  });

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (!notices?.length && !canManage) return null;

  /** The compose / edit form, on the light ground under the bands. */
  const editor = (
    value: string,
    onChange: (v: string) => void,
    onCancel: () => void,
    onSave: () => void,
    saving: boolean,
    saveLabel: string,
    placeholder?: string,
  ) => (
    <div className="space-y-2 border-t-2 border-border px-9 py-4">
      <RichTextArea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        className="text-sm"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-3.5 w-3.5" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={!value.trim() || saving}>
          <Check className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      {/* One ink band per notice, divided the way the dashboard divides its
          own when more than one is running. */}
      {notices?.length ? (
        <div className="divide-y divide-background/20">
          {notices.map((notice) =>
            editingId === notice.id ? (
              <div key={notice.id}>
                {editor(
                  editContent,
                  setEditContent,
                  () => { setEditingId(null); setEditContent(""); },
                  () => updateNotice.mutate({ id: notice.id, content: editContent }),
                  updateNotice.isPending,
                  "Save",
                )}
              </div>
            ) : (
              <div
                key={notice.id}
                className="group flex flex-wrap items-baseline gap-x-5 gap-y-1 bg-foreground px-9 py-4 text-background"
              >
                <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.14em]">
                  Notice
                </span>
                {/* `basis-full` below sm: on a phone the attribution kept its
                    natural width and squeezed the notice itself into a column
                    four words wide. Given a full line of its own, the text
                    reads normally and the attribution drops underneath. */}
                <p className="min-w-0 flex-1 basis-full whitespace-pre-wrap text-sm sm:basis-auto">
                  <RichText text={notice.content} />
                </p>
                <span className="shrink-0 text-[13px] opacity-60">
                  {getAuthorName(notice.author_id)} · {timeAgo(notice.created_at)}
                </span>
                {canManage && (
                  // Always visible, never hover-only.
                  //
                  // These used to fade in with the cursor, which reads well on
                  // a desktop and does not exist on a phone: `:hover` never
                  // fires on touch, so the buttons sat at opacity 0 and the
                  // notices could not be edited or removed at all. Editing
                  // mode is already an explicit choice — once someone has
                  // turned it on, hiding the controls until they guess where
                  // to point is not restraint, it is a dead end.
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit notice: ${notice.content.slice(0, 40)}`}
                      // 40px on a phone, where this is a fingertip rather than a cursor;
                      // back to 32 on a pointer, where the band stays compact.
                      className="h-10 w-10 text-background/80 hover:bg-background/15 hover:text-background sm:h-8 sm:w-8"
                      onClick={() => { setEditingId(notice.id); setEditContent(notice.content); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove notice: ${notice.content.slice(0, 40)}`}
                      // 40px on a phone, where this is a fingertip rather than a cursor;
                      // back to 32 on a pointer, where the band stays compact.
                      className="h-10 w-10 text-background/80 hover:bg-background/15 hover:text-background sm:h-8 sm:w-8"
                      onClick={() => setDeletingId(notice.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                )}
              </div>
            ),
          )}
        </div>
      ) : null}

      {adding
        ? editor(
            newContent,
            setNewContent,
            () => { setAdding(false); setNewContent(""); },
            () => addNotice.mutate(),
            addNotice.isPending,
            "Post notice",
            "Write a notice for this specialty…",
          )
        : canManage && (
            <div className="px-9 py-3">
              <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-xs" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                {notices?.length ? "Add notice" : "Add the first notice"}
              </Button>
            </div>
          )}

      <Dialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this notice?</DialogTitle>
            <DialogDescription>
              It will stop showing on this specialty's page. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingId && (
            <p className="border-l-2 border-rule pl-3 text-sm text-muted-foreground">
              {notices?.find((n) => n.id === deletingId)?.content}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteNotice.isPending}
              onClick={() => deletingId && deleteNotice.mutate(deletingId)}
            >
              {deleteNotice.isPending ? "Removing…" : "Remove notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
