import type { Context } from 'hono';
import type { Env, HonoEnv } from '../../types';
import { randomToken } from '../util/id';
import { now, daysFromNow } from '../util/datetime';
import { hmacSha256, timingSafeEqual, hashIp } from '../security/hash';

/**
 * Cookie TÁCH TÊN theo vai trò. Một bảng sessions phục vụ cả hai, nhưng phiên
 * CTV không bao giờ được trình ra ở route admin — kể cả khi lộ id phiên,
 * vì trình duyệt chỉ gửi cookie đúng tên, và guard đọc đúng cookie của vai trò
 * mình rồi còn kiểm lại subject_type trong DB.
 */
export const COOKIE_ADMIN = '__Host-gc_admin';
export const COOKIE_AFF = '__Host-gc_aff';

const SESSION_DAYS = 30;

export interface SessionRow {
  id: string;
  subject_type: 'admin' | 'affiliate';
  subject_id: string;
  csrf_secret: string;
  expires_at: number;
  revoked_at: number | null;
}

export async function createSession(
  env: Env,
  subjectType: 'admin' | 'affiliate',
  subjectId: string,
  req: Request,
): Promise<{ id: string; cookie: string }> {
  const id = randomToken(32);
  const csrfSecret = randomToken(32);
  const ts = now();
  const ipHash = await hashIp(env, req.headers.get('cf-connecting-ip'));

  await env.DB.prepare(
    `INSERT INTO sessions
       (id, subject_type, subject_id, csrf_secret, ip_hash, user_agent,
        created_at, last_seen_at, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(id, subjectType, subjectId, csrfSecret, ipHash,
    req.headers.get('user-agent'), ts, ts, daysFromNow(SESSION_DAYS)).run();

  const signature = await hmacSha256(env.SESSION_SECRET, id);
  const name = subjectType === 'admin' ? COOKIE_ADMIN : COOKIE_AFF;

  /**
   * Tiền tố __Host- bắt buộc Secure + Path=/ và cấm Domain — cookie không thể
   * bị đặt từ một subdomain khác. Trên http localhost trình duyệt từ chối
   * tiền tố này, nên dev dùng tên thường.
   */
  const isHttps = new URL(req.url).protocol === 'https:';
  const cookieName = isHttps ? name : name.replace('__Host-', '');
  const parts = [
    `${cookieName}=${id}.${signature}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`,
  ];
  if (isHttps) parts.push('Secure');

  return { id, cookie: parts.join('; ') };
}

export function clearCookie(name: string, isHttps: boolean): string {
  const cookieName = isHttps ? name : name.replace('__Host-', '');
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`;
}

/** Đọc và xác minh phiên. Trả null nếu thiếu, sai chữ ký, hết hạn hoặc bị thu hồi. */
export async function readSession(
  env: Env,
  req: Request,
  subjectType: 'admin' | 'affiliate',
): Promise<SessionRow | null> {
  const name = subjectType === 'admin' ? COOKIE_ADMIN : COOKIE_AFF;
  const bare = name.replace('__Host-', '');
  const raw = readCookie(req, name) ?? readCookie(req, bare);
  if (!raw) return null;

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const id = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = await hmacSha256(env.SESSION_SECRET, id);
  if (!timingSafeEqual(signature, expected)) return null;

  const row = await env.DB
    .prepare(`SELECT * FROM sessions WHERE id = ? AND subject_type = ?`)
    .bind(id, subjectType)
    .first<SessionRow>();
  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (row.expires_at < now()) return null;

  // Gia hạn trượt: chỉ ghi khi đã quá một ngày, tránh mỗi request một lần ghi.
  const ts = now();
  if (row.expires_at - ts < (SESSION_DAYS - 1) * 86400) {
    await env.DB.prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?`)
      .bind(ts, daysFromNow(SESSION_DAYS), id).run();
  }
  return row;
}

export async function revokeSession(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ?`).bind(now(), id).run();
}

/** Thu hồi mọi phiên của một người — dùng khi khoá tài khoản hoặc đổi mật khẩu. */
export async function revokeAllSessions(
  env: Env, subjectType: 'admin' | 'affiliate', subjectId: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE sessions SET revoked_at = ? WHERE subject_type = ? AND subject_id = ? AND revoked_at IS NULL`,
  ).bind(now(), subjectType, subjectId).run();
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// ---------------------------------------------------------------- CSRF

/**
 * Double-submit: token là HMAC(csrf_secret của phiên, id phiên). Kẻ tấn công
 * ở site khác không đọc được csrf_secret (nằm trong DB) nên không dựng được
 * token hợp lệ, dù trình duyệt có tự gửi cookie đi nữa.
 */
export const csrfToken = (session: SessionRow): Promise<string> =>
  hmacSha256(session.csrf_secret, session.id);

export async function assertCsrf(c: Context<HonoEnv>, session: SessionRow): Promise<boolean> {
  // Kiểm Origin trước: rẻ, và chặn được phần lớn request giả mạo.
  const origin = c.req.header('origin');
  if (origin) {
    const here = new URL(c.req.url).origin;
    if (origin !== here) return false;
  }
  const presented = c.req.header('x-csrf-token') ?? '';
  if (!presented) return false;
  return timingSafeEqual(presented, await csrfToken(session));
}
