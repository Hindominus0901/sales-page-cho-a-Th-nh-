/** Bảng chữ không nhập nhằng khi đọc/gõ tay: bỏ B I O S U 0 1 2 5 8. */
const UNAMBIGUOUS = 'ACDEFGHJKLMNPQRTVWXY34679';

export const uuid = (): string => crypto.randomUUID();

/** Chuỗi ngẫu nhiên từ bảng chữ không nhập nhằng, dùng cho mã đơn/mã lead. */
export function shortCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += UNAMBIGUOUS[b % UNAMBIGUOUS.length];
  return out;
}

/** Token bí mật dạng base64url (id phiên, csrf secret). */
export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Mã truy cập cổng học viên. Hex 32 ký tự (128 bit) chứ không phải base64url:
 * mã này nằm trong đường link gửi qua Zalo, và Zalo/Messenger hay cắt link ở
 * ký tự lạ. Chỉ [0-9a-f] thì không có gì để cắt.
 */
export function accessToken(): string {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}
