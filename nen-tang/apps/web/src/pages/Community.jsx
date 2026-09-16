import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X, MessagesSquare } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ErrorBlock } from "@/components/QueryState";
import { useKhaNang } from "@/lib/useKhaNang";
import ODanLinkAnh from "@/components/ODanLinkAnh";
import { useMe, ME_KEY } from "@/lib/useMe";
import PageHeader from "@/components/PageHeader";
import PostCard from "@/components/PostCard";
import Avatar from "@/components/Avatar";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

const FEED_KEY = ["posts", "feed"];

/**
 * Mot bai trong feed. Tach ra thanh phan rieng vi binh luan chi tai khi mo -
 * khong the goi useQuery trong vong lap cua trang cha.
 */
function FeedPost({ post, userById, levels, liked, me }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: comments, isLoading: loadingComments } = useQuery({
    queryKey: ["post-comments", post.id],
    queryFn: () => base44.entities.PostComment.filter({ post_id: post.id, is_hidden: false }, "created_date", 200),
    enabled: open,
  });

  const likeMutation = useMutation({
    mutationFn: () => base44.functions.invoke("togglePostLike", { post_id: post.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEED_KEY });
      qc.invalidateQueries({ queryKey: ["post-likes", me?.id] });
    },
    onError: (err) => toast({ title: "Không thả tim được", description: err.message, variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: (body) => base44.functions.invoke("createComment", { post_id: post.id, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-comments", post.id] });
      qc.invalidateQueries({ queryKey: FEED_KEY });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (err) => toast({ title: "Không gửi được bình luận", description: err.message, variant: "destructive" }),
  });

  return (
    <PostCard
      post={post}
      userById={userById}
      levels={levels}
      liked={liked}
      likeCount={post.like_count || 0}
      onLike={() => likeMutation.mutate()}
      expanded={open}
      onToggleComments={() => setOpen((v) => !v)}
      comments={comments}
      commentsLoading={loadingComments}
      commenting={commentMutation.isPending}
      onComment={(text) => commentMutation.mutateAsync(text).catch(() => {})}
    />
  );
}

export default function Community() {
  const { khaNang } = useKhaNang();
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  const feed = useQuery({
    queryKey: FEED_KEY,
    queryFn: () => base44.entities.Post.filter({ is_hidden: false }, "-created_date", 50),
  });
  const { data: posts = [], isLoading } = feed;

  const { data: levels = [] } = useQuery({
    queryKey: ["levels"],
    queryFn: () => base44.entities.Level.list("level_number", 50),
  });

  // Bang posts chi luu ten tac gia, nen phai tra cuu them de co avatar + cap bac.
  const { data: users = [] } = useQuery({
    queryKey: ["users", "public"],
    queryFn: () => base44.entities.User.list("-total_xp", 200),
  });

  const { data: myLikes = [] } = useQuery({
    queryKey: ["post-likes", me?.id],
    queryFn: () => base44.entities.PostLike.filter({ user_id: me.id }, "-created_date", 200),
    enabled: !!me?.id,
  });

  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  const likedIds = new Set(myLikes.map((l) => l.post_id));

  const postMutation = useMutation({
    mutationFn: () => base44.functions.invoke("createPost", { body: body.trim(), image_url: imageUrl || undefined }),
    onSuccess: () => {
      setBody("");
      setImageUrl(null);
      qc.invalidateQueries({ queryKey: FEED_KEY });
      qc.invalidateQueries({ queryKey: ME_KEY });
      toast({ title: "Đã đăng bài 🎉" });
    },
    onError: (err) => toast({ title: "Không đăng được bài", description: err.message, variant: "destructive" }),
  });

  const pickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(res.file_url);
    } catch (err) {
      toast({ title: "Không tải được ảnh", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (!me) return <Loading />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader title="Cộng đồng" subtitle="Chia sẻ tiến độ, hỏi đáp, và cổ vũ nhau mỗi ngày." />

      {/* Khung soan bai */}
      <div className="bg-card rounded-2xl border border-border p-4 sm:p-5">
        <div className="flex gap-3">
          <Avatar user={me} size={40} />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Chia sẻ điều bạn vừa làm được hôm nay..."
            className="flex-1 min-h-[64px] rounded-xl text-sm resize-y"
          />
        </div>

        {imageUrl && (
          <div className="relative mt-3 ml-[52px] w-fit">
            <img src={imageUrl} alt="" className="w-52 h-40 object-cover rounded-xl border border-border" />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center"
              aria-label="Bỏ ảnh"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex justify-between items-center mt-3 ml-0 sm:ml-[52px] gap-3">
          {khaNang.uploads ? (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Ảnh
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />
            </>
          ) : (
            <div className="flex-1">
              <ODanLinkAnh value={imageUrl} onChange={setImageUrl} nhan="Link ảnh cho bài đăng" />
            </div>
          )}
          <Button
            onClick={() => postMutation.mutate()}
            disabled={postMutation.isPending || (!body.trim() && !imageUrl)}
            className="rounded-full"
          >
            {postMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Đăng bài"}
          </Button>
        </div>
      </div>

      {/* Feed */}
      {/* Loi tai trang phai KHAC trang thai rong - xem QueryState.jsx. */}
      {feed.isError ? (
        <ErrorBlock error={feed.error} onRetry={feed.refetch} />
      ) : isLoading ? (
        <Loading label="Đang tải bài viết..." />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Cộng đồng đang chờ bài viết đầu tiên"
          description="Hãy kể về điều bạn vừa làm được hôm nay."
        />
      ) : (
        <div className="space-y-3.5">
          {posts.map((p) => (
            <FeedPost
              key={p.id}
              post={p}
              me={me}
              userById={userById}
              levels={levels}
              liked={likedIds.has(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
