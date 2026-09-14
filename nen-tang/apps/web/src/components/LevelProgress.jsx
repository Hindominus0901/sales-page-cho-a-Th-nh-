import React from "react";
import { cn } from "@/lib/utils";

export default function LevelProgress({ level, totalXp, className }) {
  if (!level) return null;
  return (
    <div className={cn("bg-card rounded-2xl border border-border p-6", className)}>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">{level.icon}</span>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Level {level.levelNumber}</div>
          <div className="text-lg font-bold text-foreground">{level.name}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-semibold text-foreground">{(totalXp || 0).toLocaleString('vi-VN')} XP</span>
          {level.xpToNext > 0 ? (
            <span className="text-muted-foreground">còn {level.xpToNext.toLocaleString('vi-VN')} XP</span>
          ) : (
            <span className="text-primary font-medium">Max Level</span>
          )}
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${level.progress}%` }} />
        </div>
      </div>
    </div>
  );
}