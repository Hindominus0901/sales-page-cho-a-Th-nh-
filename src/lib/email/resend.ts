import type { Env } from '../../types';

export interface SendInput {
  to: string;
  toName: string | null;
  subject: string;
  text: string;
  html: string | null;
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * Gửi qua Resend bằng fetch thẳng — không thêm thư viện cho một lời gọi HTTP.
 *
 * Tách riêng file này để sau muốn đổi nhà cung cấp (hoặc thêm bộ gửi Zalo ZNS)
 * thì chỉ viết thêm một hàm cùng dạng, không đụng vào hàng đợi.
 */
export async function sendMail(env: Env, input: SendInput): Promise<SendResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { ok: false, error: 'chưa đặt RESEND_API_KEY hoặc EMAIL_FROM' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [input.toName ? `${input.toName} <${input.to}>` : input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend trả ${res.status}: ${body.slice(0, 300)}` };
    }

    const data = await res.json<{ id?: string }>().catch(() => ({} as { id?: string }));
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    return { ok: false, error: `không gọi được Resend: ${String(err).slice(0, 300)}` };
  }
}
