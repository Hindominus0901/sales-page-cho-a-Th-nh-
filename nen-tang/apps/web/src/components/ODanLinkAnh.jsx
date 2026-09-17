import React from 'react';
import { Input } from '@/components/ui/input';

/**
 * O dan link anh - duong VAO THU HAI cho moi cho co anh.
 *
 * Khi brand.json dat storage.r2 = false, may chu khong co binding UPLOADS nen
 * POST /api/files tra 503 kem cau "Ban dan link anh vao o ben canh". Truoc day
 * cau do noi toi mot o KHONG TON TAI o phan lon man hinh: Profile, Onboarding,
 * Community va AdminVip chi co nut chon tep, khong co cho nao de dan link. Nguoi
 * dung lam theo huong dan roi khong tim thay thu duoc huong dan.
 *
 * O NAY HIEN CA KHI KHO ANH DANG BAT - do la co y, khong phai sot.
 *
 * Ban dau no chi hien khi R2 tat, va bat R2 len la no bien mat hoan toan. Nhung
 * rat nhieu nguoi co san anh o Drive, Facebook hay mot trang khac; bat kho anh
 * len ma cat mat duong dan link la LAY DI mot duong di dang chay tot, doi lai
 * chang duoc gi. Hai duong nay khong loai tru nhau.
 *
 * `khoAnhTat` chi doi mot dong chu goi y ben duoi, khong doi hanh vi.
 */
export default function ODanLinkAnh({
  value,
  onChange,
  nhan = 'Link ảnh',
  goiY = 'https://... (dán link ảnh từ Drive, Imgur, Facebook...)',
  khoAnhTat = true,
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
        {khoAnhTat
          ? 'Tải ảnh trực tiếp đang tạm tắt — bạn dán link ảnh vào đây giúp nhé.'
          : 'Hoặc dán link ảnh có sẵn (Drive, Facebook...) vào đây.'}
      </p>
    </div>
  );
}
