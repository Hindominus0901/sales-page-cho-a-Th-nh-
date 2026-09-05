import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, requireRole, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { applyPayment, fulfillOrder, type OrderRow } from '../../lib/payments/fulfill';
import { now, ictDateTime } from '../../lib/util/datetime';

export const adminOrderRoutes = new Hono<HonoEnv>();
adminOrderRoutes.use('/api/admin/*', requireAdmin);

adminOrderRoutes.get('/api/admin/orders', async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.status) { where.push('o.status = ?'); args.push(q.status); }
  if (q.q) {
    const digits = q.q.replace(/\D/g, '');
    where.push(`(o.order_code = ? OR lower(o.full_name) LIKE ? OR o.phone_norm LIKE ?)`);
    args.push(q.q.trim().toUpperCase(), `%${q.q.trim().toLowerCase()}%`, `%${digits}%`);
  }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.order_code, o.full_name, o.phone, o.email, o.amount_total, o.amount_paid,
            o.status, o.created_at, o.paid_at, a.code AS affiliate_code
     FROM orders o LEFT JOIN affiliates a ON a.id = o.affiliate_id
     ${clause} ORDER BY o.created_at DESC LIMIT 200`,
  ).bind(...args).all();

  return c.json({ ok: true, orders: rows.results ?? [] });
});

adminOrderRoutes.get('/api/admin/orders/:code', async (c) => {
  const order = await c.env.DB.prepare(
    `SELECT o.*, a.code AS affiliate_code FROM orders o
     LEFT JOIN affiliates a ON a.id = o.affiliate_id WHERE o.order_code = ?`,
  ).bind(c.req.param('code').toUpperCase()).first<Record<string, unknown>>();
  if (!order) return c.json({ ok: false, error: 'Không tìm thấy đơn.' }, 404);

  const payments = await c.env.DB.prepare(
    `SELECT provider_tx_id, amount, direction, status, match_method, content,
            transaction_date, created_at
     FROM payments WHERE order_id = ? ORDER BY created_at`,
  ).bind(order.id).all();

  return c.json({ ok: true, order, payments: payments.results ?? [] });
});

adminOrderRoutes.post('/api/admin/orders/:code/cancel', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const code = c.req.param('code').toUpperCase();
  const order = await c.env.DB.prepare(`SELECT id, status FROM orders WHERE order_code = ?`)
    .bind(code).first<{ id: string; status: string }>();
  if (!order) return c.json({ ok: false, error: 'Không tìm thấy đơn.' }, 404);
  if (order.status === 'paid' || order.status === 'overpaid') {
    return c.json({ ok: false, error: 'Đơn đã thanh toán — dùng luồng hoàn tiền, không huỷ.' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`,
  ).bind(now(), now(), order.id).run();
  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'order.cancel', entityType: 'order', entityId: order.id, before: order,
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- giao dịch

/**
 * Giao dịch chưa khớp — màn hình quan trọng nhất khi có sự cố. Mỗi dòng ở đây
 * là một khách đã chuyển tiền mà hệ thống chưa nhận ra, nên phải xử lý được
 * trong một cú bấm.
 */
adminOrderRoutes.get('/api/admin/payments/unmatched', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, provider_tx_id, amount, content, transaction_date, status, created_at
     FROM payments WHERE status IN ('unmatched','manual_review')
     ORDER BY created_at DESC LIMIT 200`,
  ).all<{ amount: number; content: string | null; created_at: number }>();

  // Gợi ý đơn khớp theo số tiền để admin không phải tự dò.
  const suggestions = await c.env.DB.prepare(
    `SELECT order_code, full_name, phone, amount_total, amount_paid, created_at
     FROM orders WHERE status IN ('pending','partially_paid','expired')
     ORDER BY created_at DESC LIMIT 100`,
  ).all();

  return c.json({
    ok: true,
    payments: (rows.results ?? []).map((r) => ({ ...r, createdAtText: ictDateTime(r.created_at) })),
    candidateOrders: suggestions.results ?? [],
  });
});

/**
 * Gán tay một giao dịch vào đơn.
 *
 * Chạy đúng cùng applyPayment + fulfillOrder mà webhook dùng — không có nhánh
 * fulfil song song, nên gán tay không thể quên tạo học viên hay hoa hồng.
 */
adminOrderRoutes.post('/api/admin/payments/:id/assign', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const paymentId = c.req.param('id');
  const body = await c.req.json<{ orderCode?: string }>().catch(() => ({} as { orderCode?: string }));
  const code = String(body.orderCode ?? '').trim().toUpperCase();
  if (!code) return c.json({ ok: false, error: 'Anh chọn đơn cần gán giúp em.' }, 400);

  const payment = await c.env.DB.prepare(
    `SELECT id, amount, direction, status, order_id FROM payments WHERE id = ?`,
  ).bind(paymentId).first<{ id: string; amount: number; direction: string; status: string; order_id: string | null }>();
  if (!payment) return c.json({ ok: false, error: 'Không tìm thấy giao dịch.' }, 404);
  if (payment.order_id) return c.json({ ok: false, error: 'Giao dịch này đã được gán vào một đơn khác.' }, 400);
  if (payment.direction !== 'in') return c.json({ ok: false, error: 'Đây là giao dịch tiền ra.' }, 400);

  const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE order_code = ?`)
    .bind(code).first<OrderRow>();
  if (!order) return c.json({ ok: false, error: 'Không tìm thấy đơn với mã này.' }, 404);

  const applied = await applyPayment(
    c.env, order, payment.id, payment.amount, 'manual',
    { type: 'admin', id: admin.id, label: admin.email },
  );
  if (applied.justPaid) {
    await fulfillOrder(c.env, applied.order, { type: 'admin', id: admin.id, label: admin.email });
  }

  return c.json({
    ok: true,
    order: { code: order.order_code, status: applied.newStatus, amountPaid: applied.order.amount_paid },
    fulfilled: applied.justPaid,
  });
});

/** Bỏ qua một giao dịch không liên quan (tiền của việc khác chuyển nhầm vào). */
adminOrderRoutes.post('/api/admin/payments/:id/ignore', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE payments SET status = 'ignored', matched_by = ?, matched_at = ?
     WHERE id = ? AND order_id IS NULL`,
  ).bind(admin.id, now(), id).run();
  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'payment.ignore', entityType: 'payment', entityId: id,
  });
  return c.json({ ok: true });
});
