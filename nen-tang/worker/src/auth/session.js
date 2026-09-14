/**
 * Phien dang nhap cua nguoi dung.
 *
 * Cookie chua mot chuoi ngau nhien 32 byte, KHONG mang thong tin gi. Database
 * chi luu ban bam SHA-256 cua no. Hai he qua:
 *   - doc trom database khong dang nhap thay ai duoc
 *   - huy phien duoc ngay lap tuc (cookie ky HMAC vo trang thai thi khong)
 *
 * Vi sao khong dung token trong localStorage nhu Base44: bat ky lo hong XSS nao
 * cung doc duoc localStorage. Cookie HttpOnly thi JavaScript khong cham vao duoc.
 */
import { randomToken, sha256Hex } from '../lib/crypto.js';

const SESSION_DAYS = 30;

/**
 * Ten cookie. Tien to __Host- bat trinh duyet ep buoc Secure + Path=/ + khong
 * co Domain - chan duoc kieu tan cong "ghi de cookie tu ten mien con".
 * Chay o may qua http:// thi tien to nay khong hop le nen phai bo.
 */
export const sessionCookieName = (rc) =>
  (rc.url.protocol === 'https:' ? '__Host-pf_sess' : 'pf_sess');

/** Cookie CSRF: KHONG HttpOnly vi frontend phai doc de gan vao header. */
export const CSRF_COOKIE = 'pf_csrf';

export async function createSession(rc, userId) {
  const token = randomToken();
  const id = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await rc.store.run(
    `INSERT INTO auth_sessions (id, user_id, created_at, expires_at, last_seen_at, ip, user_agent)
     VALUES (?,?,?,?,?,?,?)`,
    [id, userId, now.toISOString(), expires.toISOString(), now.toISOString(),
      rc.ip, String(rc.userAgent).slice(0, 300)],
  );

  return { token, expiresAt: expires };
}

/** Doc phien tu cookie. Tra ve nguoi dung, hoac null. */
export async function readSession(rc) {
  const token = rc.cookies[sessionCookieName(rc)];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  const id = await sha256Hex(token);
  const row = await rc.store.get(
    `SELECT s.id, s.user_id, s.expires_at, s.revoked_at, s.last_seen_at
     FROM auth_sessions s WHERE s.id = ?`, [id]);
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const user = await rc.store.get('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (!user) return null;
  // Khoa/cam tai khoan co hieu luc ngay tren moi phien dang mo.
  if (user.status !== 'active') return null;

  // Chi ghi last_seen_at khi da qua 5 phut, tranh mot luot ghi cho moi request.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    rc.waitUntil(rc.store.run('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?',
      [new Date().toISOString(), id]).catch(() => {}));
  }

  return { user, sessionId: id };
}

export async function revokeSession(rc) {
  const token = rc.cookies[sessionCookieName(rc)];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await rc.store.run('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
    [new Date().toISOString(), await sha256Hex(token)]);
}

/** Doi mat khau -> dang xuat moi thiet bi khac. */
export const revokeAllSessions = (rc, userId) =>
  rc.store.run('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    [new Date().toISOString(), userId]);

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
