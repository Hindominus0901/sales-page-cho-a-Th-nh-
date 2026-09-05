import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin } from '../../lib/auth/guards';
import { ictDate } from '../../lib/util/datetime';
import { rowsOf, firstOf } from '../../lib/db/batch';

export const adminDashboardRoutes = new Hono<HonoEnv>();
adminDashboardRoutes.use('/api/admin/*', requireAdmin);

/**
 * Dashboard trả lời ba câu hỏi vận hành, không phải trưng số cho đẹp:
 *   1. Phễu đang rò ở đâu?  → funnel theo ngày
 *   2. Nên gọi ai trước?    → đếm lead theo band Nóng/Ấm/Lạnh
 *   3. Có gì cần xử lý tay? → giao dịch chưa khớp, hoa hồng bị treo, đơn thừa tiền
 */
adminDashboardRoutes.get('/api/admin/stats', async (c) => {
  const days = Math.min(90, Math.max(7, Number(c.req.query('days') ?? 30)));
  const since = ictDate(Math.floor(Date.now() / 1000) - days * 86400);

  const batch = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT stat_date, page_key,
              SUM(views) views, SUM(leads) leads, SUM(orders) orders,
              SUM(paid_orders) paid_orders, SUM(revenue) revenue
       FROM daily_stats WHERE stat_date >= ? AND affiliate_id = ''
       GROUP BY stat_date, page_key ORDER BY stat_date`,
    ).bind(since),

    c.env.DB.prepare(
      `SELECT score_band, COUNT(*) n FROM leads
       WHERE status IN ('new','contacted','consulting') GROUP BY score_band`,
    ),

    c.env.DB.prepare(
      `SELECT source, COUNT(*) n, SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) won
       FROM leads GROUP BY source ORDER BY n DESC`,
    ),

    // Việc cần người xử lý — cái này quan trọng hơn mọi biểu đồ.
    c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM payments WHERE status IN ('unmatched','manual_review')) unmatched_payments,
        (SELECT COUNT(*) FROM orders WHERE status = 'overpaid')                        overpaid_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'partially_paid')                  partial_orders,
        (SELECT COUNT(*) FROM commissions WHERE status = 'held')                       held_commissions,
        (SELECT COUNT(*) FROM payouts WHERE status = 'requested')                      pending_payouts,
        (SELECT COUNT(*) FROM affiliates WHERE status = 'pending')                     pending_affiliates,
        (SELECT COUNT(*) FROM leads WHERE status = 'new' AND score_band = 'hot')        hot_uncontacted`,
    ),

    c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM leads)                                              leads,
        (SELECT COUNT(*) FROM students)                                           students,
        (SELECT COUNT(*) FROM orders WHERE status IN ('paid','overpaid'))         paid_orders,
        (SELECT COALESCE(SUM(amount_total),0) FROM orders WHERE status IN ('paid','overpaid')) revenue,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending')                    pending_orders,
        (SELECT COALESCE(SUM(amount),0) FROM commissions WHERE status IN ('pending','approved','payout_requested')) commission_owed`,
    ),

    c.env.DB.prepare(
      `SELECT id, code, full_name, phone, source, score, score_band, status, created_at
       FROM leads ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);

  // Số chỗ còn lại — con số anh Thành nhìn đầu tiên mỗi sáng.
  const product = await c.env.DB.prepare(
    `SELECT seats_total, seats_offset, start_date FROM products WHERE slug = 'thu-thach-21-ngay'`,
  ).first<{ seats_total: number | null; seats_offset: number; start_date: string | null }>();

  const t = firstOf<Record<string, number>>(batch, 4) ?? {};
  const seatsLeft = product?.seats_total == null
    ? null
    : Math.max(0, product.seats_total - (t.paid_orders ?? 0) - product.seats_offset);

  return c.json({
    ok: true,
    days,
    totals: { ...t, seatsLeft, seatsTotal: product?.seats_total ?? null, startDate: product?.start_date ?? null },
    todo: firstOf<Record<string, number>>(batch, 3) ?? {},
    funnel: rowsOf(batch, 0),
    bands: rowsOf(batch, 1),
    sources: rowsOf(batch, 2),
    recentLeads: rowsOf(batch, 5),
  });
});
