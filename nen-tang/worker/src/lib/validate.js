import { stripDiacritics } from '../questions.js';

export const COUNTRY_CODES = ['+84', '+1', '+61'];

/**
 * Bo ky tu dieu khien roi cat ngan.
 * Viet bang vong lap thay vi regex de trong ma nguon khong co ky tu vo hinh -
 * chung rat de bi mat khi copy/paste hoac khi cong cu sua file.
 */
export function clean(value, max = 200) {
  let out = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, max);
}

/** Ten: giu dau tieng Viet, chi doi hoi co it nhat mot chu cai. */
export function validateName(raw) {
  const name = clean(raw, 120).replace(/\s+/g, ' ');
  if (name.length < 2) return { error: 'Họ tên quá ngắn' };
  if (!/[\p{L}]/u.test(name)) return { error: 'Họ tên không hợp lệ' };
  return { value: name };
}

export function validateEmail(raw) {
  const email = clean(raw, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return { error: 'Email không hợp lệ' };
  return { value: email };
}

/**
 * Chuan hoa so dien thoai ve E.164.
 * VN: 0912345678 / 84912345678 / +84912345678 -> +84912345678
 */
export function validatePhone(raw, countryCode = '+84') {
  const cc = COUNTRY_CODES.includes(countryCode) ? countryCode : '+84';
  let digits = clean(raw, 30).replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    const e164 = `+${digits.slice(1).replace(/\D/g, '')}`;
    if (e164.length < 9 || e164.length > 16) return { error: 'Số điện thoại không hợp lệ' };
    return { value: { phone: digits, e164, countryCode: e164.startsWith('+84') ? '+84' : cc } };
  }

  digits = digits.replace(/\D/g, '');
  if (cc === '+84') {
    if (digits.startsWith('84')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    if (!/^(3|5|7|8|9)\d{8}$/.test(digits)) {
      return { error: 'Số điện thoại di động Việt Nam phải có 10 số, ví dụ 0912345678' };
    }
    return { value: { phone: `0${digits}`, e164: `+84${digits}`, countryCode: '+84' } };
  }

  if (digits.length < 7 || digits.length > 14) return { error: 'Số điện thoại không hợp lệ' };
  return { value: { phone: digits, e164: cc + digits, countryCode: cc } };
}

/** Noi dung chuyen khoan: bo dau, chi giu A-Z 0-9 va khoang trang. */
export const bankSafe = (value, max = 50) =>
  stripDiacritics(value).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, max);

/**
 * Duong dan mot buc anh: tep da tai len he thong nay, hoac anh https ben ngoai.
 *
 * Tra ve chuoi da cat 500 ky tu neu hop le, hoac `null` neu khong.
 *
 * VI SAO DUNG CHUNG MOT CHO
 *
 * Luat nay tung chi ton tai trong PATCH /api/auth/me (avatar_url), con hai duong
 * ghi anh khac thi nhan bat ky chuoi nao:
 *   - createPost  -> posts.image_url
 *   - logActivity -> activities.screenshot_url
 * Nen `data:` va `blob:` luu duoc vao database that. Chung khong chay ma doc
 * duoc (CSP chan o luc hien), nhung chung HONG THAM LANG: nguoi dung dan vao,
 * thay luu thanh cong, roi anh khong bao gio hien voi bat ky ai khac - ke ca
 * chinh ho sau khi tai lai trang. Mot cai loi luc dan con hon mot buc anh ma.
 *
 * Chan `javascript:` la ly do bao mat; chan `http://` la vi trinh duyet chan noi
 * dung hon hop nen anh do chac chan khong hien.
 */
export function anhUrl(raw) {
  const url = String(raw ?? '').trim();
  if (url === '') return '';
  const ok = url.startsWith('/api/files/')
    || url.startsWith('/files/')
    || /^https:\/\/[\w.-]+\//.test(url);
  return ok ? url.slice(0, 500) : null;
}
