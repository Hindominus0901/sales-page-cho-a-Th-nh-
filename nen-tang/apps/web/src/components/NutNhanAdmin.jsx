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
    return (
      <Button className={`rounded-full ${full ? 'w-full' : ''}`} variant="secondary" disabled>
        Liên hệ admin để mở khoá
      </Button>
    );
  }

  return (
    <a href={BRAND.supportUrl} target="_blank" rel="noopener noreferrer" className={className}>
      <Button className={lop}>Nhắn Admin qua {kenh} để mở khoá</Button>
    </a>
  );
}
