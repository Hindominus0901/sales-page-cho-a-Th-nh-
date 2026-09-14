/**
 * Chong CSRF - tan cong kieu "trang web la lua trinh duyet cua ban gui yeu cau
 * co kem cookie sang he thong nay".
 *
 * He thong cu KHONG co lop nao ca, chi dua vao SameSite=Lax. Gio co ba lop:
 *
 *   1. SameSite=Lax tren cookie phien  - trinh duyet khong gui cookie kem
 *      request POST tu ten mien khac.
 *   2. Kiem tra Origin                 - neu co header Origin thi phai la ten
 *      mien cua chinh he thong.
 *   3. Cookie + header khop nhau       - trang khac khong doc duoc cookie cua
 *      ta nen khong doan duoc gia tri de dat vao header.
 *
 * Rieng webhook ngan hang duoc mien (may chu goi may chu, khong co cookie va co
 * secret rieng), va cac endpoint cong khai cua funnel cung duoc mien vi
 * funnel.js la trang tinh khong biet gi ve token nay.
 */
import { setCookie } from './http.js';
import { randomToken } from './crypto.js';
import { CSRF_COOKIE } from '../auth/session.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cap token CSRF neu chua co. Cookie nay CO Y khong HttpOnly de JS doc duoc. */
export function ensureCsrfCookie(rc) {
  if (rc.cookies[CSRF_COOKIE]) return rc.cookies[CSRF_COOKIE];
  const token = randomToken();
  setCookie(rc, CSRF_COOKIE, token, { httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
  rc.cookies[CSRF_COOKIE] = token;
  return token;
}

/** Ten mien duoc coi la "chinh minh". */
function allowedOrigin(rc, origin) {
  if (origin === rc.url.origin) return true;
  if (rc.cfg.corsOrigins.includes(origin)) return true;
  // Vite chay o cong khac khi phat trien o may.
  if (rc.cfg.environment !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    return true;
  }
  return false;
}

/**
 * @returns {string|null} ly do tu choi, hoac null neu hop le.
 */
export function checkCsrf(rc) {
  if (SAFE_METHODS.has(rc.request.method)) return null;

  const origin = rc.request.headers.get('origin');
  if (origin && !allowedOrigin(rc, origin)) return 'Yêu cầu đến từ nguồn không hợp lệ';

  // Sec-Fetch-Site do chinh trinh duyet dat, trang web khong gia mao duoc.
  const site = rc.request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return 'Yêu cầu đến từ nguồn không hợp lệ';
  }

  const cookieToken = rc.cookies[CSRF_COOKIE];
  const headerToken = rc.request.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return 'Thiếu mã bảo vệ biểu mẫu. Tải lại trang rồi thử lại.';
  }

  return null;
}
