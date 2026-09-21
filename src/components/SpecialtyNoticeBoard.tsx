import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/RichText";
import { RichTextArea } from "@/components/RichTextArea";
import { Plus, Trash2, X, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

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
      return data as any[];
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
    },
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
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
          {notices.map((notice: any) =>
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
                  // Held at low contrast until the row is under the cursor, so
                  // the band reads as a notice rather than as a row of tools.
                  <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit notice"
                      className="h-7 w-7 text-background/70 hover:bg-background/15 hover:text-background"
                      onClick={() => { setEditingId(notice.id); setEditContent(notice.content); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove notice"
                      className="h-7 w-7 text-background/70 hover:bg-background/15 hover:text-background"
                      onClick={() => deleteNotice.mutate(notice.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
