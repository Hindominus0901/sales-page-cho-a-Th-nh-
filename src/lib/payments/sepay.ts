import type { Env } from '../../types';

/**
 * Payload webhook của SePay.
 *
 * ⚠️ Shape này THAY ĐỔI tuỳ tài khoản có bật virtual sub-account hay không:
 * `code` có thể null và nội dung nằm hết trong `content`, `subAccount` có thể
 * vắng mặt. Vì vậy mọi trường trừ `id` và `transferAmount` đều coi là tuỳ chọn,
 * và nhánh ghép đơn đọc GỘP cả `code` lẫn `content`.
 *
 * Cần chuyển thật 2.000đ một lần để chốt shape trước khi chạy bán.
 * Toàn bộ payload gốc luôn được ghi vào bảng webhook_events, nên nếu shape
 * khác dự đoán thì không mất dữ liệu — replay lại được từ bảng đó.
 */
export interface SepayWebhookPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string | null;
  code?: string | null;
  content?: string | null;
  transferType?: 'in' | 'out';
  transferAmount?: number;
  accumulated?: number;
  referenceCode?: string | null;
  description?: string | null;
}

/** Ảnh QR VietQR do SePay sinh. Không cần gọi API, không có bí mật trong URL. */
export function sepayQrUrl(
  env: Env,
  opts: { amount: number; description: string },
): string {
  const p = new URLSearchParams({
    acc: env.SEPAY_ACCOUNT_NO,
    bank: env.SEPAY_BANK_CODE,
    amount: String(opts.amount),
    des: opts.description,
    template: 'compact',
  });
  return `https://qr.sepay.vn/img?${p.toString()}`;
}

/** Thông tin chuyển khoản thủ công — LUÔN hiện cạnh QR, không phải tuỳ chọn. */
export function transferInfo(env: Env, opts: { amount: number; description: string }) {
  return {
    bankName: env.SEPAY_BANK_NAME,
    bankCode: env.SEPAY_BANK_CODE,
    accountNo: env.SEPAY_ACCOUNT_NO,
    accountName: env.SEPAY_ACCOUNT_NAME,
    amount: opts.amount,
    description: opts.description,
    qrUrl: sepayQrUrl(env, opts),
  };
}
