/** Bang dinh tuyen cho /api/*. */
import { json, apiError } from './lib/respond.js';
import { readJsonBody, corsHeaders } from './lib/http.js';
import { ensureCsrfCookie, checkCsrf } from './lib/csrf.js';
import { handleAdmin } from './routes/admin.js';
import { uploadFile, readFile } from './routes/files.js';
import { handleEntities } from './entities/api.js';
import { handleFunctions } from './functions/index.js';
import {
  register, resendOtp, verifyOtp, login, logout, resetRequest, resetPassword,
  me, updateMe, googleStart, googleCallback,
} from './routes/auth.js';
import { createLead } from './routes/leads.js';
import { track } from './routes/track.js';
import { createOrder, getOrder } from './routes/orders.js';
import { bankWebhook } from './routes/webhook.js';
import { trackRef, getPortal, updateSettings, getLeaderboard } from './routes/affiliate.js';

const ORDER_RE = /^\/api\/orders\/([A-Za-z0-9]+)$/;
const AFFILIATE_RE = /^\/api\/affiliate\/([A-Za-z0-9]+)$/;
const AFFILIATE_SETTINGS_RE = /^\/api\/affiliate\/([A-Za-z0-9]+)\/settings$/;

const POST_ROUTES = new Map([
  ['/api/leads', createLead],
  ['/api/track', track],
  ['/api/orders', createOrder],
  ['/api/webhooks/bank', bankWebhook],
  ['/api/ref', trackRef],

  ['/api/auth/register', register],
  ['/api/auth/resend-otp', resendOtp],
  ['/api/auth/verify-otp', verifyOtp],
  ['/api/auth/login', login],
  ['/api/auth/logout', logout],
  ['/api/auth/reset-request', resetRequest],
  ['/api/auth/reset', resetPassword],
]);

/**
 * Duong dan bat buoc phai kem ma chong CSRF.
 *
 * Cac endpoint cua funnel (/api/leads, /api/track, /api/ref, /api/orders) KHONG
 * nam trong danh sach: chung do trang tinh funnel.js goi, khong biet gi ve ma
 * nay, va cung khong thao tac tren tai khoan dang dang nhap. Webhook ngan hang
 * cung duoc mien vi la may chu goi may chu va da co secret rieng.
 *
 * /api/admin/* KHONG nam day ma duoc kiem ben trong requireAdmin: cho do moi
 * biet nguoi goi dang dung cookie hay dung token. Script/CI goi bang token thi
 * khong co cookie nao de bi loi dung, nen kiem CSRF la vo nghia va chi lam hong.
 */
const csrfProtected = (pathname) =>
  pathname.startsWith('/api/auth/')
  || pathname.startsWith('/api/entities/')
  || pathname.startsWith('/api/functions/')
  || pathname.startsWith('/api/agents/')
  || pathname === '/api/files';   // chi POST; GET /api/files/... la doc anh, khong ghi gi

export async function handleApi(rc) {
  const { pathname } = rc.url;
  const method = rc.request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(rc.request, rc.cfg) });
  }

  if (pathname === '/api/health') {
    return json({
      ok: true,
      storage: rc.env.DB ? 'd1' : 'chua-noi',
      environment: rc.cfg.environment,
      version: 2,
      at: new Date().toISOString(),
    });
  }

  if (pathname === '/api/config' && method === 'GET') {
    const { cfg } = rc;
    return json({
      ok: true,
      product: {
        name: cfg.product.name,
        price: cfg.product.price,
        price_text: cfg.formatPrice(cfg.product.price),
        list_price_text: cfg.formatPrice(cfg.product.listPrice),
      },
      zalo: {
        url: cfg.zalo.supportUrl,
        phone: cfg.zalo.supportPhone,
        group_url: cfg.zalo.groupUrl,
      },
    });
  }

  // AuthContext cua SPA goi duong dan nay TRUOC MOI THU va hong ca app neu no
  // 404. Nhan tien cap luon cookie chong CSRF cho cac lan goi sau.
  if (pathname.startsWith('/api/apps/public/')) {
    ensureCsrfCookie(rc);
    return json({ id: rc.env.WORKER_NAME || 'platform', public_settings: {} });
  }

  // Google chuyen huong nguoi dung ve day - la dieu huong that trong trinh
  // duyet nen khong co body va khong kem ma CSRF.
  if (pathname === '/api/auth/google/start' && method === 'GET') return googleStart(rc);
  if (pathname === '/api/auth/google/callback' && method === 'GET') return googleCallback(rc);

  if (pathname === '/api/auth/me') {
    if (method === 'GET') { ensureCsrfCookie(rc); return me(rc); }
    if (method === 'PATCH') {
      rc.body = await readJsonBody(rc.request, rc.cfg.limits.bodyBytes).catch(() => ({}));
      const bad = checkCsrf(rc);
      if (bad) return apiError(403, 'csrf_failed', bad);
      return updateMe(rc);
    }
    return apiError(405, 'method_not_allowed', 'Method không hỗ trợ');
  }

  // Doc body mot lan cho moi route can den no - NHUNG CHI KHI DO LA JSON.
  //
  // Than request chi doc duoc mot lan. Truoc day doan nay doc JSON cho MOI
  // POST, ke ca multipart: no vua lam can luong (khien `request.formData()`
  // ben trong uploadFile khong con gi de doc) vua nem loi "Du lieu khong phai
  // JSON hop le" ngay tai day - nen route /api/files ben duoi KHONG BAO GIO
  // duoc goi. Do la ly do that su cua "khong tai duoc anh dai dien", va vi anh
  // dai dien tung la dieu kien bat buoc de vao lop, no khoa cua ca lop hoc.
  const kieuND = (rc.request.headers.get('content-type') || '').toLowerCase();
  const laJson = !kieuND || kieuND.includes('json');
  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && laJson) {
    try {
      rc.body = await readJsonBody(rc.request, rc.cfg.limits.bodyBytes);
    } catch (err) {
      return apiError(err.status || 400, 'bad_body', err.message);
    }
  }

  if (csrfProtected(pathname)) {
    const bad = checkCsrf(rc);
    if (bad) return apiError(403, 'csrf_failed', bad);
  }

  if (pathname === '/api/files' && method === 'POST') return uploadFile(rc);
  if (pathname.startsWith('/api/files/') && method === 'GET') {
    rc.params = { key: decodeURIComponent(pathname.slice('/api/files/'.length)) };
    return readFile(rc);
  }

  const admin = await handleAdmin(rc);
  if (admin) return admin;

  const entities = await handleEntities(rc);
  if (entities) return entities;

  const fn = await handleFunctions(rc);
  if (fn) return fn;

  const orderMatch = ORDER_RE.exec(pathname);
  if (orderMatch && method === 'GET') {
    rc.params = { code: orderMatch[1] };
    return getOrder(rc);
  }

  if (pathname === '/api/leaderboard' && method === 'GET') return getLeaderboard(rc);

  const settingsMatch = AFFILIATE_SETTINGS_RE.exec(pathname);
  if (settingsMatch && method === 'POST') {
    rc.params = { token: settingsMatch[1] };
    return updateSettings(rc);
  }

  const affiliateMatch = AFFILIATE_RE.exec(pathname);
  if (affiliateMatch && method === 'GET') {
    rc.params = { token: affiliateMatch[1] };
    return getPortal(rc);
  }

  const post = POST_ROUTES.get(pathname);
  if (post) {
    if (method !== 'POST') return apiError(405, 'method_not_allowed', 'Method không hỗ trợ');
    return post(rc);
  }

  return apiError(404, 'not_found', 'Endpoint không tồn tại');
}
