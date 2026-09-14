import React from "react";
import Avatar from "./Avatar";
import { cn } from "@/lib/utils";
import { computeLevel } from "@/lib/gamification";

export default function LeaderboardRow({ entry, levels, metricLabel, isCurrentUser }) {
  const lvl = computeLevel(entry.total_xp || 0, levels);
  const metricValue = metricLabel === "xp" ? `${(entry.total_xp || 0).toLocaleString('vi-VN')} XP` : `${entry.count || 0}`;
  return (
    <div className={cn("flex items-center gap-4 px-4 py-3 rounded-2xl border transition-colors", isCurrentUser ? "bg-secondary/60 border-primary/30" : "bg-card border-border")}>
      <div className={cn("w-8 text-center font-bold text-sm shrink-0", entry.rank <= 3 ? "text-primary" : "text-muted-foreground")}>
        {String(entry.rank).padStart(2, "0")}
      </div>
      <Avatar user={entry} size={40} showLevel levelNumber={lvl.levelNumber} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{entry.name}</div>
        <div className="text-xs text-muted-foreground">{lvl.icon} {lvl.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold text-sm">{metricValue}</div>
        {metricLabel === "xp" && <div className="text-[11px] text-muted-foreground">{entry.content_count || 0}b · {entry.call_count || 0}g · {entry.assignment_count || 0}t</div>}
      </div>
    </div>
  );
}