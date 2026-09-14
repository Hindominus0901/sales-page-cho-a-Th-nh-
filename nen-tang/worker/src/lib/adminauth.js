/**
 * Dang nhap trang quan tri.
 *
 * Khac ban cu ba diem:
 *   1. Bam mat khau bang PBKDF2-SHA256 qua WebCrypto - Workers khong co scrypt.
 *   2. KHONG con mat khau khoi tao nam san trong ma nguon. Chua dat
 *      ADMIN_PASSWORD_HASH thi trang quan tri dong hoan toan.
 *   3. Khong nhan mat khau de nguyen trong bien moi truong nua.
 *
 * Giai doan 2 se thay ca file nay bang requireRole('admin') tren he tai khoan
 * that; giu nguyen dinh dang cookie de luc do khong pha vo phien dang mo.
 */
import { setCookie } from './http.js';
import { safeEqual, verifyPassword } from './crypto.js';

const ADMIN_COOKIE = 'fnl_admin';

const enc = new TextEncoder();

const toB64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// --- phien ------------------------------------------------------------------
/**
 * Khoa ky cookie. Uu tien SESSION_SECRET; neu chua dat thi suy ra tu ban bam
 * mat khau - nghia la doi mat khau se lam moi phien dang mo bi vo hieu.
 */
async function signingKey(cfg) {
  const material = cfg.sessionSecret || cfg.admin.passwordHash;
  return crypto.subtle.importKey('raw', enc.encode(material), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']);
}

const sign = async (cfg, data) =>
  toB64Url(await crypto.subtle.sign('HMAC', await signingKey(cfg), enc.encode(data)));

export async function issueSession(cfg, username) {
  const payload = toB64Url(enc.encode(JSON.stringify({
    u: username,
    exp: Date.now() + cfg.admin.sessionHours * 60 * 60 * 1000,
  })));
  return `${payload}.${await sign(cfg, payload)}`;
}

async function readSession(cfg, token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(await sign(cfg, payload), signature)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(payload)));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export async function loginSession(rc, username) {
  setCookie(rc, ADMIN_COOKIE, await issueSession(rc.cfg, username), {
    maxAge: rc.cfg.admin.sessionHours * 60 * 60,
  });
}

export function clearSession(rc) {
  setCookie(rc, ADMIN_COOKIE, '', { maxAge: 0 });
}

export async function checkCredentials(cfg, username, password) {
  if (!cfg.admin.passwordHash) return { ok: false };
  // So sanh ca ten lan mat khau roi moi tra ve, de khong lo duoc cai nao sai.
  const userOk = safeEqual(username, cfg.admin.user);
  const passOk = await verifyPassword(password, cfg.admin.passwordHash);
  return { ok: userOk && passOk };
}

/**
 * Hai duong vao: cookie phien (nguoi that dung trinh duyet) va header
 * X-Admin-Token (script/CI). Token khong bao gio nhan qua query string - no se
 * nam lai trong log may chu, lich su trinh duyet va header Referer.
 */
export async function authenticate(rc) {
  const cfg = rc.cfg;

  const headerToken = rc.request.headers.get('x-admin-token')
    || (rc.request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (headerToken && cfg.admin.serviceToken && safeEqual(headerToken, cfg.admin.serviceToken)) {
    return { ok: true, user: cfg.admin.user, via: 'token' };
  }

  const session = await readSession(cfg, rc.cookies[ADMIN_COOKIE]);
  if (session) return { ok: true, user: session.u, via: 'session' };

  return { ok: false };
}

export { ADMIN_COOKIE };
