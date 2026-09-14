import React, { useState } from "react";
import { Heart, MessageCircle, Loader2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import Linkify from "@/components/Linkify";
import { computeLevel } from "@/lib/gamification";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Mot bai viet trong feed cong dong.
 *
 * Cap bac cua tac gia phai tra cuu qua `userById`: bang posts chi luu ten,
 * khong luu XP - va thanh vien thuong khong doc duoc email/dien thoai nguoi
 * khac nen chi map duoc nhung cot cong khai.
 */
export default function PostCard({
  post,
  userById = {},
  levels = [],
  liked = false,
  likeCount = 0,
  onLike,
  expanded = false,
  onToggleComments,
  comments,
  commentsLoading = false,
  onComment,
  commenting = false,
}) {
  const [draft, setDraft] = useState("");
  const author = userById[post.user_id];
  const level = computeLevel(author?.total_xp || 0, levels);

  const send = async () => {
    const text = draft.trim();
    if (!text || commenting) return;
    await onComment(text);
    setDraft("");
  };

  return (
    <article className="bg-card rounded-2xl border border-border p-4 sm:p-5">
      <header className="flex items-center gap-3 mb-3">
        <Avatar user={author || { full_name: post.user_name }} size={40} />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">
            {post.user_name || "Thành viên"}
            {author && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {level.icon} {level.name}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-muted-foreground">{relativeTime(post.created_date)}</div>
        </div>
      </header>

      <Linkify text={post.body} className="text-sm leading-relaxed text-foreground/90 mb-3" />

      {post.image_url && (
        <img
          src={post.image_url}
          alt=""
          loading="lazy"
          className="w-full max-w-md max-h-80 object-cover rounded-xl border border-border mb-3"
        />
      )}

      <div className="flex gap-5 pt-3 border-t border-border">
        <button
          type="button"
          onClick={onLike}
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold transition-colors",
            liked ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Heart className={cn("w-4 h-4", liked && "fill-current")} /> {likeCount}
        </button>
        <button
          type="button"
          onClick={onToggleComments}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <MessageCircle className="w-4 h-4" /> {post.comment_count || 0} bình luận
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2.5">
          {commentsLoading && <p className="text-xs text-muted-foreground">Đang tải bình luận...</p>}
          {!commentsLoading && comments && comments.length === 0 && (
            <p className="text-xs text-muted-foreground">Chưa có bình luận. Hãy là người đầu tiên!</p>
          )}
          {(comments || []).map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar user={userById[c.user_id] || { full_name: c.user_name }} size={28} />
              <div className="bg-muted rounded-xl px-3 py-2 flex-1 min-w-0">
                <div className="font-semibold text-xs">{c.user_name || "Thành viên"}</div>
                <div className="text-xs text-foreground/80 mt-0.5 whitespace-pre-wrap break-words">{c.body}</div>
              </div>
            </div>
          ))}

          <div className="flex gap-2 items-center pt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
              placeholder="Viết bình luận..."
              className="rounded-full h-9 text-sm"
            />
            <Button onClick={send} disabled={commenting || !draft.trim()} size="sm" className="rounded-full shrink-0">
              {commenting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gửi"}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
