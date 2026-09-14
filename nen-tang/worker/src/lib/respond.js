/** Tra loi HTTP + header bao mat dung chung cho ca API lan trang tinh. */

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // Bat trinh duyet nho "trang nay chi di bang HTTPS" trong mot nam. Khong co
  // no thi lan dau go dia chi vao thanh trinh duyet van la mot chang HTTP, va
  // ai dung chung wifi co the chen vao giua - dung luc khach dang go so tien.
  //
  // CO Y khong dat includeSubDomains: no ap luon cho MOI ten mien con cua
  // cung ten mien goc, ke ca nhung cai khong thuoc du an nay. Ep mot ten mien
  // khong san sang sang HTTPS la lam no chet han trong mot nam, va khong go
  // lai duoc tu phia may chu.
  'Strict-Transport-Security': 'max-age=31536000',
};

/** Trang khong duoc de lot vao Google va khong duoc cache. */
export const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * Chinh sach noi dung (CSP). Hai ban khac nhau vi hai phan chay khac nhau:
 *
 *   APP  - ban dung cua Vite, khong co script inline nao -> siet duoc
 *          script-src 'self'. Day cung la noi co noi dung do NGUOI DUNG nhap
 *          (bai dang, binh luan) nen la cho dang siet nhat.
 *   FUNNEL - trang thiet ke .dc.html co script inline, va dc-runtime dung
 *          new Function() de dung component -> buoc phai mo 'unsafe-inline'
 *          va 'unsafe-eval'. Siet duoc bao nhieu thi siet.
 *
 * img-src de "https:" vi anh dai dien va anh trong bai do nguoi dung dan link
 * tu bat ky dau - khong the liet ke truoc duoc. Doi lai, object-src 'none' va
 * base-uri 'self' chan hai duong tan cong khong can den script.
 */
// Facebook Pixel: fbevents.js tai tu connect.facebook.net, roi ban du lieu ve
// facebook.com. Khong khai o day thi CSP chan im lang - pixel gan vao ma
// khong bao gio chay, va khong ai biet cho den khi xem bao cao quang cao.
const FB = 'https://connect.facebook.net';
const FB_GUI = 'https://www.facebook.com';

const VIDEO_FRAMES = 'https://fast.wistia.net https://fast.wistia.com '
  + 'https://www.youtube.com https://www.youtube-nocookie.com '
  + 'https://player.vimeo.com https://iframe.videodelivery.net';

const CSP_COMMON = [
  `img-src 'self' https: data: blob:`,
  `media-src 'self' https: blob:`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  // Facebook Pixel bao su kien ve bang HAI duong ma khong ai ngo: no POST mot
  // form an sang facebook.com/tr/ va dung mot <iframe> facebook.com lam duong
  // lui. Thieu hai dong nay thi pixel VAN TAI DUOC va van "cai dat thanh cong"
  // trong trinh quan ly quang cao - nhung khong mot su kien nao di den noi.
  // Loi im lang dung nghia: chi thay khi mo bang dieu khien trinh duyet.
  `frame-src ${VIDEO_FRAMES} ${FB_GUI}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self' ${FB_GUI}`,
  `frame-ancestors 'self'`,
];

export const CSP_APP = [
  `default-src 'self'`,
  `script-src 'self' ${FB}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `connect-src 'self' ${FB} ${FB_GUI}`,
  ...CSP_COMMON,
].join('; ');

export const CSP_FUNNEL = [
  `default-src 'self'`,
  // Ban thiet ke co <script> inline va dc-runtime goi new Function().
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${FB}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `connect-src 'self' ${FB} ${FB_GUI}`,
  ...CSP_COMMON,
].join('; ');

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

/**
 * Loi tra ve cho client. Tu 500 tro len khong bao gio lo chi tiet ky thuat -
 * nguoi dung Viet Nam doc thong bao nay, khong phai lap trinh vien.
 */
export function fail(status, message, extra = {}) {
  return json({ error: message, ...extra }, status);
}

/**
 * Loi cua API funnel. Giu nguyen hinh dang cu { ok:false, error:{code,message} }
 * vi public/funnel.js va public/admin.html dang doc dung dang nay.
 */
export function apiError(status, code, message, extra = {}) {
  return json({ ok: false, error: { code, message, ...extra } }, status);
}

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}

/** Gan them header vao mot Response da co (Response goc bat bien). */
export function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [key, value] of Object.entries(headers)) out.headers.set(key, value);
  return out;
}
