/** Cac ham dinh dang ngay/gio dung chung cho toan bo trang thanh vien. */
import BRAND from '@/brand.generated.js';

const DAY_MS = 86400000;

/**
 * Mot Date da doi sang GIO THUONG HIEU, doc bang cac ham getUTC*.
 *
 * VI SAO CAN: gio buoi hoc phai giong nhau tren moi may. Doc bang getHours()
 * la doc theo mui gio cua thiet bi: mot buoi 9:00 gio Viet Nam hien thanh 12:00
 * tren may dat mui gio Sydney, va nguoi do se den muon ba tieng - hoac tuong
 * minh da lo buoi hoc.
 *
 * Chi dung de HIEN THI. Moi tinh toan (khung diem danh, dem nguoc) van lam tren
 * moc thoi gian that, khong qua ham nay.
 */
export function theoGioThuongHieu(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + (Number(BRAND.tzOffsetMinutes) || 0) * 60000);
}

/** ISO -> "Vua xong" / "3 phut truoc" / "2 gio truoc" / "Hom qua" / dd/mm/yyyy */
export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  if (diff < 2 * DAY_MS) return 'Hôm qua';
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)} ngày trước`;
  return formatDate(iso);
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = theoGioThuongHieu(iso);
  return d ? d.toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : '';
}

/** ISO -> "09:00" theo gio thuong hieu. */
export function gioThuongHieu(iso) {
  const d = theoGioThuongHieu(iso);
  if (!d) return '';
  const hai = (n) => String(n).padStart(2, '0');
  return `${hai(d.getUTCHours())}:${hai(d.getUTCMinutes())}`;
}

/** Ngay dia phuong dang YYYY-MM-DD (khong dung toISOString de khong lech mui gio). */
export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** So ngay con lai toi end_date; null khi thu thach khong dat han. */
export function daysLeft(endDate) {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / DAY_MS));
}

/** So ngay da troi qua ke tu moc, tinh ca ngay dau tien (1-based). */
export function daysSince(iso) {
  if (!iso) return 1;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return 1;
  return Math.max(1, Math.floor((Date.now() - start) / DAY_MS) + 1);
}

/**
 * Chuong trinh dang o ngay thu may, tinh theo LICH CHUONG TRINH chu khong theo
 * ngay tung nguoi bam tham gia.
 *
 * PHAI GIONG HET `ngayThuThach` trong worker/src/functions/index.js. Hai ben
 * lech nhau thi giao dien mo o nhap cho mot ngay ma may chu tu choi - nguoi
 * dung go xong bam Nop va an mot loi khong hieu noi.
 *
 * Xem ghi chu ben may chu cho ly do vi sao moc la lich chuong trinh.
 */
export function ngayThuThach(thuThach) {
  if (!thuThach?.start_date) return 1;
  const lech = (Number(BRAND.tzOffsetMinutes) || 0) * 60000;
  const homNay = new Date(Date.now() + lech).toISOString().slice(0, 10);
  const cach = Math.round(
    (Date.parse(`${homNay}T00:00:00Z`) - Date.parse(`${String(thuThach.start_date).slice(0, 10)}T00:00:00Z`))
    / DAY_MS);
  const tran = Number(thuThach.duration_days) || 21;
  return Math.min(tran, Math.max(0, cach + 1));
}

/** Ngay lich theo gio thuong hieu, dang YYYY-MM-DD. Dung de so hai moc co cung
 *  mot ngay khong - KHONG dung hieu 24 gio, vi 8 gio sang hom sau van "chua du
 *  24 tieng" nhung da la mot ngay khac. */
export function ngayThuongHieu(moc) {
  const t = typeof moc === 'number' ? moc : Date.parse(moc);
  if (!Number.isFinite(t)) return '';
  return new Date(t + (Number(BRAND.tzOffsetMinutes) || 0) * 60000).toISOString().slice(0, 10);
}

/** "10/09" theo gio thuong hieu - du de phan biet buoi nao, khong dai dong. */
export function ngayGonVN(iso) {
  const s = ngayThuongHieu(iso);
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
}
