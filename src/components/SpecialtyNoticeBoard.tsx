import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Megaphone, ChevronDown, Plus, Trash2, X, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

interface SpecialtyNoticeBoardProps {
  specialtyId: string;
  canManage: boolean;
}

export function SpecialtyNoticeBoard({ specialtyId, canManage }: SpecialtyNoticeBoardProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
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

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-accent/20 bg-accent/5">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/10 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold">Notice Board</span>
              {notices?.length ? (
                <span className="text-[10px] text-muted-foreground bg-accent/10 rounded-full px-2 py-0.5">
                  {notices.length}
                </span>
              ) : null}
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-3">
            {notices?.length === 0 && !adding && (
              <p className="text-xs text-muted-foreground text-center py-2">No notices yet.</p>
            )}

            {notices?.map((notice: any) => (
              <div key={notice.id} className="flex items-start gap-3 rounded-md bg-background/60 p-3 border">
                <div className="flex-1 min-w-0">
                  {editingId === notice.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => { setEditingId(null); setEditContent(""); }}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => updateNotice.mutate({ id: notice.id, content: editContent })} disabled={!editContent.trim() || updateNotice.isPending}>
                          <Check className="h-3.5 w-3.5 mr-1" /> {updateNotice.isPending ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{notice.content}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {getAuthorName(notice.author_id)} · {timeAgo(notice.created_at)}
                      </p>
                    </>
                  )}
                </div>
                {canManage && editingId !== notice.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditingId(notice.id); setEditContent(notice.content); }}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => deleteNotice.mutate(notice.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {adding && (
              <div className="space-y-2">
                <Textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write a notice for this specialty…"
                  rows={3}
                  className="text-sm"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setAdding(false); setNewContent(""); }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={() => addNotice.mutate()} disabled={!newContent.trim() || addNotice.isPending}>
                    {addNotice.isPending ? "Posting…" : "Post Notice"}
                  </Button>
                </div>
              </div>
            )}

            {canManage && !adding && (
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Notice
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
