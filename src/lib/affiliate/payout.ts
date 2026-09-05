import type { Env } from '../../types';
import { uuid } from '../util/id';
import { now, ictDate } from '../util/datetime';
import { auditStmt } from '../db/audit';

export interface PayoutRequestResult {
  ok: boolean;
  error?: string;
  payoutId?: string;
  payoutCode?: string;
  amount?: number;
  itemCount?: number;
}

/**
 * CTV yêu cầu rút tiền.
 *
 * Khoá hoa hồng và tạo đợt chi trong MỘT batch atomic. Hai request gửi cùng
 * lúc không thể cùng gom một hoa hồng: UPDATE có điều kiện `status='approved'`
 * nên request thứ hai không đổi được dòng nào, và UNIQUE(commission_id) trên
 * payout_items là chốt chặn cuối nếu vẫn lọt.
 */
export async function requestPayout(
  env: Env,
  affiliateId: string,
): Promise<PayoutRequestResult> {
  const aff = await env.DB.prepare(
    `SELECT id, name, payout_threshold, bank_name, bank_account_no, bank_account_name
     FROM affiliates WHERE id = ?`,
  ).bind(affiliateId).first<{
    id: string; name: string; payout_threshold: number;
    bank_name: string | null; bank_account_no: string | null; bank_account_name: string | null;
  }>();
  if (!aff) return { ok: false, error: 'Không tìm thấy tài khoản.' };

  if (!aff.bank_account_no || !aff.bank_account_name || !aff.bank_name) {
    return { ok: false, error: 'Anh chị điền thông tin tài khoản ngân hàng trước khi yêu cầu rút.' };
  }

  const eligible = await env.DB.prepare(
    `SELECT id, amount FROM commissions
     WHERE affiliate_id = ? AND status = 'approved'
     ORDER BY created_at`,
  ).bind(affiliateId).all<{ id: string; amount: number }>();

  const items = eligible.results ?? [];
  if (items.length === 0) {
    return { ok: false, error: 'Hiện chưa có hoa hồng nào đã duyệt để rút.' };
  }

  const amount = items.reduce((s, i) => s + i.amount, 0);
  if (amount < aff.payout_threshold) {
    return {
      ok: false,
      error: `Số dư đã duyệt (${amount.toLocaleString('vi-VN')}đ) chưa đạt mức tối thiểu `
        + `${aff.payout_threshold.toLocaleString('vi-VN')}đ.`,
    };
  }

  const payoutId = uuid();
  const payoutCode = await nextPayoutCode(env);
  const ts = now();

  const statements = [
    env.DB.prepare(
      `INSERT INTO payouts
         (id, payout_code, affiliate_id, amount, item_count, status,
          bank_name, bank_account_no, bank_account_name, requested_at, created_at, updated_at)
       VALUES (?,?,?,?,?, 'requested', ?,?,?,?,?,?)`,
    ).bind(payoutId, payoutCode, affiliateId, amount, items.length,
      aff.bank_name, aff.bank_account_no, aff.bank_account_name, ts, ts, ts),
  ];

  for (const item of items) {
    statements.push(env.DB.prepare(
      `INSERT INTO payout_items (payout_id, commission_id, amount) VALUES (?,?,?)`,
    ).bind(payoutId, item.id, item.amount));
    // Điều kiện status='approved' là thứ khiến hai yêu cầu đồng thời không
    // cùng gom được một hoa hồng.
    statements.push(env.DB.prepare(
      `UPDATE commissions SET status = 'payout_requested', payout_id = ?, updated_at = ?
       WHERE id = ? AND status = 'approved'`,
    ).bind(payoutId, ts, item.id));
  }

  statements.push(auditStmt(env, {
    actorType: 'affiliate', actorId: affiliateId, actorLabel: aff.name,
    action: 'payout.request', entityType: 'payout', entityId: payoutId,
    after: { payoutCode, amount, itemCount: items.length },
  }));

  await env.DB.batch(statements);
  return { ok: true, payoutId, payoutCode, amount, itemCount: items.length };
}

/** 'PO-2026-0007' — dễ đọc khi đối chiếu sao kê ngân hàng. */
async function nextPayoutCode(env: Env): Promise<string> {
  const year = ictDate().slice(0, 4);
  const row = await env.DB.prepare(
    `SELECT COUNT(*) n FROM payouts WHERE payout_code LIKE ?`,
  ).bind(`PO-${year}-%`).first<{ n: number }>();
  return `PO-${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

export const PAYOUT_LABEL: Record<string, string> = {
  requested: 'Chờ duyệt',
  approved:  'Đã duyệt, chờ chuyển tiền',
  paid:      'Đã chuyển',
  rejected:  'Bị từ chối',
  cancelled: 'Đã huỷ',
};
