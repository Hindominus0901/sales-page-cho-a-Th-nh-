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
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  const current = Number((await env.CACHE.get(k)) ?? '0');
  if (current >= limit) return { ok: false, remaining: 0 };
  await env.CACHE.put(k, String(current + 1), { expirationTtl: Math.max(60, windowSec * 2) });
  return { ok: true, remaining: limit - current - 1 };
}
