/**
 * Diem vao duy nhat cua ca he thong.
 *
 * Mot Worker phuc vu ba thu:
 *   /api/*      - backend (dang ky, don hang, webhook ngan hang, affiliate...)
 *   /f/*        - trang ban hang tinh, dung san luc build
 *   con lai     - SPA cong dong
 */
import {
  fail, HttpError, SECURITY_HEADERS, PRIVATE_HEADERS, CSP_APP, CSP_FUNNEL, withHeaders,
} from './lib/respond.js';
import { corsHeaders, finish, sweepRateLimits } from './lib/http.js';
import { createContext } from './context.js';
import { chayHangNgay } from './cron.js';
import { handleApi } from './router.js';
import { FUNNEL_PAGES, FUNNEL_FIXED } from './routes.generated.js';

/** Trang rieng tu: khong cho Google lap chi muc, khong cho cache. */
const PRIVATE_PATHS = new Set(['/admin', '/quan-tri-funnel', '/dai-ly']);

/**
 * Bang duong dan trang ban hang. Sinh tu brand/brand.json (npm run brand:apply)
 * de no va apps/funnel/build.mjs khong the lech nhau: truoc day moi ben giu mot
 * bang rieng, doi duong dan o mot ben la trang do 404 ma khong ai hieu vi sao.
 */
const FUNNEL_ROUTES = new Map([...FUNNEL_PAGES, ...FUNNEL_FIXED]);

/**
 * Tam thoi phan biet hai mat cua he thong bang bien moi truong APP_HOST.
 * Giai doan sau se thay bang bang `sites` trong D1, de them thuong hieu moi
 * chi la them mot dong du lieu.
 */
const isAppHost = (env, url) => !!env.APP_HOST && url.hostname === env.APP_HOST;

/**
 * Cuu link gioi thieu go sai duong dan.
 *
 * Mot link kieu /join?ref=MA (duong dan cua ban ung dung cu) khong khop trang
 * ban hang nao, nen no roi xuong SPA va hien trang "404 Page Not Found" cua khu
 * vuc thanh vien: nguoi duoc moi bo di, con nguoi gioi thieu mat luot - khong
 * log, khong canh bao, khong ai biet. Chuyen tuong tu voi link tro nham vao ten
 * mien webapp: o do khong co funnel.js nen POST /api/ref khong bao gio chay.
 *
 * Nen thay vi trong cho moi nguoi go dung duong dan, bat ky duong dan la nao
 * mang theo ?ref= deu duoc keo ve trang ban hang. Giu nguyen ca query de utm_*
 * va fbclid khong bi rung mat giua duong.
 */
function cuuLinkGioiThieu(env, url) {
  const ma = (url.searchParams.get('ref') || '').toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(ma)) return null;

  const banHang = String(env.APP_ORIGIN || '').replace(/\/$/, '');
  const nhamSangWebapp = isAppHost(env, url);
  // Khong biet trang ban hang o dau thi thoi, con hon la day nguoi ta di lung tung.
  if (nhamSangWebapp && !banHang) return null;
  // Duong dan dung roi (/, /dang-ky, /vip...) - de yen cho funnel.js lam viec.
  if (!nhamSangWebapp && FUNNEL_ROUTES.has(url.pathname)) return null;

  const dich = new URL(`${nhamSangWebapp ? banHang : url.origin}/`);
  dich.search = url.search;
  dich.searchParams.set('ref', ma);
  // Chan vong lap: neu cau hinh dat APP_ORIGIN trung ten mien webapp thi doan
  // tren se tra ve dung dia chi vua goi, va trinh duyet quay vong toi khi bo
  // cuoc. Tha khong cuu duoc con hon lam chet han trang.
  if (dich.host === url.host && dich.pathname === url.pathname) return null;
  return Response.redirect(dich.toString(), 302);
}

/** Thinh thoang don bang dem gioi han so lan goi (khong lam cham request). */
function maybeSweep(rc) {
  if (Math.random() > 0.01) return;
  rc.waitUntil(sweepRateLimits(rc.store).catch(() => {}));
}

export default {
  async fetch(request, env, ctx) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return fail(400, 'Dia chi khong hop le');
    }

    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');

    // Trang tinh khong can dung den D1 - dung tao context cho nhung request do.
    if (!isApi) {
      try {
        const cuu = cuuLinkGioiThieu(env, url);
        if (cuu) return cuu;

        // Trang thanh toan cua Goc Creator mang ma don TREN DUONG DAN
        // (/thanh-toan/GCZK8PQR) de khach dong tab roi mo lai van thay don cu.
        // Bang FUNNEL_ROUTES la so khop chinh xac nen khong bat duoc dang nay:
        // thieu nhanh duoi day thi vua tao don xong la rot vao trang 404 cua SPA.
        const maDon = /^\/thanh-toan\/[A-Za-z0-9]{1,32}$/.test(url.pathname);
        const funnelTarget = isAppHost(env, url)
          ? null
          : (maDon ? '/f/thanh-toan' : FUNNEL_ROUTES.get(url.pathname));
        if (funnelTarget) {
          const res = await env.ASSETS.fetch(new URL(funnelTarget, url.origin));
          const extra = PRIVATE_PATHS.has(url.pathname)
            ? { ...SECURITY_HEADERS, ...PRIVATE_HEADERS, 'Content-Security-Policy': CSP_FUNNEL }
            : { ...SECURITY_HEADERS, 'Content-Security-Policy': CSP_FUNNEL };
          return withHeaders(res, extra);
        }

        let res = await env.ASSETS.fetch(request);

        // Dien ma Facebook Pixel vao the meta cua khu vuc thanh vien. Lam o day
        // chu khong nhung script inline vao HTML: CSP cua khu vuc do dat
        // script-src 'self', mo 'unsafe-inline' de nhet pixel la ha mot trong
        // nhung lop chan XSS quan trong nhat, ngay tai noi co noi dung do nguoi
        // dung nhap. HTMLRewriter chay theo luong, khong doc ca file vao bo nho.
        if (env.FB_PIXEL_ID && (res.headers.get('content-type') || '').includes('text/html')) {
          res = new HTMLRewriter()
            .on('meta[name="fb-pixel-id"]', {
              element(el) { el.setAttribute('content', env.FB_PIXEL_ID); },
            })
            .transform(res);
        }
        // Moi trang HTML khong phai trang ban hang deu la khu vuc thanh vien
        // (SPA) hoac ban xem truoc -> khong duoc de lot vao Google. Truoc day
        // /admin khong co header nay vi no khong di qua nhanh FUNNEL_ROUTES.
        // File tinh (js/css/anh) khong dinh gi, van cache binh thuong.
        const isHtml = (res.headers.get('content-type') || '').includes('text/html');
        return withHeaders(res, isHtml
          ? { ...SECURITY_HEADERS, ...PRIVATE_HEADERS, 'Content-Security-Policy': CSP_APP }
          : SECURITY_HEADERS);
      } catch (err) {
        console.error('[worker] loi khi phuc vu file tinh', err?.stack || err);
        return fail(500, 'He thong dang gap su co, thu lai sau it phut');
      }
    }

    let rc;
    try {
      rc = createContext(request, env, ctx, url);
    } catch (err) {
      console.error('[worker] khong tao duoc boi canh', err?.stack || err);
      return fail(503, 'He thong chua san sang (thieu ket noi co so du lieu)');
    }

    try {
      const res = await handleApi(rc);
      maybeSweep(rc);
      Object.assign(rc.extraHeaders, corsHeaders(request, rc.cfg));
      return finish(rc, res);
    } catch (err) {
      if (err instanceof HttpError) return finish(rc, fail(err.status, err.message, err.extra));
      if (err?.status && err.status < 500) return finish(rc, fail(err.status, err.message));
      console.error('[worker] loi khong bat duoc', url.pathname, err?.stack || err);
      return finish(rc, fail(500, 'He thong dang gap su co, thu lai sau it phut'));
    }
  },

  /**
   * Cron: 18:00 UTC = 01:00 gio Viet Nam. Nhac chuoi ngay, nhac buoi live ngay
   * mai, doi soat diem, don ban ghi tam.
   *
   * Bat loi o day chu khong de nem ra: mot lan cron hong khong duoc bao dong,
   * khong ai ngoi nhin, nen phai in ra log thi moi truy duoc.
   */
  async scheduled(event, env, ctx) {
    try {
      await chayHangNgay(env, ctx);
    } catch (err) {
      console.error('[cron] hong toan bo lan chay', event?.cron, err?.stack || err);
    }
  },
};
