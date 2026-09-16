import React from 'react';
import { Input } from '@/components/ui/input';

/**
 * O dan link anh - duong thay the khi KHO ANH DANG TAT.
 *
 * Khi brand.json dat storage.r2 = false, may chu khong co binding UPLOADS nen
 * POST /api/files tra 503 kem cau "Ban dan link anh vao o ben canh". Truoc day
 * cau do noi toi mot o KHONG TON TAI o phan lon man hinh: Profile, Onboarding,
 * Community va AdminVip chi co nut chon tep, khong co cho nao de dan link. Nguoi
 * dung lam theo huong dan roi khong tim thay thu duoc huong dan.
 *
 * Component nay la o do. No chi hien khi kho anh tat (xem useKhaNang), nen khi
 * nap khoa R2 thi nut tai len tu quay lai va o nay tu bien mat.
 */
export default function ODanLinkAnh({
  value,
  onChange,
  nhan = 'Link ảnh',
  goiY = 'https://... (dán link ảnh từ Drive, Imgur, Facebook...)',
}) {
  return (
    <div className="w-full space-y-1.5">
      <Input
        type="url"
        inputMode="url"
        value={value || ''}
        placeholder={goiY}
        onChange={(e) => onChange(e.target.value.trim())}
        className="h-10 text-[13px]"
        aria-label={nhan}
      />
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Tải ảnh trực tiếp đang tạm tắt — bạn dán link ảnh vào đây giúp nhé.
      </p>
    </div>
  );
}
