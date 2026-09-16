import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';

/**
 * Man hinh "phien da het han".
 *
 * Truoc day AppLayout va Profile lam `if (!user) return null;`. Khi cookie phien
 * het han GIUA CHUNG - nguoi dung dang o trong app, /api/auth/me bat dau tra 401
 * - `user` thanh null va React render dung chu RONG: khong thanh ben, khong chu,
 * khong nut nao. Mot man hinh trang tuyet doi, khong cach nao biet chuyen gi vua
 * xay ra hay bam vao dau.
 *
 * Tra ve mot man hinh noi that va co duong di tiep. Giu `returnTo` de dang nhap
 * xong quay lai dung cho dang xem do.
 */
export default function MatPhien() {
  const quayLai = typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : '/';

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-bold">Phiên đăng nhập đã hết hạn</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Bạn đã đăng xuất hoặc phiên làm việc quá hạn. Đăng nhập lại để tiếp tục —
        mọi thứ bạn đã làm vẫn còn nguyên.
      </p>
      <Button asChild className="rounded-full">
        <Link to={`/login?returnTo=${encodeURIComponent(quayLai)}`}>
          <LogIn className="mr-1.5 h-4 w-4" /> Đăng nhập lại
        </Link>
      </Button>
    </div>
  );
}
