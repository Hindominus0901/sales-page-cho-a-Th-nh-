/**
 * O nhap video cho nhung cot luu NGUYEN DUONG DAN (challenges.hero_video_url,
 * challenge_day_tasks.video_url) - khac bang lessons von luu "nha cung cap + ma".
 *
 * VI SAO CAN:
 *
 * 1. MA TRAN BI DOAN NHAM. nhanDangVideo() coi moi chuoi khong co dau cham la
 *    ma Wistia, vi Wistia la nha cung cap mac dinh cua san pham nay. Nhung mot
 *    ma YouTube tran (dQw4w9WgXcQ) cung khong co dau cham - dan vao day la nhan
 *    mot embed Wistia tro toi mot video khong ton tai: khung den, khong loi.
 *    Khong the doan dung tu chuoi do duoc, nen o day KHONG doan im lang nua ma
 *    NOI RA minh dang hieu the nao. Doan sai thi nguoi nhap sua duoc.
 *
 * 2. KHONG CO GI KIEM. Truoc day dan gi vao cung luu, va sai chi lo ra khi mot
 *    hoc vien mo bai ra xem.
 *
 * 3. Link chia se .../s/... cua Wistia khong nhung duoc (ma da lam roi, khong
 *    suy nguoc ra ma video). Truoc day chuyen nay chi duoc noi bang mot doan chu
 *    co dinh ben duoi o nhap, doc luc chua dan thi chua thay lien quan gi.
 */
import React from 'react';
import { nhanDangVideo, videoEmbedUrl } from '@/lib/video';
import { CellInput } from '@/pages/admin/_shared';

const TEN = { wistia: 'Wistia', youtube: 'YouTube', vimeo: 'Vimeo', stream: 'Cloudflare Stream' };

export default function ONhapVideo({ value, onChange, placeholder, xemThu = true }) {
  const raw = String(value || '').trim();
  const ra = nhanDangVideo(raw);
  const coLoi = raw && !ra.ok;

  // Ma tran = nguoi nhap khong noi ro nha cung cap, nen ta dang DOAN. Co link
  // thi ten mien quyet dinh, khong phai doan.
  const dangDoan = ra.ok && /^[A-Za-z0-9_-]{6,}$/.test(raw) && !raw.includes('.');
  const embed = ra.ok && xemThu
    ? videoEmbedUrl({ video_provider: ra.provider, video_id: ra.id })
    : null;

  return (
    <div className="space-y-1">
      <CellInput
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder || 'Dán link video (YouTube, Wistia...) hoặc mã video'}
        className={coLoi ? 'border-destructive' : undefined}
      />
      {coLoi && <p className="text-[11.5px] leading-snug text-destructive">{ra.loi}</p>}
      {dangDoan && (
        <p className="text-[11.5px] leading-snug text-amber-600 dark:text-amber-500">
          Đang hiểu đây là mã <b>{TEN[ra.provider] || ra.provider}</b>. Nếu là nơi khác,
          dán nguyên link vào thay vì mã.
        </p>
      )}
      {embed && (
        <iframe
          key={embed}
          src={embed}
          title="Xem thử video"
          className="aspect-video w-full max-w-xs rounded-lg border border-border bg-black"
          allow="fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}
