/**
 * Dai bao "phan nay chua mo" cho nguoi chua dang ky chuong trinh.
 *
 * VI SAO CAN: nut "Dang nhap" tren trang ban hang mo cua cho bat ky ai co
 * Gmail. May chu da chan ba cua - vao thu thach, hoc bai, doi qua - nhung neu
 * giao dien khong noi gi thi nguoi ta bam vao va an mot loi 403 kho hieu, roi
 * nhan Zalo hoi. Dai nay noi truoc, va noi luon phai lam gi de mo.
 *
 * `da_dang_ky` do /api/auth/me tra ve. Chua doc duoc (undefined) thi KHONG
 * hien: mot dai bao "ban chua dang ky" nhap nhay truoc mat nguoi da tra tien
 * la thu te hon la khong co gi.
 */
import { Lock } from "lucide-react";
import BRAND from "@/brand.generated.js";
import { Button } from "@/components/ui/button";

export default function CanDangKy({ me, phan = "Phần này" }) {
  if (me?.da_dang_ky !== false) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-200/70 dark:bg-amber-900/50">
          <Lock className="h-4 w-4 text-amber-800 dark:text-amber-300" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-amber-900 dark:text-amber-200">
            {phan} chưa mở cho tài khoản của bạn
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-amber-800/90 dark:text-amber-300/80">
            Bạn đăng nhập được, nhưng chưa đăng ký chương trình. Điền form đăng ký ở trang
            chính là phần này tự mở ngay — không phải chờ ai duyệt.
          </p>
          <Button asChild className="mt-3 h-9 rounded-full px-4 text-[13px] font-bold">
            <a href={`${BRAND.salesOrigin}/dang-ky`}>Đăng ký chương trình →</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
