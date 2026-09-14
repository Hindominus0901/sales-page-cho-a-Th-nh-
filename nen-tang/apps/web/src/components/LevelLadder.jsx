import React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/gamification";

/**
 * Thang cap bac. Moc XP va quyen loi doc tu bang Level (admin sua trong trang
 * Co che) - khong duoc viet cung so vao day.
 */
export default function LevelLadder({ levels = [], currentLevelNumber }) {
  const sorted = [...levels].sort((a, b) => a.level_number - b.level_number);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {sorted.map((lv) => {
        const active = lv.level_number === currentLevelNumber;
        const reached = lv.level_number <= (currentLevelNumber || 1);
        return (
          <div
            key={lv.id || lv.level_number}
            className={cn(
              "text-center rounded-2xl border p-4",
              active ? "border-primary/40 bg-secondary/60" : "border-border bg-card",
            )}
          >
            <div className={cn("text-3xl mb-2", !reached && "grayscale opacity-40")}>{lv.icon || "⭐"}</div>
            <div className="font-bold text-sm">{lv.name}</div>
            <div className={cn("text-[11px] mt-0.5", reached ? "text-foreground/70" : "text-muted-foreground")}>
              {formatNumber(lv.threshold_xp)}+ XP
            </div>
            {lv.perk && (
              <div className={cn("text-[10.5px] mt-2 leading-relaxed", reached ? "text-foreground/70" : "text-muted-foreground")}>
                {lv.perk}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
