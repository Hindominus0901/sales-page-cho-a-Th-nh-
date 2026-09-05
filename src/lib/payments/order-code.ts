import type { Env } from '../../types';
import { shortCode } from '../util/id';

/**
 * Mã đơn = tiền tố + 6 ký tự từ bảng chữ không nhập nhằng (bỏ B I O S U 0 1 2 5 8).
 *
 * Hai lý do cho bảng chữ này: khách hay GÕ TAY nội dung chuyển khoản khi app
 * ngân hàng không quét được QR, và ngân hàng thường viết hoa rồi cắt bớt nội
 * dung — nên mã phải đọc rõ và neo được bằng regex sau khi bỏ hết ký tự lạ.
 */
const ALPHABET_CLASS = '[ACDEFGHJKLMNPQRTVWXY34679]';

export const orderCodeRegex = (prefix: string): RegExp =>
  new RegExp(`${prefix}${ALPHABET_CLASS}{6}`);

/**
 * Sinh mã chưa bị trùng. Va chạm được xử lý bằng UNIQUE(order_code) lúc insert;
 * vòng lặp này chỉ để giảm số lần phải thử lại.
 */
export async function generateOrderCode(env: Env): Promise<string> {
  const prefix = env.ORDER_CODE_PREFIX || 'GC';
  for (let i = 0; i < 5; i++) {
    const code = prefix + shortCode(6);
    const hit = await env.DB
      .prepare('SELECT 1 FROM orders WHERE order_code = ? LIMIT 1')
      .bind(code)
      .first();
    if (!hit) return code;
  }
  throw new Error('Không sinh được mã đơn duy nhất sau 5 lần thử');
}

/**
 * Chuẩn hoá nội dung chuyển khoản trước khi dò mã.
 *
 * Ngân hàng Việt Nam bỏ dấu, viết hoa, và chèn thêm chữ ("CHUYEN TIEN",
 * "TU 0912...", "FT2609..."), có khi chèn cả dấu cách vào giữa. Bỏ sạch mọi
 * ký tự không phải chữ-số rồi mới dò là cách sống sót qua tất cả các kiểu đó.
 */
export function normalizeTransferContent(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Trích mã đơn từ nội dung chuyển khoản. Không tìm thấy thì trả null. */
export function extractOrderCode(env: Env, ...parts: (string | null | undefined)[]): string | null {
  const prefix = env.ORDER_CODE_PREFIX || 'GC';
  const haystack = normalizeTransferContent(parts.filter(Boolean).join(' '));
  return haystack.match(orderCodeRegex(prefix))?.[0] ?? null;
}
