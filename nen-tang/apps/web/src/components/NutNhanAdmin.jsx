import React from 'react';
import BRAND from '@/brand.generated.js';
import { Button } from '@/components/ui/button';

/**
 * Nut "Nhan Admin qua {kenh} de mo khoa".
 *
 * Vi sao la mot thanh phan rieng chu khong phai ba the <a> giong nhau:
 * BRAND.supportUrl CO THE RONG. Khi thuong hieu chua dien so lien he, apply.mjs
 * co y phat ra chuoi rong thay vi mot link chet (xem chu thich o do). Ma
 * `<a href="">` khong phai la mot nut chet lang le - no TAI LAI CHINH TRANG
 * DANG XEM. Nguoi dung bam "Nhan Admin de mo khoa", trang nhay mot cai roi ve
 * y nguyen cho cu: khong co gi mo ra, cung khong co gi bao la da hong.
 *
 * Nen: co link thi boc the <a>, khong co thi van hien nut nhung TAT di va doi
 * chu - noi that rang chua co duong lien he, thay vi vo mot cu bam.
 */
export default function NutNhanAdmin({ className = '', full = false }) {
  const lop = `rounded-full ${full ? 'w-full' : ''} bg-foreground text-background hover:bg-foreground/90`;
  const kenh = BRAND.channelLabel || 'Zalo';

  if (!BRAND.supportUrl) {
    // Mot nut xam ghi "Lien he admin de mo khoa" la te nhat trong moi kha nang:
    // no VUA khong bam duoc, VUA khong noi vi sao, lai vua bao nguoi ta di lam
    // dung cai viec ma no khong cho lam. Noi thang ra la chua co kenh lien he.
    return (
      <div className={`${full ? 'w-full' : ''} space-y-1`}>
        <Button className={`rounded-full ${full ? 'w-full' : ''}`} variant="secondary" disabled>
          Chưa có kênh liên hệ
        </Button>
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Phần này cần admin mở khoá, nhưng {kenh} chưa được thiết lập. Nhắn trực tiếp cho
          người phụ trách lớp giúp bạn nhé.
        </p>
      </div>
    );
  }

  return (
    <a href={BRAND.supportUrl} target="_blank" rel="noopener noreferrer" className={className}>
      <Button className={lop}>Nhắn Admin qua {kenh} để mở khoá</Button>
    </a>
  );
}
