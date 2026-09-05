import type { Env } from '../../types';

/**
 * Kiểm tra Turnstile. Chưa cấu hình khoá bí mật thì trả về true — để môi
 * trường dev và bản triển khai đầu chạy được ngay, không bị chặn form.
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  ip: string | null,
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    // Turnstile chết không được phép làm chết luôn form đăng ký.
    console.error('[turnstile] không gọi được dịch vụ kiểm tra — cho qua');
    return true;
  }
}
