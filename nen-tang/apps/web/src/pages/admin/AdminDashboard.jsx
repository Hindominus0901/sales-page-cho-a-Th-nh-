/**
 * Tong quan - man hinh dau tien admin nhin thay moi sang.
 *
 * Tat ca so lieu deu tinh tu du lieu that (entity Activity/User/Challenge).
 * Rieng doanh thu affiliate phai hoi API funnel, ma API do dung phien dang nhap
 * RIENG; neu chua dang nhap ben do thi the KPI hien "—" chu khong lam hong ca
 * trang.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Flame } from 'lucide-react';
import { base44, adminApi } from '@/api/base44Client';
import {
  BarChart, EmptyBlock, ErrorBlock, Heatmap, InitialAvatar, Kpi, LoadingBlock,
  PageHeader, Panel, StatusPill, fmtMoney, fmtNumber,
} from './_shared';

const dayKey = (value) => String(value || '').slice(0, 10);
const todayKey = () => new Date().toISOString().slice(0, 10);

/** Danh sach 98 ngay gan nhat (14 cot x 7 ngay) de ve heatmap. */
function buildHeatDays(activities) {
  const counts = new Map();
  for (const a of activities) {
    const key = dayKey(a.date || a.created_date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const days = [];
  const start = new Date();
  start.setDate(start.getDate() - 97);
  for (let i = 0; i < 98; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: counts.get(key) || 0 });
  }
  return days;
}

/** 8 tuan gan nhat, moi cot la so hoat dong trong tuan do. */
function buildWeekBars(activities) {
  const bars = [];
  const now = Date.now();
  for (let w = 7; w >= 0; w -= 1) {
    const end = now - w * 7 * 86400000;
    const begin = end - 7 * 86400000;
    const value = activities.filter((a) => {
      const t = new Date(a.date || a.created_date).getTime();
      return t > begin && t <= end;
    }).length;
    bars.push({ label: `T${8 - w}`, value });
  }
  return bars;
}

export default function AdminDashboard() {
  // Khoa cache mang theo ca THU TU va TRAN, vi hai thu do quyet dinh noi dung
  // tra ve. Truoc day trang nay va trang Hoc vien dung chung khoa
  // ['admin','users'] nhung xin hai tran khac nhau (500 va 2000) - react-query
  // coi la MOT, nen o tren dashboard con so "Tong hoc vien" doi theo viec vua
  // roi ai mo trang nao truoc. Mot con so chay lung tung ma khong bao loi.
  //
  // 2000 = tran cua entity User o worker. Van la dem O TRINH DUYET tren mot
  // danh sach co tran: lop vuot 2000 nguoi thi con so nay lai thieu, va lan do
  // se kho thay hon nhieu. Luc do phai de may chu dem.
  const users = useQuery({
    queryKey: ['admin', 'users', 'created', 2000],
    queryFn: () => base44.entities.User.list('-created_date', 2000),
  });
  const activities = useQuery({
    queryKey: ['admin', 'activities', 'all'],
    queryFn: () => base44.entities.Activity.list('-created_date', 1000),
  });
  const challenges = useQuery({
    queryKey: ['admin', 'challenges'],
    queryFn: () => base44.entities.Challenge.list('-created_date', 100),
  });
  const members = useQuery({
    queryKey: ['admin', 'challengeMembers'],
    queryFn: () => base44.entities.ChallengeMember.list('-created_date', 200),
  });
  const submissions = useQuery({
    queryKey: ['admin', 'challengeSubmissions'],
    queryFn: () => base44.entities.ChallengeSubmission.list('-created_date', 200),
  });
  const redemptions = useQuery({
    queryKey: ['admin', 'redemptions', 'pending'],
    queryFn: () => base44.entities.Redemption.filter({ status: 'pending' }, '-created_date', 200),
  });
  // Khong retry: chua dang nhap khu vuc funnel thi thu lai bao nhieu lan cung 401.
  const funnel = useQuery({
    queryKey: ['admin', 'funnelStats'],
    queryFn: () => adminApi.stats(),
    retry: false,
  });
  const commissions = useQuery({
    queryKey: ['admin', 'commissions', 'pending'],
    queryFn: () => adminApi.commissions({ status: 'pending', limit: 500 }),
    retry: false,
  });

  if (users.isLoading || activities.isLoading) return <LoadingBlock />;
  if (users.isError) return <ErrorBlock error={users.error} onRetry={users.refetch} />;
  if (activities.isError) return <ErrorBlock error={activities.error} onRetry={activities.refetch} />;

  const userList = users.data || [];
  const actList = activities.data || [];
  const today = todayKey();

  const todayActs = actList.filter((a) => dayKey(a.date || a.created_date) === today);
  const activeToday = new Set(todayActs.map((a) => a.user_id)).size;
  const aiToday = actList.filter((a) => dayKey(a.ai_scored_at) === today).length;
  const pendingActs = actList.filter((a) => a.status === 'pending').length;

  const affiliateRevenue = funnel.data?.affiliate?.commission_total_text;
  const pendingCommissions = commissions.data?.items?.length ?? null;

  const topMembers = [...userList]
    .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))
    .slice(0, 5);

  const memberList = members.data || [];
  const subList = submissions.data || [];
  const challengeCards = (challenges.data || [])
    .filter((c) => c.is_active !== false)
    .slice(0, 4)
    .map((c) => {
      const joined = memberList.filter((m) => m.challenge_id === c.id);
      const done = joined.filter((m) => m.completed).length;
      const avgDay = joined.length
        ? Math.round(joined.reduce((sum, m) => sum + (m.progress || 0), 0) / joined.length)
        : 0;
      const subs = subList.filter((s) => s.challenge_id === c.id);
      const passed = subs.filter((s) => s.status === 'approved').length;
      return {
        id: c.id,
        name: c.name,
        memberCount: joined.length,
        completionRate: joined.length ? Math.round((done / joined.length) * 100) : 0,
        avgDay,
        passRate: subs.length ? Math.round((passed / subs.length) * 100) : null,
        durationDays: c.duration_days || 0,
      };
    });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tổng quan"
        description="Toàn cảnh hoạt động của cộng đồng hôm nay và 8 tuần gần nhất."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Tổng học viên"
          value={fmtNumber(userList.length)}
          delta={`${fmtNumber(userList.filter((u) => u.status === 'active').length)} đang hoạt động`}
          tone="good"
        />
        <Kpi
          label="Hoạt động hôm nay"
          value={fmtNumber(todayActs.length)}
          delta={userList.length
            ? `${Math.round((activeToday / userList.length) * 1000) / 10}% học viên có mặt`
            : '—'}
        />
        <Kpi
          label="AI đã xử lý hôm nay"
          value={fmtNumber(aiToday)}
          delta={todayActs.length ? `${Math.round((aiToday / todayActs.length) * 100)}% bài nộp hôm nay` : '—'}
          tone="good"
        />
        <Kpi
          label="Doanh thu affiliate"
          value={affiliateRevenue || '—'}
          delta={funnel.isError ? 'Chưa đăng nhập khu vực funnel' : `${fmtNumber(funnel.data?.affiliate?.commission_count)} khoản hoa hồng`}
          tone={funnel.isError ? 'warn' : 'good'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Hoạt động 8 tuần gần nhất" className="lg:col-span-2">
          <BarChart bars={buildWeekBars(actList)} />
        </Panel>

        <Panel title="Chờ xử lý">
          <div className="space-y-2">
            <QueueRow
              to="/admin/approval"
              label="Bài tập chờ duyệt"
              value={fmtNumber(pendingActs)}
              tone={pendingActs > 0 ? 'brand' : 'muted'}
            />
            <QueueRow
              to="/admin/rewards"
              label="Đổi quà chờ giao"
              value={redemptions.isError ? '—' : fmtNumber(redemptions.data?.length)}
              tone={(redemptions.data?.length || 0) > 0 ? 'warn' : 'muted'}
            />
            <QueueRow
              to="/admin/affiliate"
              label="Hoa hồng chờ thanh toán"
              value={pendingCommissions === null ? '—' : fmtNumber(pendingCommissions)}
              tone={(pendingCommissions || 0) > 0 ? 'warn' : 'muted'}
            />
            {funnel.data?.revenue && (
              <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                Doanh thu đã thu: <strong className="text-foreground">{funnel.data.revenue.total_text}</strong>
                {' · '}Đơn trung bình {fmtMoney(funnel.data.revenue.aov)}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Heatmap hoạt động toàn hệ thống"
          description="Tổng số lượt nộp bài, gọi khách, đăng content của toàn bộ học viên theo từng ngày."
          className="lg:col-span-2"
        >
          <Heatmap days={buildHeatDays(actList)} />
        </Panel>

        <Panel title="Học viên hoạt động nhiều nhất">
          {topMembers.length === 0 ? (
            <EmptyBlock>Chưa có học viên nào.</EmptyBlock>
          ) : (
            <div className="space-y-2.5">
              {topMembers.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <InitialAvatar name={m.full_name} size={32} />
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold">{m.full_name}</div>
                  <div className="flex items-center gap-1 text-xs font-bold text-primary">
                    <Flame className="h-3.5 w-3.5" />
                    {m.current_streak || 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Tình hình học tập theo khoá">
        {challenges.isLoading || members.isLoading ? (
          <LoadingBlock />
        ) : challengeCards.length === 0 ? (
          <EmptyBlock>Chưa có challenge nào đang chạy.</EmptyBlock>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {challengeCards.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtNumber(c.memberCount)} học viên đang học
                    </div>
                  </div>
                  <div className="text-lg font-extrabold text-primary">{c.completionRate}%</div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${c.completionRate}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat value={c.avgDay} label="Ngày TB đang ở" />
                  <MiniStat value={c.passRate === null ? '—' : `${c.passRate}%`} label="Tỷ lệ bài đạt" />
                  <MiniStat value={c.durationDays || '—'} label="Tổng số ngày" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function QueueRow({ to, label, value, tone }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-secondary"
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="flex items-center gap-2">
        <StatusPill tone={tone}>{value}</StatusPill>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </Link>
  );
}

function MiniStat({ value, label }) {
  return (
    <div>
      <div className="text-base font-extrabold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
