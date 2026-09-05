import type { Env } from '../../types';

/** So sánh chuỗi thời gian hằng số — dùng cho mọi bí mật (khoá webhook, HMAC). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/**
 * Băm IP có muối để thống kê và chống lạm dụng mà không lưu IP thô.
 * Muối nằm trong secret, nên dump database cũng không truy ngược ra IP.
 */
export async function hashIp(env: Env, ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(env.IP_HASH_SALT + '|' + ip));
  return b64url(buf).slice(0, 22);
}

const PBKDF2_ITERATIONS = 210_000;

/**
 * Băm mật khẩu bằng PBKDF2-SHA256. Argon2/bcrypt cần WASM trên Workers;
 * PBKDF2 chạy native, ~50ms, đủ an toàn cho vài chục tài khoản nội bộ.
 * Định dạng: pbkdf2$<vòng>$<b64 muối>$<b64 hash>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt.buffer)}$${b64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const saltB64 = parts[2]!;
  const expected = parts[3]!;
  if (!Number.isInteger(iterations) || iterations < 1000) return false;

  const salt = fromB64url(saltB64);
  const bits = await derive(password, salt, iterations);
  return timingSafeEqual(b64url(bits), expected);
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256,
  );
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
