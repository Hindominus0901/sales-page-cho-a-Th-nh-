/**
 * Toàn hệ dùng unix giây UTC. Chỉ quy đổi sang giờ Việt Nam khi cần một
 * "ngày" theo nghĩa vận hành (gom thống kê theo ngày, chống trùng click).
 */
export const ICT_OFFSET_SEC = 7 * 3600;

export const now = (): number => Math.floor(Date.now() / 1000);

/** 'YYYY-MM-DD' theo giờ Việt Nam. */
export function ictDate(unixSec: number = now()): string {
  return new Date((unixSec + ICT_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

/** Hiển thị 'HH:mm DD/MM/YYYY' giờ Việt Nam. */
export function ictDateTime(unixSec: number): string {
  const d = new Date((unixSec + ICT_OFFSET_SEC) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export const hoursFromNow = (h: number): number => now() + h * 3600;
export const daysFromNow = (d: number): number => now() + d * 86400;
