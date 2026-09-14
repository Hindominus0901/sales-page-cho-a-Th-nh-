import React from "react";
import Avatar from "./Avatar";
import { Crown, Medal, Trophy } from "lucide-react";
import { computeLevel } from "@/lib/gamification";

const PODIUM = [
  { rank: 2, ring: "hsl(var(--brand-silver))", label: "TOP 2", medal: "hsl(var(--brand-silver))", offset: "mt-8" },
  { rank: 1, ring: "hsl(var(--brand-gold))", label: "TOP 1", medal: "hsl(var(--brand-gold))", offset: "mt-0" },
  { rank: 3, ring: "hsl(var(--brand-bronze))", label: "TOP 3", medal: "hsl(var(--brand-bronze))", offset: "mt-10" },
];

export default function TopThreePodium({ ranking, levels, metricLabel }) {
  if (!ranking || ranking.length === 0) {
    return (
      <div className="bg-card rounded-3xl border border-border p-12 text-center">
        <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Bảng xếp hạng đang chờ người đầu tiên tạo dấu ấn.</p>
      </div>
    );
  }
  const top3 = [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  const positions = [PODIUM[0], PODIUM[1], PODIUM[2]];

  return (
    <div className="bg-gradient-to-b from-accent/40 to-card rounded-3xl border border-border p-6 lg:p-10">
      <div className="flex items-end justify-center gap-3 lg:gap-8">
        {top3.map((r, i) => {
          const pos = positions[i];
          if (!r) return <div key={i} className="flex-1 max-w-[200px]" />;
          const lvl = computeLevel(r.total_xp || 0, levels);
          const isTop1 = r.rank === 1;
          return (
            <div key={r.user_id} className={`flex-1 max-w-[220px] flex flex-col items-center ${pos.offset}`}>
              <div className="relative">
                {isTop1 && <Crown className="w-7 h-7 absolute -top-7 left-1/2 -translate-x-1/2 text-amber-400 fill-amber-400" />}
                <Avatar user={r} size={isTop1 ? 96 : 72} ring ringColor={pos.ring} showLevel levelNumber={lvl.levelNumber} />
              </div>
              <div className="mt-3 text-center">
                <div className="font-bold text-sm lg:text-base truncate max-w-[180px]">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{lvl.icon} {lvl.name}</div>
                <div className="text-sm font-semibold mt-1.5 text-primary">
                  {metricLabel === "xp" ? `${(r.total_xp || 0).toLocaleString('vi-VN')} XP` : `${r.count || 0} ${metricLabel}`}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {r.content_count || 0} bài · {r.call_count || 0} gọi · {r.assignment_count || 0} tập
                </div>
              </div>
              <div className="mt-3 px-4 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-1" style={{ backgroundColor: pos.medal }}>
                <Medal className="w-3 h-3" /> {pos.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}