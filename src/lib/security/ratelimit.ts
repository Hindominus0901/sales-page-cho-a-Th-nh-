import type { Env } from '../../types';

/**
 * Đếm cửa sổ cố định trên KV. Không tuyệt đối chính xác khi có đua, nhưng đủ
 * để chặn spam form — và sai số luôn nghiêng về phía cho qua, không phải chặn
 * nhầm người thật.
 */
/**
 * KV hỏng thì CHO QUA, không chặn.
 *
 * Đếm số lần gọi là lớp phòng thủ chiều sâu, không phải khoá chính. KV mất kết
 * nối mà để nó ném ngoại lệ thì cả trang đăng ký lẫn trang đăng nhập quản trị
 * chết theo — đổi một lớp chống spam lấy toàn bộ hệ thống là lỗ nặng. Ghi log
 * để còn biết mà sửa.
 */
async function guard<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[ratelimit] ${what} lỗi — bỏ qua lần này:`, err);
    return fallback;
  }
}

export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ ok: boolean; remaining: number }> {
  return guard('rateLimit', async () => {
    const k = bucketKey(key, windowSec);
    const current = Number((await env.CACHE.get(k)) ?? '0');
    if (current >= limit) return { ok: false, remaining: 0 };
    await env.CACHE.put(k, String(current + 1), { expirationTtl: ttl(windowSec) });
    return { ok: true, remaining: limit - current - 1 };
  }, { ok: true, remaining: limit });
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
  return guard('isLockedOut', async () => {
    const current = Number((await env.CACHE.get(bucketKey(key, windowSec))) ?? '0');
    return current >= limit;
  }, false);
}

export async function recordFailure(env: Env, key: string, windowSec: number): Promise<void> {
  await guard('recordFailure', async () => {
    const k = bucketKey(key, windowSec);
    const current = Number((await env.CACHE.get(k)) ?? '0');
    await env.CACHE.put(k, String(current + 1), { expirationTtl: ttl(windowSec) });
  }, undefined);
}

export async function clearFailures(env: Env, key: string, windowSec: number): Promise<void> {
  await guard('clearFailures', () => env.CACHE.delete(bucketKey(key, windowSec)), undefined);
}

const bucketKey = (key: string, windowSec: number) =>
  `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;

const ttl = (windowSec: number) => Math.max(60, windowSec * 2);
