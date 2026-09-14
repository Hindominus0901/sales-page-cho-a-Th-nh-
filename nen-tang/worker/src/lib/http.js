/**
 * Tien ich HTTP cho Worker.
 *
 * Ban cu viet cho node:http `(req, res)`; o day moi thu xoay quanh `Request` va
 * `Response`. Cookie can dat khong the "setHeader" duoc nua nen duoc gom vao
 * rc.setCookies roi gan mot the vao Response cuoi cung.
 */
import { SECURITY_HEADERS } from './respond.js';

export const SESSION_COOKIE = 'fnl_sid';
export const REF_COOKIE = 'fnl_ref';

// --- cookie -----------------------------------------------------------------
export function parseCookies(request) {
  const header = request.headers.get('cookie');
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    try { out[key] = decodeURIComponent(part.slice(idx + 1).trim()); } catch { /* cookie hong, bo qua */ }
  }
  return out;
}

/** Ghi nhan mot cookie can dat; Response cuoi cung se gan het. */
export function setCookie(rc, name, value, { maxAge = 60 * 60 * 24 * 90, sameSite = 'Lax', httpOnly = true } = {}) {
  const secure = rc.url.protocol === 'https:' ? '; Secure' : '';
  const flags = httpOnly ? '; HttpOnly' : '';
  rc.setCookies.push(
    `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}${flags}; SameSite=${sameSite}${secure}`,
  );
}

// --- dinh danh --------------------------------------------------------------
export const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Lay session id tu cookie, tao moi neu chua co hoac khong dung dinh dang. */
export function ensureSessionId(rc) {
  const sid = rc.cookies[SESSION_COOKIE];
  if (sid && /^[a-f0-9]{32}$/.test(sid)) return sid;
  const fresh = newId();
  setCookie(rc, SESSION_COOKIE, fresh);
  return fresh;
}

/**
 * IP that cua khach. Tren Cloudflare luon lay CF-Connecting-IP - day la header
 * do chinh Cloudflare dat va khong the gia mao tu ben ngoai, khac han
 * X-Forwarded-For ma ban cu phai tin.
 */
export const clientIp = (request) =>
  request.headers.get('cf-connecting-ip')
  || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  || '';

// --- body -------------------------------------------------------------------
/** Doc body JSON, chan body qua lon. Tra {} khi rong. */
export async function readJsonBody(request, limit) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) {
    throw Object.assign(new Error('Du lieu gui len qua lon'), { status: 413 });
  }
  const raw = await request.text();
  // Content-Length co the thieu (chunked) nen phai do lai sau khi doc.
  if (raw.length > limit) {
    throw Object.assign(new Error('Du lieu gui len qua lon'), { status: 413 });
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw Object.assign(new Error('Du lieu khong phai JSON hop le'), { status: 400 });
  }
}

// --- gioi han so lan goi ----------------------------------------------------
/**
 * Dem trong D1 nen ca he thong dung chung mot con so (ban cu dem trong bo nho
 * cua tung tien trinh, tren serverless la vo nghia).
 *
 * @returns {Promise<{allowed:boolean, remaining:number, retryAfter:number}>}
 */
export async function rateLimit(rc, key, max, windowMs) {
  const nowMs = Date.now();
  const store = rc.store;
  const row = await store.get('SELECT count, reset_at FROM rate_limits WHERE key = ?', [key]);

  if (!row || Number(row.reset_at) <= nowMs) {
    await store.run(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?,1,?)
       ON CONFLICT(key) DO UPDATE SET count=1, reset_at=excluded.reset_at`,
      [key, nowMs + windowMs],
    );
    return { allowed: true, remaining: max - 1, retryAfter: 0 };
  }

  if (row.count >= max) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((Number(row.reset_at) - nowMs) / 1000) };
  }

  await store.run('UPDATE rate_limits SET count = count + 1 WHERE key = ?', [key]);
  return { allowed: true, remaining: max - row.count - 1, retryAfter: 0 };
}

/** Don rac dinh ky - goi qua ctx.waitUntil de khong lam cham request. */
export const sweepRateLimits = (store) =>
  store.run('DELETE FROM rate_limits WHERE reset_at < ?', [Date.now()]);

// --- so sanh chuoi chong do thoi gian ---------------------------------------
export function safeEqual(a, b) {
  const enc = new TextEncoder();
  const bufA = enc.encode(String(a));
  const bufB = enc.encode(String(b));
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i += 1) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

// --- CORS -------------------------------------------------------------------
export function corsHeaders(request, cfg) {
  const origin = request.headers.get('origin');
  if (!origin || cfg.corsOrigins.length === 0) return {};
  // CO Y khong ho tro "*": voi Allow-Credentials: true thi "*" khong tra ve
  // dau sao ma tra ve chinh origin dang goi - nghia la BAT KY trang web nao
  // cung doc duoc /api/admin/export/backup.json bang cookie cua admin dang
  // dang nhap. "*" lai la thu dau tien nguoi ta go khi gap loi CORS.
  if (!cfg.corsOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

// --- tra loi ----------------------------------------------------------------
/** Gan cookie da gom + header bao mat vao Response. */
export function finish(rc, res) {
  if (!rc.setCookies.length && !Object.keys(rc.extraHeaders).length) return res;
  const out = new Response(res.body, res);
  for (const [key, value] of Object.entries(rc.extraHeaders)) out.headers.set(key, value);
  for (const cookie of rc.setCookies) out.headers.append('Set-Cookie', cookie);
  return out;
}

export { SECURITY_HEADERS };
