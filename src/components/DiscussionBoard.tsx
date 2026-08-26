import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, MessageSquare, ArrowBigUp, ArrowBigDown, Pin, Trash2, Clock, User, Send, ChevronDown, ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

interface DiscussionBoardProps {
  specialtyId: string;
}

type SortOption = "recent" | "oldest" | "most_upvoted" | "most_discussed";

export function DiscussionBoard({ specialtyId }: DiscussionBoardProps) {
  const queryClient = useQueryClient();
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const { data: role } = useUserRole();

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: discussions, isLoading } = useQuery({
    queryKey: ["discussions", specialtyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussions")
        .select("*")
        .eq("specialty_id", specialtyId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
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

  const { data: comments } = useQuery({
    queryKey: ["discussion-comments", expandedPost],
    queryFn: async () => {
      if (!expandedPost) return [];
      const { data, error } = await supabase
        .from("discussion_comments")
        .select("*")
        .eq("discussion_id", expandedPost)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!expandedPost,
  });

  const { data: commentCounts } = useQuery({
    queryKey: ["discussion-comment-counts", specialtyId, discussions?.map(d => d.id).join()],
    queryFn: async () => {
      if (!discussions?.length) return {};
      const { data, error } = await supabase
        .from("discussion_comments")
        .select("discussion_id")
        .in("discussion_id", discussions.map((d) => d.id));
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((c) => { counts[c.discussion_id] = (counts[c.discussion_id] || 0) + 1; });
      return counts;
    },
    enabled: !!discussions?.length,
  });

  const { data: votes } = useQuery({
    queryKey: ["discussion-votes", specialtyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discussion_votes")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  const getAuthorName = (authorId: string) => {
    const p = profiles?.find((pr) => pr.user_id === authorId);
    return p ? `${p.first_name} ${p.last_name}`.trim() || "Anonymous" : "Anonymous";
  };

  const getVoteCount = (discussionId?: string, commentId?: string) => {
    if (!votes) return 0;
    return votes
      .filter((v) => (discussionId ? v.discussion_id === discussionId : v.comment_id === commentId))
      .reduce((sum, v) => sum + v.vote_type, 0);
  };

  const getUserVote = (discussionId?: string, commentId?: string) => {
    if (!votes || !currentUser) return 0;
    const vote = votes.find((v) =>
      v.user_id === currentUser.id &&
      (discussionId ? v.discussion_id === discussionId : v.comment_id === commentId)
    );
    return vote?.vote_type ?? 0;
  };

  const createPost = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Not logged in");
      const { error } = await supabase.from("discussions").insert({
        specialty_id: specialtyId,
        author_id: currentUser.id,
        title: postTitle,
        content: postContent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post created");
      queryClient.invalidateQueries({ queryKey: ["discussions", specialtyId] });
      setNewPostOpen(false);
      setPostTitle("");
      setPostContent("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addComment = useMutation({
    mutationFn: async ({ discussionId, parentId }: { discussionId: string; parentId?: string }) => {
      if (!currentUser) throw new Error("Not logged in");
      const { error } = await supabase.from("discussion_comments").insert({
        discussion_id: discussionId,
        parent_id: parentId || null,
        author_id: currentUser.id,
        content: replyContent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reply added");
      queryClient.invalidateQueries({ queryKey: ["discussion-comments", expandedPost] });
      setReplyContent("");
      setReplyingTo(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const castVote = useMutation({
    mutationFn: async ({ discussionId, commentId, voteType }: { discussionId?: string; commentId?: string; voteType: number }) => {
      if (!currentUser) throw new Error("Not logged in");
      const existing = getUserVote(discussionId ?? undefined, commentId ?? undefined);
      if (existing === voteType) {
        // Remove vote
        if (discussionId) {
          await supabase.from("discussion_votes").delete().eq("user_id", currentUser.id).eq("discussion_id", discussionId);
        } else if (commentId) {
          await supabase.from("discussion_votes").delete().eq("user_id", currentUser.id).eq("comment_id", commentId);
        }
      } else {
        // Upsert
        if (discussionId) {
          await supabase.from("discussion_votes").delete().eq("user_id", currentUser.id).eq("discussion_id", discussionId);
          await supabase.from("discussion_votes").insert({
            user_id: currentUser.id, discussion_id: discussionId, vote_type: voteType,
          });
        } else if (commentId) {
          await supabase.from("discussion_votes").delete().eq("user_id", currentUser.id).eq("comment_id", commentId);
          await supabase.from("discussion_votes").insert({
            user_id: currentUser.id, comment_id: commentId, vote_type: voteType,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discussion-votes"] });
    },
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discussions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post deleted");
      queryClient.invalidateQueries({ queryKey: ["discussions", specialtyId] });
      if (expandedPost) setExpandedPost(null);
    },
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("discussions").update({ is_pinned: !pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pin updated");
      queryClient.invalidateQueries({ queryKey: ["discussions", specialtyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("discussion_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comment deleted");
      queryClient.invalidateQueries({ queryKey: ["discussion-comments", expandedPost] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdmin = role === "admin";
  const isFacilitator = role === "facilitator";
  const canPin = isAdmin || isFacilitator;

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

  const topLevelComments = comments?.filter((c) => !c.parent_id) ?? [];
  const getReplies = (parentId: string) => comments?.filter((c) => c.parent_id === parentId) ?? [];

  const sortedDiscussions = (() => {
    if (!discussions) return [];
    const pinned = discussions.filter((d) => d.is_pinned);
    const unpinned = discussions.filter((d) => !d.is_pinned);
    const sorted = [...unpinned].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "most_upvoted":
          return getVoteCount(b.id) - getVoteCount(a.id);
        case "most_discussed":
          return (commentCounts?.[b.id] ?? 0) - (commentCounts?.[a.id] ?? 0);
        case "recent":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return [...pinned, ...sorted];
  })();

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "recent", label: "Most Recent" },
    { value: "oldest", label: "Oldest First" },
    { value: "most_upvoted", label: "Most Upvoted" },
    { value: "most_discussed", label: "Most Discussed" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm">Discussion Board</h3>
          <p className="text-xs text-muted-foreground">Ask questions, share insights, and discuss with fellow trainees</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center rounded-md border bg-background overflow-x-auto">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                  sortBy === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                } first:rounded-l-md last:rounded-r-md`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Dialog open={newPostOpen} onOpenChange={setNewPostOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 shrink-0"><Plus className="h-4 w-4" /> New Post</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Discussion Post</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="What would you like to discuss?" />
                </div>
                <div className="space-y-1.5">
                  <Label>Content</Label>
                  <Textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} rows={5} placeholder="Share your thoughts, questions, or resources…" />
                </div>
                <Button className="w-full" onClick={() => createPost.mutate()} disabled={!postTitle.trim() || !postContent.trim() || createPost.isPending}>
                  {createPost.isPending ? "Posting…" : "Post Discussion"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading discussions…</p>
      ) : !discussions?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No discussions yet. Start the conversation!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedDiscussions.map((post) => {
            const voteCount = getVoteCount(post.id);
            const userVote = getUserVote(post.id);
            const isExpanded = expandedPost === post.id;

            return (
              <Card key={post.id} className={`transition-shadow ${isExpanded ? "shadow-md ring-1 ring-accent/20" : "hover:shadow-sm"} ${post.is_pinned ? "border-accent/30 bg-accent/5" : ""}`}>
                <CardContent className="p-0">
                  <div className="flex">
                    {/* Vote column */}
                    <div className="flex flex-col items-center gap-0.5 px-3 py-4 border-r bg-muted/30">
                      <button
                        onClick={() => castVote.mutate({ discussionId: post.id, voteType: 1 })}
                        className={`p-0.5 rounded hover:bg-accent/20 transition-colors ${userVote === 1 ? "text-accent" : "text-muted-foreground"}`}
                      >
                        <ArrowBigUp className="h-5 w-5" />
                      </button>
                      <span className={`text-xs font-semibold ${voteCount > 0 ? "text-accent" : voteCount < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {voteCount}
                      </span>
                      <button
                        onClick={() => castVote.mutate({ discussionId: post.id, voteType: -1 })}
                        className={`p-0.5 rounded hover:bg-destructive/20 transition-colors ${userVote === -1 ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        <ArrowBigDown className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {post.is_pinned && <Pin className="h-3 w-3 text-accent" />}
                            <h4 className="text-sm font-semibold hover:text-accent transition-colors">{post.title}</h4>
                          </div>
                          <p className={`text-sm text-muted-foreground ${isExpanded ? "" : "line-clamp-2"}`}>{post.content}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canPin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              title={post.is_pinned ? "Unpin" : "Pin"}
                              onClick={() => togglePin.mutate({ id: post.id, pinned: !!post.is_pinned })}
                            >
                              <Pin className={`h-3.5 w-3.5 ${post.is_pinned ? "text-accent fill-accent" : "text-muted-foreground"}`} />
                            </Button>
                          )}
                          {currentUser && (currentUser.id === post.author_id || isAdmin) && (
                            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => deletePost.mutate(post.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {getAuthorName(post.author_id)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(post.created_at)}</span>
                        <button
                          className="flex items-center gap-1 hover:text-accent transition-colors"
                          onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                        >
                          <MessageSquare className="h-3 w-3" />
                          {(commentCounts?.[post.id] ?? 0) > 0 ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-semibold">{commentCounts[post.id]}</Badge>
                          ) : null}
                          Comments
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Comments section */}
                      {isExpanded && (
                        <div className="mt-4 border-t pt-4 space-y-3">
                          {/* Top-level comments */}
                          {topLevelComments.map((comment) => (
                            <CommentThread
                              key={comment.id}
                              comment={comment}
                              replies={getReplies(comment.id)}
                              getAuthorName={getAuthorName}
                              timeAgo={timeAgo}
                              currentUserId={currentUser?.id}
                              isAdmin={isAdmin}
                              replyingTo={replyingTo}
                              setReplyingTo={setReplyingTo}
                              replyContent={replyContent}
                              setReplyContent={setReplyContent}
                              onReply={(parentId) => addComment.mutate({ discussionId: post.id, parentId })}
                              isReplying={addComment.isPending}
                              getVoteCount={(cid) => getVoteCount(undefined, cid)}
                              getUserVote={(cid) => getUserVote(undefined, cid)}
                              onVote={(cid, vt) => castVote.mutate({ commentId: cid, voteType: vt })}
                              onDelete={(id) => deleteComment.mutate(id)}
                            />
                          ))}

                          {/* Reply input */}
                          <div className="flex gap-2 pt-2">
                            <Textarea
                              value={replyingTo ? "" : replyContent}
                              onChange={(e) => { if (!replyingTo) setReplyContent(e.target.value); }}
                              placeholder="Write a comment…"
                              rows={2}
                              className="text-sm"
                              disabled={!!replyingTo}
                            />
                            <Button
                              size="icon"
                              onClick={() => addComment.mutate({ discussionId: post.id })}
                              disabled={!replyContent.trim() || addComment.isPending || !!replyingTo}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CommentThreadProps {
  comment: { id: string; content: string; author_id: string; created_at: string };
  replies: { id: string; content: string; author_id: string; created_at: string }[];
  getAuthorName: (id: string) => string;
  timeAgo: (date: string) => string;
  currentUserId?: string;
  isAdmin: boolean;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyContent: string;
  setReplyContent: (s: string) => void;
  onReply: (parentId: string) => void;
  isReplying: boolean;
  getVoteCount: (commentId: string) => number;
  getUserVote: (commentId: string) => number;
  onVote: (commentId: string, voteType: number) => void;
  onDelete: (commentId: string) => void;
}

function CommentThread({
  comment, replies, getAuthorName, timeAgo, currentUserId, isAdmin,
  replyingTo, setReplyingTo, replyContent, setReplyContent, onReply, isReplying,
  getVoteCount, getUserVote, onVote, onDelete,
}: CommentThreadProps) {
  const voteCount = getVoteCount(comment.id);
  const userVote = getUserVote(comment.id);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex flex-col items-center gap-0.5 pt-1">
          <button onClick={() => onVote(comment.id, 1)} className={`${userVote === 1 ? "text-accent" : "text-muted-foreground"} hover:text-accent`}>
            <ArrowBigUp className="h-4 w-4" />
          </button>
          <span className="text-[10px] font-semibold text-muted-foreground">{voteCount}</span>
          <button onClick={() => onVote(comment.id, -1)} className={`${userVote === -1 ? "text-destructive" : "text-muted-foreground"} hover:text-destructive`}>
            <ArrowBigDown className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1">
          <p className="text-sm">{comment.content}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>{getAuthorName(comment.author_id)}</span>
            <span>{timeAgo(comment.created_at)}</span>
            <button className="hover:text-accent transition-colors" onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}>
              Reply
            </button>
            {(currentUserId === comment.author_id || isAdmin) && (
              <button className="hover:text-destructive transition-colors" onClick={() => onDelete(comment.id)}>
                Delete
              </button>
            )}
          </div>
          {replyingTo === comment.id && (
            <div className="flex gap-2 mt-2">
              <Textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="Write a reply…" rows={2} className="text-sm" />
              <Button size="icon" onClick={() => onReply(comment.id)} disabled={!replyContent.trim() || isReplying}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Nested replies */}
      {replies.length > 0 && (
        <div className="ml-8 pl-3 border-l-2 border-muted space-y-2">
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2">
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <button onClick={() => onVote(r.id, 1)} className={`${getUserVote(r.id) === 1 ? "text-accent" : "text-muted-foreground"} hover:text-accent`}>
                  <ArrowBigUp className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-semibold text-muted-foreground">{getVoteCount(r.id)}</span>
                <button onClick={() => onVote(r.id, -1)} className={`${getUserVote(r.id) === -1 ? "text-destructive" : "text-muted-foreground"} hover:text-destructive`}>
                  <ArrowBigDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <p className="text-sm">{r.content}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span>{getAuthorName(r.author_id)}</span>
                  <span>{timeAgo(r.created_at)}</span>
                  {(currentUserId === r.author_id || isAdmin) && (
                    <button className="hover:text-destructive transition-colors" onClick={() => onDelete(r.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
