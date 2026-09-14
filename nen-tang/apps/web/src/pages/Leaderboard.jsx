import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMe } from "@/lib/useMe";
import { formatNumber } from "@/lib/gamification";
import Avatar from "@/components/Avatar";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: "today", label: "Hôm nay" },
  { key: "week", label: "Tuần này" },
  { key: "month", label: "Tháng này" },
  { key: "all_time", label: "Toàn thời gian" },
];

// Gop luon "Bang vang" cu vao day: no chi la bo loc metric.
//
// Da bo hai muc "Content" va "Cuoc goi" theo yeu cau cua chi Thanh: cuoc thi
// dua chi cham ba tieu chi (chuyen can, bai tap, dang bai Facebook), nhung thu
// ngoai do khong duoc lam nhieu bang xep hang. Cot du lieu va luat diem VAN
// GIU nguyen o backend - chi an khoi giao dien thi dua.
const METRICS = [
  { key: "thi_dua", label: "Thi đua", unit: "điểm" },
  { key: "xp", label: "XP", unit: "XP" },
  { key: "coin", label: "Xu", unit: "xu" },
  { key: "streak", label: "Chuỗi", unit: "ngày" },
];

const PHAM_VI = [
  { key: "ca_nhan", label: "Cá nhân" },
  { key: "nhom", label: "Nhóm" },
];

const PODIUM_RING = ["hsl(var(--brand-silver))", "hsl(var(--brand-gold))", "hsl(var(--brand-bronze))"];
const PODIUM_CROWN = ["🥈", "👑", "🥉"];

function Tab({ active, onClick, children, dark }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap border transition-colors",
        active
          ? dark
            ? "bg-foreground text-background border-transparent"
            : "bg-primary text-primary-foreground border-transparent"
          : "bg-card text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function Leaderboard() {
  const me = useMe();
  const [period, setPeriod] = useState("all_time");
  const [metric, setMetric] = useState("thi_dua");
  const [phamVi, setPhamVi] = useState("ca_nhan");

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", period, metric, phamVi, 100],
    queryFn: () => base44.functions.invoke("getLeaderboard", {
      period, metric, scope: phamVi, limit: 100,
    }),
  });

  const ranking = data?.ranking || [];
  const unit = METRICS.find((m) => m.key === metric)?.unit || "";
  const top3 = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  // 2 - 1 - 3: bac cao nhat dung giua, hai ben thap hon.
  const podium = [top3[1], top3[0], top3[2]];

  return (
    <div className="space-y-5">
      <PageHeader title="Bảng xếp hạng" subtitle="Nơi hành động được nhìn thấy và kết quả được vinh danh." />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PHAM_VI.map((v) => (
          <Tab key={v.key} active={phamVi === v.key} onClick={() => setPhamVi(v.key)}>{v.label}</Tab>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <Tab key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</Tab>
        ))}
      </div>

      {/* Bo loc chi so chi co nghia voi bang CA NHAN - bang nhom luon xep theo
          diem thi dua, khong co "xu cua nhom" hay "chuoi ngay cua nhom". */}
      {phamVi === "ca_nhan" && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {METRICS.map((m) => (
            <Tab key={m.key} dark active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Tab>
          ))}
        </div>
      )}

      {isLoading ? (
        <Loading label="Đang tải bảng xếp hạng..." />
      ) : phamVi === "nhom" ? (
        <BangNhom ranking={ranking} cuaToi={data?.team_cua_toi} />
      ) : ranking.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Chưa có ai trên bảng xếp hạng"
          description="Hãy là người đầu tiên ghi điểm ở mốc thời gian này."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 items-end">
            {podium.map((r, i) => {
              if (!r) return <div key={i} />;
              const isFirst = i === 1;
              return (
                <div
                  key={r.user_id}
                  className={cn(
                    "text-center rounded-2xl border p-4",
                    isFirst ? "border-brand-gold/40 bg-secondary/40 pt-6" : "border-border bg-card",
                  )}
                >
                  <div className={cn("mb-1.5", isFirst ? "text-[28px]" : "text-[22px]")}>{PODIUM_CROWN[i]}</div>
                  <div className="flex justify-center mb-2.5">
                    <Avatar user={r} size={isFirst ? 64 : 48} ring ringColor={PODIUM_RING[i]} />
                  </div>
                  <div className="font-bold text-sm truncate">{r.name}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5 mb-2 truncate">
                    {r.level_icon} {r.level_name}
                  </div>
                  <div className={cn("font-mono font-extrabold text-primary", isFirst ? "text-lg" : "text-base")}>
                    {formatNumber(r.score)} {unit}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            {rest.map((r) => (
              <div
                key={r.user_id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl border",
                  r.is_me || r.user_id === me?.id
                    ? "bg-secondary/50 border-primary/30"
                    : "bg-card border-border",
                )}
              >
                <span className="font-mono font-bold text-[13px] text-muted-foreground w-7">#{r.position}</span>
                <Avatar user={r} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13.5px] truncate">
                    {r.name} {r.is_me && <span className="text-primary text-xs">(Bạn)</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{r.level_icon} {r.level_name}</div>
                </div>
                <div className="font-mono font-bold text-[13.5px] text-primary whitespace-nowrap">
                  {formatNumber(r.score)} {unit}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/**
 * Bang thi dua giua 5 nhom.
 *
 * Xep theo DIEM TRUNG BINH moi thanh vien chu khong phai tong - nam nhom khong
 * bao gio deu nguoi, va xep theo tong thi nhom dong nguoi thang san tu dau.
 * Van hien ca tong ben canh de khong ai thac mac con so kia di dau.
 *
 * Cot ngang thay cho bieu do: cung mot cai nhin ra ai dan dau, ma khong phai
 * keo them mot thu vien ve bieu do chi de ve nam thanh ngang.
 */
function BangNhom({ ranking, cuaToi }) {
  if (!ranking.length) {
    return (
      <EmptyState
        icon={Trophy}
        title="Chưa có nhóm nào"
        description="Nhóm sẽ hiện ở đây khi có học viên tham gia."
      />
    );
  }

  const caoNhat = Math.max(1, ...ranking.map((t) => t.diem_tb));
  const HUY_CHUONG = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-3">
      {ranking.map((t, i) => {
        const laCuaToi = t.team_id === cuaToi;
        return (
          <div
            key={t.team_id}
            className={cn(
              "rounded-2xl border p-4",
              laCuaToi ? "border-primary/50 bg-primary/5" : "border-border bg-card",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 shrink-0 text-center text-lg font-extrabold">
                {HUY_CHUONG[i] || <span className="text-sm text-muted-foreground">{t.position}</span>}
              </div>
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ background: t.color || "hsl(var(--primary))" }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">
                  {t.name}
                  {laCuaToi && <span className="ml-1.5 text-xs font-semibold text-primary">(Nhóm bạn)</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.so_nguoi} người · tổng {t.tong_diem.toLocaleString("vi-VN")} điểm
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[19px] font-extrabold leading-none">{t.diem_tb.toLocaleString("vi-VN")}</div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  điểm/người
                </div>
              </div>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(3, (t.diem_tb / caoNhat) * 100)}%`,
                  background: t.color || "hsl(var(--primary))",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
