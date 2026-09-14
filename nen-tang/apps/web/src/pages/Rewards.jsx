import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Lock, Check } from "lucide-react";
import { base44, affiliateApi } from "@/api/base44Client";
import { useMe, ME_KEY } from "@/lib/useMe";
import CanDangKy from "@/components/CanDangKy";
import { computeLevel, formatNumber } from "@/lib/gamification";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

// Anh la tuy chon trong bang rewards, nen phai co bieu tuong du phong theo nhom.
const CATEGORY_EMOJI = {
  "Khóa học": "🎓",
  "Cố vấn": "🧑‍💼",
  "Tài liệu": "📦",
  "Merchandise": "👕",
  "Vé sự kiện": "🎫",
  "Voucher": "🎟",
  "Template": "🧩",
};

export default function Rewards() {
  const me = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(null);

  const { data: rewards = [], isLoading } = useQuery({
    queryKey: ["rewards"],
    queryFn: () => base44.entities.Reward.filter({ is_active: true }, "sort_order", 100),
  });

  const { data: levels = [] } = useQuery({
    queryKey: ["levels"],
    queryFn: () => base44.entities.Level.list("level_number", 50),
  });

  // Qua "mo khoa bang loi moi" (ve Premium) can biet minh da moi duoc may ban.
  // 404 = chua co link gioi thieu -> coi nhu 0, khong phai loi.
  const affiliate = useQuery({
    queryKey: ["affiliate-me"],
    queryFn: () => affiliateApi.me().catch(() => null),
    enabled: !!me?.id,
    retry: false,
  });

  // Qua da doi cua chinh minh. Truoc day hoc vien doi qua xong la MAT DAU:
  // khong mot man hinh nao cho ho xem lai don, nen mot mon qua la link Notion
  // thi doc mot lan roi thoi.
  const quaCuaToi = useQuery({
    queryKey: ["qua-cua-toi"],
    queryFn: () => base44.entities.Redemption.filter({ user_id: me?.id }, "-created_date", 50),
    enabled: !!me?.id,
  });

  const redeem = useMutation({
    mutationFn: (rewardId) => base44.functions.invoke("redeemReward", { reward_id: rewardId }),
    onSuccess: (res) => {
      const d = res?.data || res;
      qc.invalidateQueries({ queryKey: ME_KEY });
      qc.invalidateQueries({ queryKey: ["rewards"] });
      qc.invalidateQueries({ queryKey: ["qua-cua-toi"] });
      if (d?.da_giao && d?.delivery_url) {
        // Qua so: mo luon tab moi. Nguoi ta vua tra xu, bat ho di tim tiep la
        // vo ly - va link van con trong "Qua cua toi" de mo lai sau.
        window.open(d.delivery_url, "_blank", "noopener");
        toast({ title: "🎁 Quà đã mở", description: "Xem lại bất cứ lúc nào trong mục Quà của tôi." });
      } else {
        toast({ title: "🎉 Đã ghi nhận yêu cầu đổi quà", description: "Admin sẽ xác nhận và liên hệ với bạn." });
      }
      setConfirm(null);
    },
    onError: (err) => toast({ title: "Không đổi được quà", description: err.message, variant: "destructive" }),
  });

  if (!me) return <Loading />;

  const myLevel = computeLevel(me.total_xp || 0, levels);
  // Quà "mở khoá bằng lời mời" (vé Premium) cần biết mình đã mời được mấy bạn.
  // 404 = chưa có link giới thiệu -> coi như 0, không phải lỗi.
  const daMoi = affiliate.data?.stats?.referrals ?? 0;
  const levelName = (n) => levels.find((l) => l.level_number === n)?.name || `Cấp ${n}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Đổi quà" subtitle="Dùng Coin tích lũy để đổi phần thưởng thật.">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-gold/10 border border-brand-gold/30 self-start">
          <span className="w-4 h-4 rounded-full bg-gradient-to-b from-amber-200 to-amber-500" />
          <span className="font-mono font-extrabold text-base text-amber-700">
            {formatNumber(me.total_coin)}
          </span>
        </div>
      </PageHeader>

      <CanDangKy me={me} phan="Đổi quà" />

      {isLoading ? (
        <Loading label="Đang tải phần thưởng..." />
      ) : rewards.length === 0 ? (
        <EmptyState icon={Gift} title="Chưa có phần thưởng nào" description="Kho quà sẽ được mở sớm thôi." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((rw) => {
            const levelLocked = (rw.min_level || 1) > myLevel.levelNumber;
            const canMoi = Number(rw.min_referrals) || 0;
            const moiLocked = canMoi > daMoi;
            const notEnough = (me.total_coin || 0) < rw.coin_cost;
            const soldOut = rw.quantity <= 0;
            const disabled = levelLocked || moiLocked || notEnough || soldOut;

            return (
              <div key={rw.id} className="bg-card rounded-2xl border border-border overflow-hidden relative">
                {rw.is_hot && (
                  <div className="absolute top-3 left-3 z-10 bg-primary text-primary-foreground text-[10.5px] font-extrabold px-2.5 py-1 rounded-full">
                    HOT
                  </div>
                )}
                {canMoi > 0 ? (
                  <div className={cn(
                    "absolute top-3 right-3 z-10 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full",
                    moiLocked ? "bg-foreground/75 text-background" : "bg-emerald-600 text-white",
                  )}>
                    {moiLocked ? <Lock className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                    Mời {canMoi} bạn
                  </div>
                ) : levelLocked && (
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-foreground/75 text-background text-[10px] font-bold px-2.5 py-1 rounded-full">
                    <Lock className="w-3 h-3" /> {levelName(rw.min_level)}
                  </div>
                )}

                {/* object-CONTAIN chu khong phai cover.
                    Anh qua tang gan nhu luon la poster co chu - ten goi, gia,
                    danh sach thu duoc tang. `cover` phong anh cho lap day khung
                    4:3 roi xen phan thua, va thu bi xen dau tien thuong la chu
                    o hai mep. Hoc vien nhin thay mot tam anh cut, khong doc duoc
                    minh sap doi cai gi.
                    `contain` co the de lai vien trong o anh qua cao hay qua
                    rong - nhung mot vien trong thi khong ai hieu nham, con mot
                    dong chu bi cat doi thi co. */}
                <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden text-4xl">
                  {rw.image_url
                    ? <img src={rw.image_url} alt="" className="h-full w-full object-contain" />
                    : (CATEGORY_EMOJI[rw.category] || "🎁")}
                </div>

                <div className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-primary">{rw.category}</div>
                  <div className="font-semibold text-[14.5px] mt-1">{rw.name}</div>
                  {/* Mo ta: quan tri vien dien duoc tu lau nhung khong man hinh
                      nao hien ra, nen hoc vien doi qua ma khong biet minh doi
                      cai gi. Cat hai dong cho the qua khong cao thap khac nhau. */}
                  {rw.description ? (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                      {rw.description}
                    </p>
                  ) : null}
                  <div className="mb-2.5" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-extrabold text-[15px] text-amber-700">
                      {formatNumber(rw.coin_cost)} coin
                    </span>
                    <Button
                      size="sm"
                      className="rounded-full px-5"
                      disabled={disabled}
                      onClick={() => setConfirm(rw)}
                    >
                      Đổi
                    </Button>
                  </div>
                  {disabled && (
                    <p className="text-[11px] mt-2 text-muted-foreground">
                      {soldOut
                        ? "Phần thưởng đã hết."
                        : moiLocked
                          ? `Mời thêm ${canMoi - daMoi} người bạn nữa là mở khoá — không cần coin.`
                          : levelLocked
                            ? `Cần đạt ${levelName(rw.min_level)} mới đổi được.`
                            : `Bạn còn thiếu ${formatNumber(rw.coin_cost - (me.total_coin || 0))} coin.`}
                    </p>
                  )}
                  {!disabled && canMoi > 0 && (
                    <p className="text-[11px] mt-2 font-semibold text-emerald-600">
                      Bạn đã mời đủ {canMoi} bạn — phần thưởng này là của bạn.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------- Qua cua toi */}
      {(quaCuaToi.data || []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-[15px] font-bold">Quà của tôi</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Quà là tài liệu số sẽ mở được ngay. Quà cần gửi tay thì đợi quản trị viên xác nhận.
          </p>
          <div className="mt-3 space-y-2">
            {(quaCuaToi.data || []).map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{d.reward_name}</div>
                  <div className="text-xs text-muted-foreground">
                    -{Number(d.coin_spent).toLocaleString("vi-VN")} xu
                    {d.status === "delivered" ? " · đã nhận"
                      : d.status === "cancelled" ? " · đã huỷ, xu đã hoàn lại"
                      : " · đang chờ xác nhận"}
                  </div>
                </div>
                {d.delivery_url ? (
                  <Button asChild size="sm" className="rounded-full">
                    <a href={d.delivery_url} target="_blank" rel="noopener noreferrer">Mở quà</a>
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">
                    {d.status === "cancelled" ? "Đã huỷ" : "Chờ xác nhận"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đổi "{confirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sẽ bị trừ {formatNumber(confirm?.coin_cost)} coin.{" "}
              {/* Qua co san link thi mo ngay, khong qua hang doi. Hua "admin se
                  xac nhan" cho ca hai loai la noi sai voi mot nua so nguoi. */}
              {confirm?.delivery_url
                ? "Quà mở được ngay sau khi đổi."
                : "Sau khi đổi, admin sẽ xác nhận và trao quà."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={redeem.isPending}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); redeem.mutate(confirm.id); }}
              disabled={redeem.isPending}
            >
              {redeem.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xác nhận đổi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
