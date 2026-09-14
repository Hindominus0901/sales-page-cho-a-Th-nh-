import React, { useEffect, useRef, useState } from "react";
import { streakDangSong } from "@/lib/streak";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Lock, ListTodo } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe } from "@/lib/useMe";
import { formatNumber } from "@/lib/gamification";
import { todayKey, ngayThuThach } from "@/lib/format";
import Heatmap from "@/components/Heatmap";
import Avatar from "@/components/Avatar";
import PageHeader from "@/components/PageHeader";
import { Loading } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export default function Journey() {
  const me = useMe();

  const { data: board } = useQuery({
    queryKey: ["leaderboard", "all_time", "xp", 200],
    queryFn: () => base44.functions.invoke("getLeaderboard", { period: "all_time", metric: "xp", limit: 200 }),
    refetchInterval: 60_000,
  });

  const { data: xpTx = [], isLoading: loadingHeat } = useQuery({
    queryKey: ["xp-transactions", me?.id],
    queryFn: () => base44.entities.XpTransaction.filter({ user_id: me.id }, "-created_date", 1000),
    enabled: !!me?.id,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["challenge-members", me?.id],
    queryFn: () => base44.entities.ChallengeMember.filter({ user_id: me.id }, "-created_date", 50),
    enabled: !!me?.id,
  });

  const activeMembership = memberships.find((m) => !m.completed) || memberships[0] || null;

  const { data: challenge } = useQuery({
    queryKey: ["challenge", activeMembership?.challenge_id],
    queryFn: () => base44.entities.Challenge.get(activeMembership.challenge_id),
    enabled: !!activeMembership?.challenge_id,
  });

  const { data: dayTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["day-tasks", activeMembership?.challenge_id],
    queryFn: () => base44.entities.ChallengeDayTask.filter({ challenge_id: activeMembership.challenge_id }, "day", 100),
    enabled: !!activeMembership?.challenge_id,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions", activeMembership?.challenge_id, me?.id],
    queryFn: () => base44.entities.ChallengeSubmission.filter(
      { challenge_id: activeMembership.challenge_id, user_id: me.id }, "-day", 100),
    enabled: !!activeMembership?.challenge_id && !!me?.id,
  });

  // So hang doi lien tuc, nen so sanh voi lan doc truoc de biet len hay xuong.
  const myPosition = board?.me?.position ?? null;
  const prevPosition = useRef(null);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (myPosition == null) return;
    if (prevPosition.current != null && prevPosition.current !== myPosition) {
      setDelta(myPosition - prevPosition.current);
    }
    prevPosition.current = myPosition;
  }, [myPosition]);

  if (!me) return <Loading />;

  // Da bo hai o "Content" va "Cuoc goi" theo yeu cau cua chi Thanh: cuoc thi
  // dua chi cham ba tieu chi (chuyen can, bai tap, dang bai Facebook), nhung
  // con so ngoai do de tren man hinh chi lam nguoi hoc hieu nham la chung co
  // tinh diem. Cot du lieu va luat diem van giu nguyen o backend.
  const totals = [
    { label: "Bài tập (tổng)", value: formatNumber(me.assignment_count) },
    { label: "Chuỗi ngày", value: `${streakDangSong(me)} ngày` },
    { label: "Xu (tổng)", value: formatNumber(me.total_coin) },
    { label: "XP (tổng)", value: formatNumber(me.total_xp) },
  ];

  const heatCounts = {};
  for (const tx of xpTx) {
    const key = todayKey(new Date(tx.created_date));
    heatCounts[key] = (heatCounts[key] || 0) + 1;
  }

  const top5 = (board?.ranking || []).slice(0, 5);

  // Cung mot cong thuc voi trang Challenge va voi may chu - hai trang bao hai
  // con so ngay khac nhau thi khong ai tin con nao.
  const currentDay = activeMembership ? ngayThuThach(challenge) : 0;
  const approvedDays = new Set(submissions.filter((s) => s.status === "approved").map((s) => s.day));

  const deltaLabel = delta < 0
    ? `▲ Tăng ${-delta} hạng`
    : delta > 0 ? `▼ Giảm ${delta} hạng` : "— Không đổi";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader title="Hành trình của tôi" subtitle="Nhìn lại sự tiến bộ của bạn qua từng tuần." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {totals.map((t) => (
          <div key={t.label} className="bg-card rounded-2xl border border-border p-4">
            <div className="font-mono font-bold text-xl lg:text-2xl">{t.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Bang xep hang truc tiep */}
      <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> LIVE
            </span>
            <h3 className="font-bold text-[15px]">Bảng xếp hạng của bạn</h3>
          </div>
          <Link to="/leaderboard" className="text-xs font-semibold text-primary whitespace-nowrap">Xem đầy đủ →</Link>
        </div>

        <div className="flex items-center justify-between gap-3 mb-4 p-3.5 rounded-xl bg-background border border-primary/25">
          <div className="font-bold text-lg">
            {myPosition ? `Hạng #${myPosition}` : "Chưa có hạng"}
            <span className="text-xs text-muted-foreground font-normal ml-1.5">/ toàn hệ thống</span>
          </div>
          <div className={cn(
            "text-xs font-bold",
            delta < 0 ? "text-emerald-600" : delta > 0 ? "text-destructive" : "text-muted-foreground",
          )}>
            {deltaLabel}
          </div>
        </div>

        {top5.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bảng xếp hạng đang chờ người đầu tiên tạo dấu ấn.</p>
        ) : (
          <div className="space-y-1.5">
            {top5.map((r) => (
              <div key={r.user_id} className={cn("flex items-center gap-2.5 p-2 rounded-xl", r.is_me && "bg-secondary/60")}>
                <span className="font-mono font-bold text-xs text-muted-foreground w-4">{r.position}</span>
                <Avatar user={r} size={28} />
                <div className="flex-1 text-[13px] font-medium truncate">{r.name}</div>
                <div className="font-mono text-xs font-bold text-primary">{formatNumber(r.score)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
        {loadingHeat ? <Loading label="Đang tải hoạt động..." /> : <Heatmap counts={heatCounts} />}

        <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <h3 className="font-bold text-[15px]">Việc cần làm</h3>
            <Link to="/challenges" className="text-xs font-semibold text-primary whitespace-nowrap">Nộp bài →</Link>
          </div>

          {loadingTasks && <p className="text-sm text-muted-foreground">Đang tải...</p>}

          {!loadingTasks && !activeMembership && (
            <div className="text-center py-6">
              <ListTodo className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Bạn chưa tham gia Challenge nào nên chưa có việc cần làm.
              </p>
            </div>
          )}

          {!loadingTasks && activeMembership && dayTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">Challenge này chưa có nhiệm vụ theo ngày.</p>
          )}

          <div className="space-y-2">
            {dayTasks.map((t) => {
              const done = approvedDays.has(t.day);
              const locked = t.day > currentDay;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-background",
                    locked && "opacity-50",
                  )}
                >
                  {done ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  ) : locked ? (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 border-primary shrink-0" />
                  )}
                  <div className={cn(
                    "text-[12.5px] font-medium truncate",
                    done && "line-through text-muted-foreground",
                    locked && "text-muted-foreground",
                  )}>
                    Ngày {t.day} · {t.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
