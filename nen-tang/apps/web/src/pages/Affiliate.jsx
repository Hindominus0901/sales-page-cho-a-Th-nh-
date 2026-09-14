import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Users, Wallet } from "lucide-react";
import { affiliateApi } from "@/api/base44Client";
import { formatNumber, getInitials, avatarColors } from "@/lib/gamification";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState, { Loading } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export default function Affiliate() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["affiliate", "me"],
    queryFn: () => affiliateApi.me(),
    // 404 = chua dang ky qua funnel, khong phai su co - dung thu lai.
    retry: false,
  });

  if (isLoading) return <Loading label="Đang tải dữ liệu affiliate..." />;

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Affiliate" subtitle="Mời người tham gia, nhận hoa hồng và lên rank nhanh hơn." />
        <EmptyState
          icon={Users}
          title={error.status === 404 ? "Bạn chưa có link giới thiệu" : "Chưa tải được dữ liệu affiliate"}
          description={error.message}
        />
      </div>
    );
  }

  const shareUrl = data?.links?.share_url || data?.share?.url || "";
  const stats = data?.stats || {};
  const referrals = data?.referrals || [];
  const commissions = data?.commissions || [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast({ title: "Không sao chép được", description: "Bạn hãy chọn và sao chép thủ công nhé.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Affiliate" subtitle="Mời người tham gia, nhận hoa hồng và lên rank nhanh hơn." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="font-mono font-bold text-2xl">{formatNumber(referrals.length)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Người đã mời</div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="font-mono font-bold text-2xl">{formatNumber(stats.referrals)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Đã đăng ký thành công</div>
        </div>
        {/* HOA HONG DA GHI NHAN, khong phai da chi tra.
            O nay truoc day hien `commission_paid` - chi tinh nhung dong da
            chuyen tien. Hoa hong moi sinh ra o trang thai `pending`, nen mot
            nguoi vua ban duoc ve nhin vao day thay 0d va tuong he thong khong
            ghi nhan. Da co nguoi nhan tin hoi dung viec do. */}
        <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/10 p-5">
          <div className="font-mono font-bold text-2xl text-amber-700">
            {stats.commission_total_text || "0đ"}
          </div>
          <div className="text-xs text-amber-700 mt-0.5">Hoa hồng đã ghi nhận</div>
          {(stats.commission_total || 0) > 0 && (
            <div className="mt-1.5 text-[11px] leading-relaxed text-amber-700/85">
              Đang chờ chi trả {stats.commission_pending_text || "0đ"}
              {" · "}Đã nhận {stats.commission_paid_text || "0đ"}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-secondary/30 p-5 lg:p-6">
        <h3 className="font-bold text-[15px] mb-3">Link giới thiệu của bạn</h3>
        <div className="flex gap-2.5 flex-wrap">
          <Input readOnly value={shareUrl} className="flex-1 min-w-[220px] font-mono text-[13px] bg-card" />
          <Button onClick={copy} className="rounded-xl bg-foreground text-background hover:bg-foreground/90 shrink-0">
            {copied ? <><Check className="w-4 h-4 mr-1.5" /> Đã sao chép</> : <><Copy className="w-4 h-4 mr-1.5" /> Sao chép link</>}
          </Button>
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-3.5 leading-relaxed">
          Mỗi người bạn mời đăng ký thành công, bạn nhận thêm XP, coin, và nếu họ mua vé VIP, bạn nhận hoa hồng affiliate.
        </p>
      </div>

      {/* Tung dong hoa hong, de doi chieu duoc voi tung don. Khong co bang nay
          thi con so o tren la mot con so khong kiem chung duoc - nguoi ta chi
          biet tin hoac khong tin. */}
      {commissions.length > 0 && (
        <div>
          <h3 className="mb-3.5 flex items-center gap-2 text-[15px] font-bold">
            <Wallet className="h-4 w-4" /> Hoa hồng của bạn
          </h3>
          <div className="space-y-2">
            {commissions.map((c) => (
              <div
                key={`${c.order_code}-${c.created_at}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
              >
                <div className="min-w-0">
                  <div className="font-mono text-[13px] font-bold">{c.order_code || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(c.created_at)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="font-mono text-[14px] font-extrabold text-amber-700">
                    {c.amount_text}
                  </span>
                  <span
                    className={
                      c.status === "paid"
                        ? "whitespace-nowrap rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700"
                        : "whitespace-nowrap rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-700"
                    }
                  >
                    {c.status === "paid" ? "Đã chi trả" : "Chờ chi trả"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-bold text-[15px] mb-3.5">Danh sách người bạn đã mời</h3>
        {referrals.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có ai đăng ký qua link của bạn"
            description="Hãy chia sẻ link ở trên cho bạn bè để bắt đầu."
          />
        ) : (
          <div className="space-y-2">
            {referrals.map((r, i) => (
              <div
                key={`${r.name}-${r.created_at}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-card border border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                    style={{ backgroundColor: avatarColors(r.name) }}
                  >
                    {getInitials(r.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[13.5px] truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(r.created_at)}</div>
                  </div>
                </div>
                <span
                  className={
                    r.valid
                      ? "text-[11px] font-bold text-emerald-700 bg-emerald-500/10 px-2.5 py-1 rounded-full whitespace-nowrap"
                      : "text-[11px] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full whitespace-nowrap"
                  }
                >
                  {r.valid ? "Đã đăng ký" : "Đang chờ"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
