import type { Env } from '../../types';

/**
 * Đếm cửa sổ cố định trên KV. Không tuyệt đối chính xác khi có đua, nhưng đủ
 * để chặn spam form — và sai số luôn nghiêng về phía cho qua, không phải chặn
 * nhầm người thật.
 */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; remaining: number }> {
  const k = bucketKey(key, windowSec);
  const current = Number((await env.CACHE.get(k)) ?? '0');
  if (current >= limit) return { ok: false, remaining: 0 };
  await env.CACHE.put(k, String(current + 1), { expirationTtl: ttl(windowSec) });
  return { ok: true, remaining: limit - current - 1 };
}

/**
 * Ba hàm dưới đây tách việc ĐỌC khỏi việc ĐẾM, dành cho khoá đăng nhập.
 *
 * Nếu dùng rateLimit() cho đăng nhập thì mỗi lần đăng nhập ĐÚNG cũng tiêu một
 * lượt, và người dùng đăng nhập vài lần trong ngày (đổi máy, hết phiên) sẽ bị
 * khoá oan. Chỉ lần SAI mới được tính, và đăng nhập đúng thì xoá sạch bộ đếm.
 */
export async function isLockedOut(
  env: Env, key: string, limit: number, windowSec: number,
): Promise<boolean> {
  const current = Number((await env.CACHE.get(bucketKey(key, windowSec))) ?? '0');
  return current >= limit;
}

export async function recordFailure(env: Env, key: string, windowSec: number): Promise<void> {
  const k = bucketKey(key, windowSec);
  const current = Number((await env.CACHE.get(k)) ?? '0');
  await env.CACHE.put(k, String(current + 1), { expirationTtl: ttl(windowSec) });
}

export async function clearFailures(env: Env, key: string, windowSec: number): Promise<void> {
  await env.CACHE.delete(bucketKey(key, windowSec));
}

const bucketKey = (key: string, windowSec: number) =>
  `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;

const ttl = (windowSec: number) => Math.max(60, windowSec * 2);
