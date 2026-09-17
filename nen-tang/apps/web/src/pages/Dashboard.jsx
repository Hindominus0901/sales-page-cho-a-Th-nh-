import React from "react";
import { streakDangSong } from "@/lib/streak";
import { Link, useOutletContext, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Zap, Award, Coins, Flame, Target } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe } from "@/lib/useMe";
import { computeLevel, formatNumber, getGreeting } from "@/lib/gamification";
import { todayKey } from "@/lib/format";
import CountUp from "@/components/CountUp";
import Avatar from "@/components/Avatar";
import PageHeader from "@/components/PageHeader";
import ChonNhom from "@/components/ChonNhom";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KPI_ACCENT = {
  xp: "327 100% 53%",
  level: "44 100% 48%",
  coin: "23 53% 55%",
  streak: "0 84% 60%",
};

const BAR_COLOR = ["hsl(var(--primary))", "hsl(var(--brand-gold))", "hsl(var(--brand-bronze))"];

function KpiCard({ icon: Icon, accent, value, label }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `hsl(${accent} / 0.12)`, color: `hsl(${accent})` }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl lg:text-[26px] font-bold font-mono tracking-tight mt-2.5">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const me = useMe();
  const navigate = useNavigate();
  const today = todayKey();
  // Layout mo hop "Ghi nhan hoat dong"; neu ban layout hien tai khong cung cap
  // thi chuyen sang trang Challenge de nguoi dung khong bam vao khoang khong.
  const { onActivityClick } = useOutletContext() || {};
  const logActivity = () => (onActivityClick ? onActivityClick() : navigate("/challenges"));

  const { data: levels = [] } = useQuery({
    queryKey: ["levels"],
    queryFn: () => base44.entities.Level.list("level_number", 50),
  });

  const { data: activityTypes = [] } = useQuery({
    queryKey: ["activity-types"],
    queryFn: () => base44.entities.ActivityType.filter({ is_active: true }, "sort_order", 50),
  });

  const { data: todayActivities = [], isLoading: loadingToday } = useQuery({
    queryKey: ["activities-today", me?.id, today],
    queryFn: () => base44.entities.Activity.filter({ user_id: me.id, date: today }, "-created_date", 200),
    enabled: !!me?.id,
  });

  const { data: board, isLoading: loadingBoard } = useQuery({
    queryKey: ["leaderboard", "today", "xp", 5],
    queryFn: () => base44.functions.invoke("getLeaderboard", { period: "today", metric: "xp", limit: 5 }),
  });

  const { data: challenges = [] } = useQuery({
    queryKey: ["challenges", "active"],
    queryFn: () => base44.entities.Challenge.filter({ is_active: true }, "-created_date", 50),
  });

  const { data: myMemberships = [] } = useQuery({
    queryKey: ["challenge-members", me?.id],
    queryFn: () => base44.entities.ChallengeMember.filter({ user_id: me.id }, "-created_date", 50),
    enabled: !!me?.id,
  });

  const { data: myBadges = [], isLoading: loadingBadges } = useQuery({
    queryKey: ["user-badges", me?.id],
    queryFn: () => base44.entities.UserBadge.filter({ user_id: me.id }, "-created_date", 50),
    enabled: !!me?.id,
  });

  if (!me) return <Loading />;

  const level = computeLevel(me.total_xp || 0, levels);
  const top = board?.ranking || [];

  const countOf = (key) =>
    todayActivities.filter((a) => a.activity_type_key === key && a.counted_for_cap).length;

  const progressBars = activityTypes.slice(0, 4).map((t, i) => {
    const current = countOf(t.key);
    const target = t.daily_cap || 1;
    return {
      key: t.key,
      label: t.name,
      current,
      target,
      percent: Math.min(100, Math.round((current / target) * 100)),
      color: BAR_COLOR[i % BAR_COLOR.length],
    };
  });

  // Challenge dang dien ra = thu thach ma minh da tham gia, kem tien do that.
  const joined = challenges
    .map((c) => ({ challenge: c, member: myMemberships.find((m) => m.challenge_id === c.id) }))
    .filter((x) => x.member);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title={`${getGreeting()}, ${me.full_name?.split(" ").slice(-1)[0] || ""}`}
        subtitle="Mỗi ngày một hành động nhỏ — cộng lại thành một con người khác."
      />

      {/* Tu an di khi da co nhom - xem ChonNhom.jsx */}
      <ChonNhom />

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-3.5">
        <KpiCard icon={Zap} accent={KPI_ACCENT.xp} value={<CountUp value={me.total_xp || 0} />} label="XP hiện tại" />
        <KpiCard
          icon={Award}
          accent={KPI_ACCENT.level}
          value={<span className="text-3xl">{level.icon}</span>}
          label={`Level ${level.levelNumber} · ${level.name}`}
        />
        <KpiCard icon={Coins} accent={KPI_ACCENT.coin} value={<CountUp value={me.total_coin || 0} />} label="Xu" />
        <KpiCard
          icon={Flame}
          accent={KPI_ACCENT.streak}
          value={<CountUp value={streakDangSong(me)} suffix=" ngày" />}
          label="Chuỗi ngày"
        />
      </div>

      {/* Thanh tien do level */}
      <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{level.icon}</span>
            <div>
              <div className="font-bold">Level {level.levelNumber} · {level.name}</div>
              <div className="text-xs text-muted-foreground">
                {level.xpToNext > 0
                  ? `Còn ${formatNumber(level.xpToNext)} XP để lên level tiếp theo`
                  : "Bạn đang ở cấp bậc cao nhất"}
              </div>
            </div>
          </div>
          <div className="font-mono font-bold text-sm text-primary">{level.progress}%</div>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
            style={{ width: `${level.progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="space-y-5">
          {/* Tien do hom nay */}
          <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-bold">Tiến độ hôm nay</h2>
              <Button size="sm" className="rounded-full text-xs" onClick={logActivity}>
                + Ghi nhận hoạt động
              </Button>
            </div>
            {loadingToday && <p className="text-sm text-muted-foreground">Đang tải...</p>}
            {/* Cau nay truoc day la mot ngo cut: no dung, nhung khong noi ai
                sua duoc va sua o dau. Voi hoc vien thi day khong phai viec cua
                ho; voi chi Thanh (cung doc man hinh nay) thi gio co duong di. */}
            {!loadingToday && progressBars.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Chưa có loại hoạt động nào được mở.{' '}
                {me?.role === 'admin'
                  ? <Link to="/admin/activity-types" className="font-semibold text-primary underline underline-offset-2">Mở trong trang Loại hoạt động →</Link>
                  : 'Admin sẽ mở trong ít ngày tới.'}
              </p>
            )}
            <div className="space-y-3">
              {progressBars.map((p) => (
                <div key={p.key}>
                  <div className="flex justify-between text-[13px] mb-1.5">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground font-mono">{p.current}/{p.target}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${p.percent}%`, background: p.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Challenge dang dien ra */}
          <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-3.5">
              <h2 className="font-bold">Challenge đang diễn ra</h2>
              <Link to="/challenges" className="text-xs font-semibold text-primary whitespace-nowrap">
                Xem tất cả →
              </Link>
            </div>
            {joined.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Bạn chưa tham gia Challenge nào"
                description="Chọn một Challenge để bắt đầu hành trình của bạn."
                action={<Link to="/challenges"><Button className="rounded-full">Xem Challenge</Button></Link>}
                className="border-0 p-6"
              />
            ) : (
              <div className="space-y-2.5">
                {joined.slice(0, 3).map(({ challenge, member }) => {
                  const total = challenge.duration_days || 21;
                  const done = member.progress || 0;
                  const percent = Math.min(100, Math.round((done / total) * 100));
                  return (
                    <Link
                      key={challenge.id}
                      to={`/challenges?id=${challenge.id}`}
                      className="grid grid-cols-[1fr_auto] gap-3 items-center p-3.5 rounded-xl border border-border bg-background hover:border-primary/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{challenge.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{done}/{total} ngày hoàn thành</div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5 max-w-[180px]">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                      <div className="font-mono text-xs text-brand-gold whitespace-nowrap">
                        +{formatNumber(challenge.reward_xp)} XP
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {/* Top hom nay */}
          <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
            <div className="flex items-center justify-between gap-2.5 mb-3.5">
              <h2 className="font-bold text-[15px]">Top hôm nay</h2>
              <Link to="/leaderboard" className="text-xs font-semibold text-primary whitespace-nowrap">
                Xem tất cả →
              </Link>
            </div>
            {loadingBoard ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Hôm nay chưa ai ghi điểm. Bạn có thể là người đầu tiên.</p>
            ) : (
              <div className="space-y-1.5">
                {top.map((r) => (
                  <div
                    key={r.user_id}
                    className={cn("flex items-center gap-2.5 p-2 rounded-xl", r.is_me && "bg-secondary/60")}
                  >
                    <span className="font-mono font-bold text-xs text-muted-foreground w-4">{r.position}</span>
                    <Avatar user={r} size={28} />
                    <div className="flex-1 text-[13px] font-medium truncate">{r.name}</div>
                    <div className="font-mono text-xs font-bold text-primary">{formatNumber(r.score)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Huy hieu gan day */}
          <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
            <div className="flex items-center justify-between gap-2.5 mb-3.5">
              <h2 className="font-bold text-[15px]">Huy hiệu gần đây</h2>
              <Link to="/badges" className="text-xs font-semibold text-primary whitespace-nowrap">
                Xem tất cả →
              </Link>
            </div>
            {loadingBadges ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : myBadges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có huy hiệu nào. Hành động mỗi ngày để mở khoá.</p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {myBadges.slice(0, 6).map((b) => (
                  <div
                    key={b.id}
                    title={b.badge_name}
                    className="w-[52px] h-[52px] rounded-2xl bg-secondary/70 border border-border flex items-center justify-center text-2xl"
                  >
                    {b.badge_icon || "🏅"}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
