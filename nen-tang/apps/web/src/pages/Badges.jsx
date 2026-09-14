import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Check, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe } from "@/lib/useMe";
import { computeLevel } from "@/lib/gamification";
import LevelLadder from "@/components/LevelLadder";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export default function Badges() {
  const me = useMe();

  const { data: levels = [], isLoading: loadingLevels } = useQuery({
    queryKey: ["levels"],
    queryFn: () => base44.entities.Level.list("level_number", 50),
  });

  const { data: badges = [], isLoading: loadingBadges } = useQuery({
    queryKey: ["badges"],
    queryFn: () => base44.entities.Badge.filter({ is_active: true }, "sort_order", 100),
  });

  const { data: myBadges = [] } = useQuery({
    queryKey: ["user-badges", me?.id],
    queryFn: () => base44.entities.UserBadge.filter({ user_id: me.id }, "-created_date", 100),
    enabled: !!me?.id,
  });

  if (!me) return <Loading />;

  const level = computeLevel(me.total_xp || 0, levels);
  const earnedIds = new Set(myBadges.map((b) => b.badge_id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Huy hiệu & Rank"
        subtitle="Càng lên rank cao, càng mở khoá nhiều đặc quyền và phần thưởng."
      />

      {loadingLevels ? (
        <Loading label="Đang tải cấp bậc..." />
      ) : levels.length === 0 ? (
        <EmptyState icon={Award} title="Chưa có cấp bậc nào" description="Admin chưa thiết lập thang cấp bậc." />
      ) : (
        <LevelLadder levels={levels} currentLevelNumber={level.levelNumber} />
      )}

      <div>
        <h3 className="font-bold text-[15px] mb-3.5">Bộ sưu tập huy hiệu</h3>
        {loadingBadges ? (
          <Loading label="Đang tải huy hiệu..." />
        ) : badges.length === 0 ? (
          <EmptyState icon={Award} title="Chưa có huy hiệu nào" description="Huy hiệu sẽ xuất hiện khi được mở." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {badges.map((b) => {
              const earned = earnedIds.has(b.id);
              return (
                <div
                  key={b.id}
                  className={cn(
                    "text-center rounded-2xl border p-5",
                    earned ? "bg-card border-primary/20" : "bg-muted/40 border-border opacity-70",
                  )}
                >
                  <div className={cn(
                    "w-14 h-14 rounded-2xl mx-auto mb-2.5 flex items-center justify-center text-2xl",
                    earned ? "bg-secondary/70" : "bg-muted",
                  )}>
                    {b.icon || "🏅"}
                  </div>
                  <div className="font-semibold text-[13px]">{b.name}</div>
                  {b.description && (
                    <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{b.description}</div>
                  )}
                  <div className={cn(
                    "text-[10.5px] font-bold mt-2 flex items-center justify-center gap-1",
                    earned ? "text-emerald-600" : "text-muted-foreground",
                  )}>
                    {earned
                      ? <><Check className="w-3 h-3" /> Đã đạt được</>
                      : <><Lock className="w-3 h-3" /> Chưa đạt</>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
