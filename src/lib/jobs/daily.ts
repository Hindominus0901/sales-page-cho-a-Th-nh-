import type { Env } from '../../types';
import { now } from '../util/datetime';
import { drainOutbox } from '../email/outbox';
import { audit } from '../db/audit';

/**
 * Việc chạy hằng đêm. Mỗi việc tự bọc try/catch: một việc hỏng không được
 * kéo theo các việc còn lại.
 */
export async function runDailyJobs(env: Env): Promise<void> {
  await safely('hết hạn đơn chờ', () => expireStaleOrders(env));
  await safely('tự duyệt hoa hồng', () => autoApproveCommissions(env));
  await safely('dọn phiên hết hạn', () => pruneSessions(env));
  // Lưới đỡ cho hộp thư đi. Việc gửi chính đã chạy ngay sau webhook; lượt này
  // nhặt những cái lúc đó lỗi, để một mail hỏng lúc 2h sáng không nằm im mãi.
  await safely('gửi lại email còn tồn', () => drainOutbox(env, 100));
}

async function safely(label: string, fn: () => Promise<unknown>): Promise<void> {
  try { await fn(); } catch (err) { console.error(`[cron] ${label} lỗi:`, err); }
}

/**
 * Đơn quá hạn mà chưa nhận được đồng nào thì chuyển sang 'expired'.
 *
 * KHÔNG xoá: khách chuyển khoản muộn vẫn phải khớp được vào đúng đơn, và
 * webhook vẫn nhận đơn ở trạng thái này (chỉ loại 'cancelled' và 'refunded').
 * Đơn đã nhận một phần cũng không đụng tới — tiền đã vào thì đơn còn sống.
 */
async function expireStaleOrders(env: Env): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'expired', updated_at = ?
     WHERE status = 'pending' AND amount_paid = 0
       AND expires_at IS NOT NULL AND expires_at < unixepoch()`,
  ).bind(now()).run();
  const n = res.meta.changes ?? 0;
  if (n > 0) console.log(`[cron] ${n} đơn hết hạn`);
}

/**
 * Hoa hồng qua cửa sổ hoàn tiền và không bị treo thì tự duyệt.
 * Hoa hồng 'held' KHÔNG bao giờ được tự duyệt — phải có người xem.
 */
async function autoApproveCommissions(env: Env): Promise<void> {
  const ts = now();
  const res = await env.DB.prepare(
    `UPDATE commissions SET status = 'approved', approved_at = ?, updated_at = ?
     WHERE status = 'pending' AND available_at <= ?`,
  ).bind(ts, ts, ts).run();

  const n = res.meta.changes ?? 0;
  if (n > 0) {
    console.log(`[cron] tự duyệt ${n} hoa hồng`);
    await audit(env, {
      actorType: 'system', action: 'commission.auto_approve',
      entityType: 'commission', after: { count: n },
    });
  }
}

async function pruneSessions(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE expires_at < unixepoch() - 86400`).run();
}
