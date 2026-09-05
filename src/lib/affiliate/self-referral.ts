import type { Env } from '../../types';

export type SelfReferralDecision = 'allow' | 'hold' | 'reject';

export interface SelfReferralVerdict {
  decision: SelfReferralDecision;
  reason: string | null;
}

interface OrderLike {
  id: string;
  phone_norm: string;
  email_norm: string | null;
  full_name: string;
  affiliate_id: string | null;
  visitor_id?: string | null;
  ip_hash?: string | null;
}

/**
 * Phát hiện cộng tác viên tự mua qua link của chính mình.
 *
 * Nguyên tắc: chỉ TỪ CHỐI thẳng khi bằng chứng là chắc chắn (trùng số điện
 * thoại hoặc email của chính CTV). Mọi tín hiệu yếu hơn thì TREO lại chờ admin
 * xem — vì các tín hiệu đó có thể trùng hợp thật (hai vợ chồng dùng chung
 * wifi, CTV giới thiệu cho người nhà). Treo thì CTV còn khiếu nại được; huỷ
 * âm thầm thì họ chỉ thấy hoa hồng biến mất mà không hiểu vì sao.
 */
export async function assessSelfReferral(
  env: Env,
  order: OrderLike,
): Promise<SelfReferralVerdict> {
  if (!order.affiliate_id) return { decision: 'allow', reason: null };

  const aff = await env.DB.prepare(
    `SELECT phone_norm, email_norm, bank_account_name, last_login_ip_hash
     FROM affiliates WHERE id = ?`,
  ).bind(order.affiliate_id).first<{
    phone_norm: string | null;
    email_norm: string | null;
    bank_account_name: string | null;
    last_login_ip_hash: string | null;
  }>();

  if (!aff) return { decision: 'allow', reason: null };

  // --- Bằng chứng chắc chắn: người mua chính là CTV.
  if (aff.phone_norm && aff.phone_norm === order.phone_norm) {
    return { decision: 'reject', reason: 'self_referral_same_phone' };
  }
  if (aff.email_norm && order.email_norm && aff.email_norm === order.email_norm) {
    return { decision: 'reject', reason: 'self_referral_same_email' };
  }

  // --- Tín hiệu yếu: treo lại, không huỷ.
  if (aff.last_login_ip_hash && order.ip_hash && aff.last_login_ip_hash === order.ip_hash) {
    return { decision: 'hold', reason: 'same_ip_as_affiliate_login' };
  }

  if (order.visitor_id) {
    const sameDevice = await env.DB.prepare(
      `SELECT 1 FROM affiliate_clicks
       WHERE affiliate_id = ? AND visitor_id = ? AND is_first_touch = 1
         AND ip_hash IS NOT NULL AND ip_hash = ?
       LIMIT 1`,
    ).bind(order.affiliate_id, order.visitor_id, aff.last_login_ip_hash).first();
    if (sameDevice) return { decision: 'hold', reason: 'same_device_as_affiliate' };
  }

  if (aff.bank_account_name && nameSimilar(aff.bank_account_name, order.full_name)) {
    return { decision: 'hold', reason: 'buyer_name_matches_affiliate_bank_account' };
  }

  // --- Cờ mềm: nhiều đơn cùng một IP cho một CTV trong 24h.
  if (order.ip_hash) {
    const burst = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM orders
       WHERE affiliate_id = ? AND ip_hash = ? AND created_at > unixepoch() - 86400
         AND id != ?`,
    ).bind(order.affiliate_id, order.ip_hash, order.id).first<{ n: number }>();
    if ((burst?.n ?? 0) >= 3) {
      return { decision: 'hold', reason: 'many_orders_same_ip_24h' };
    }
  }

  return { decision: 'allow', reason: null };
}

/**
 * So tên gần đúng: bỏ dấu, viết hoa, bỏ khoảng trắng. Tên tài khoản ngân hàng
 * luôn không dấu và viết hoa, còn tên khách nhập thì có dấu — nên phải chuẩn
 * hoá cả hai về cùng dạng mới so được.
 */
export function nameSimilar(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toUpperCase().replace(/[^A-Z]/g, '');
  const x = norm(a);
  const y = norm(b);
  return x.length > 4 && y.length > 4 && x === y;
}
