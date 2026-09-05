/**
 * Chuẩn hoá số điện thoại Việt Nam. Chuyển thể từ server/lib/validate.js của
 * hệ cũ, thêm dạng chuẩn 84xxxxxxxxx để làm khoá tra cứu và chống trùng.
 */

const PHONE_VN = /^0[35789]\d{8}$/;

/** Về dạng người dùng quen nhìn: 0912345678. */
export function normalizePhone(raw: unknown): string {
  let p = String(raw ?? '').replace(/[^\d+]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  else if (p.startsWith('84') && p.length >= 10) p = '0' + p.slice(2);
  return p;
}

export const isValidVnPhone = (phone: string): boolean => PHONE_VN.test(phone);

/**
 * Dạng chuẩn để lưu DB và so khớp: 84912345678.
 * Dùng cho mọi UNIQUE/index liên quan tới số điện thoại, để 0912…, +84912…
 * và 84912… không tạo ra ba người khác nhau.
 */
export function toPhoneNorm(raw: unknown): string {
  const p = normalizePhone(raw);
  return isValidVnPhone(p) ? '84' + p.slice(1) : '';
}

/** 4 số cuối — dùng cho nhánh ghép giao dịch dự phòng khi nội dung CK hỏng. */
export const phoneLast4 = (phoneNorm: string): string => phoneNorm.slice(-4);
