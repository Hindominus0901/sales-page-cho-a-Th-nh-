/**
 * Trang bao khong tim thay duong dan.
 *
 * BAN TRUOC LA BOILERPLATE CUA BASE44 va co ba cho hong:
 *
 * 1. Toan bo bang tieng Anh ("Page Not Found", "Go Home") trong mot san pham
 *    tieng Viet.
 * 2. Co mot khoi "Admin Note" CHI HIEN VOI role === 'admin' - tuc la chi mot
 *    nguoi duy nhat tren doi nhin thay no, chinh la chi Thanh - ghi:
 *    "This could mean that the AI hasn't implemented this page yet. Ask it to
 *    implement it in the chat." Chu app cua minh bam nham mot duong dan va duoc
 *    bao di hoi mot con AI trong mot khung chat khong ton tai.
 * 3. Nut thoat hiem duy nhat tro ve '/', ma '/' o he thong nay do Worker phuc
 *    vu TRANG BAN HANG chu khong phai app (xem App.jsx). Nen nut "ve nha" thuc
 *    ra la nut thoat khoi khu vuc thanh vien - dung luc nguoi ta dang lac.
 *
 * Gio: tieng Viet, khong nhac AI, va nut dua ve /dashboard - noi that su la
 * "nha" cua mot nguoi da dang nhap.
 */
import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PageNotFound() {
  const location = useLocation();
  const duongDan = location.pathname;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted">
          <Compass className="h-8 w-8 text-muted-foreground" />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-black">Không có trang này</h1>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            Đường dẫn <code className="rounded bg-muted px-1.5 py-0.5 text-[12.5px]">{duongDan}</code>{' '}
            không tồn tại. Có thể link bị gõ nhầm, hoặc mục này đã được đổi tên.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Button asChild className="h-11 rounded-full px-6 font-bold">
            <Link to="/dashboard">Về trang chính →</Link>
          </Button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-[12.5px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Quay lại trang trước
          </button>
        </div>
      </div>
    </div>
  );
}
