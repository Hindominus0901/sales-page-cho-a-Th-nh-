import type { Env } from '../../types';
import { uuid, accessToken } from '../util/id';
import { now, daysFromNow } from '../util/datetime';
import { commissionOf } from '../util/money';
import { auditStmt } from '../db/audit';
import { bumpDailyStats } from '../db/events';
import { assessSelfReferral } from '../affiliate/self-referral';
import { orderPaidMail } from '../email/templates';
import { queueMailStmt } from '../email/outbox';

export interface OrderRow {
  id: string;
  order_code: string;
  product_id: string;
  lead_id: string | null;
  student_id: string | null;
  full_name: string;
  phone: string;
  phone_norm: string;
  email: string | null;
  email_norm: string | null;
  amount_total: number;
  amount_paid: number;
  discount: number;
  status: string;
  affiliate_id: string | null;
  paid_at: number | null;
  expires_at: number | null;
  created_at: number;
}

export interface ApplyPaymentResult {
  order: OrderRow;
  /** true khi đơn VỪA chuyển sang đã trả đủ trong lần gọi này. */
  justPaid: boolean;
  newStatus: string;
}

/**
 * Cộng một khoản tiền vào đơn và tính lại trạng thái, trong MỘT batch atomic.
 *
 * Trạng thái suy ra từ tổng đã trả so với số phải trả, chứ không phải từ việc
 * "có một giao dịch đúng số tiền": khách chuyển làm hai lần vẫn phải ra 'paid',
 * và chuyển thừa phải ra 'overpaid' để còn hoàn lại.
 */
export async function applyPayment(
  env: Env,
  order: OrderRow,
  paymentId: string,
  amount: number,
  matchMethod: 'auto_code' | 'auto_amount_phone' | 'manual',
  actor: { type: 'webhook' | 'admin'; id?: string | null; label?: string | null },
): Promise<ApplyPaymentResult> {
  const ts = now();
  const newPaid = order.amount_paid + amount;

  let newStatus: string;
  if (newPaid >= order.amount_total) {
    newStatus = newPaid > order.amount_total ? 'overpaid' : 'paid';
  } else {
    newStatus = 'partially_paid';
  }

  const justPaid = order.paid_at === null && newPaid >= order.amount_total;
  const paidAt = order.paid_at ?? (justPaid ? ts : null);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE payments SET order_id = ?, status = 'matched', match_method = ?,
         matched_code = ?, matched_by = ?, matched_at = ?
       WHERE id = ?`,
    ).bind(order.id, matchMethod, order.order_code, actor.id ?? null, ts, paymentId),

    env.DB.prepare(
      `UPDATE orders SET amount_paid = ?, status = ?, paid_at = ?, expires_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).bind(newPaid, newStatus, paidAt, ts, order.id),

    auditStmt(env, {
      actorType: actor.type, actorId: actor.id, actorLabel: actor.label,
      action: 'order.payment_applied', entityType: 'order', entityId: order.id,
      before: { amount_paid: order.amount_paid, status: order.status },
      after: { amount_paid: newPaid, status: newStatus, amount, match_method: matchMethod },
    }),
  ]);

  return {
    order: { ...order, amount_paid: newPaid, status: newStatus, paid_at: paidAt },
    justPaid,
    newStatus,
  };
}

/**
 * Hoàn tất đơn đã trả đủ: tạo học viên, ghi danh, đóng lead, sinh hoa hồng.
 *
 * ĐÂY LÀ ĐƯỜNG DUY NHẤT để hoàn tất một đơn — webhook tự động và thao tác gán
 * tay trong CMS đều gọi hàm này. Không có hai nhánh code fulfil song song, nên
 * không thể có chuyện gán tay quên tạo hoa hồng còn webhook thì có.
 *
 * An toàn khi chạy lại: `ux_enroll_order` và `ux_commissions_order` khiến lần
 * gọi thứ hai trở thành no-op. Webhook của SePay gửi lại bao nhiêu lần cũng
 * không sinh thêm ghi danh hay hoa hồng thứ hai.
 */
export async function fulfillOrder(
  env: Env,
  order: OrderRow,
  actor: { type: 'webhook' | 'admin' | 'system'; id?: string | null; label?: string | null },
): Promise<{ studentId: string; commissionId: string | null; commissionHeld: boolean }> {
  const ts = now();

  // 1. Học viên — khớp theo số điện thoại chuẩn hoá, một người một bản ghi.
  const existingStudent = await env.DB
    .prepare('SELECT id FROM students WHERE phone_norm = ? LIMIT 1')
    .bind(order.phone_norm)
    .first<{ id: string }>();

  const studentId = existingStudent?.id ?? uuid();
  const statements: D1PreparedStatement[] = [];

  if (existingStudent) {
    statements.push(env.DB.prepare(
      `UPDATE students SET full_name = ?, email = COALESCE(?, email),
         email_norm = COALESCE(?, email_norm), lead_id = COALESCE(?, lead_id), updated_at = ?
       WHERE id = ?`,
    ).bind(order.full_name, order.email, order.email_norm, order.lead_id, ts, studentId));
  } else {
    statements.push(env.DB.prepare(
      `INSERT INTO students (id, lead_id, full_name, phone, phone_norm, email, email_norm, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(studentId, order.lead_id, order.full_name, order.phone, order.phone_norm,
      order.email, order.email_norm, ts, ts));
  }

  // 2. Ghi danh — UNIQUE(order_id) làm lần chạy lại thành no-op.
  statements.push(env.DB.prepare(
    `INSERT INTO enrollments (id, student_id, product_id, order_id, status, started_at,
                              access_token, token_created_at, created_at, updated_at)
     VALUES (?,?,?,?, 'active', ?,?,?,?,?)
     ON CONFLICT(order_id) DO NOTHING`,
  ).bind(uuid(), studentId, order.product_id, order.id, ts, accessToken(), ts, ts, ts));

  statements.push(env.DB.prepare(
    `UPDATE orders SET student_id = ?, updated_at = ? WHERE id = ?`,
  ).bind(studentId, ts, order.id));

  if (order.lead_id) {
    statements.push(env.DB.prepare(
      `UPDATE leads SET status = 'won', updated_at = ? WHERE id = ? AND status != 'won'`,
    ).bind(ts, order.lead_id));
  }

  // 3. Hoa hồng.
  let commissionId: string | null = null;
  let commissionHeld = false;

  if (order.affiliate_id) {
    const verdict = await assessSelfReferral(env, order);
    if (verdict.decision !== 'reject') {
      const affiliate = await env.DB
        .prepare('SELECT commission_rate FROM affiliates WHERE id = ?')
        .bind(order.affiliate_id)
        .first<{ commission_rate: number }>();

      const rate = affiliate?.commission_rate ?? Number(env.AFFILIATE_DEFAULT_RATE_BP || 2000);
      const base = order.amount_total - order.discount;
      commissionId = uuid();
      commissionHeld = verdict.decision === 'hold';

      statements.push(env.DB.prepare(
        `INSERT INTO commissions
           (id, affiliate_id, order_id, lead_id, base_amount, rate, amount,
            status, hold_reason, available_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(order_id) DO NOTHING`,
      ).bind(
        commissionId, order.affiliate_id, order.id, order.lead_id, base, rate,
        commissionOf(base, rate),
        commissionHeld ? 'held' : 'pending',
        verdict.reason,
        daysFromNow(Number(env.COMMISSION_HOLD_DAYS || 7)),
        ts, ts,
      ));
    }
  }

  // Email xác nhận đi vào CHÍNH batch atomic này. Xếp hàng chứ không gửi: nhà
  // cung cấp email chậm hay lỗi thì webhook chậm hay lỗi theo, mà webhook lỗi
  // là SePay gửi lại — lỗi gửi mail hoá thành lỗi ghi nhận thanh toán.
  const mail = orderPaidMail(env, {
    id: order.id, code: order.order_code, name: order.full_name,
    email: order.email, amount: order.amount_total,
  });
  if (mail) statements.push(queueMailStmt(env, mail));

  statements.push(auditStmt(env, {
    actorType: actor.type, actorId: actor.id, actorLabel: actor.label,
    action: 'order.fulfilled', entityType: 'order', entityId: order.id,
    after: { studentId, commissionId, commissionHeld },
  }));

  await env.DB.batch(statements);

  await bumpDailyStats(env, 'sales_21d', order.affiliate_id, {
    paid_orders: 1,
    revenue: order.amount_total,
  });

  return { studentId, commissionId, commissionHeld };
}
