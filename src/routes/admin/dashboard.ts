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
        (SELECT COUNT(*) FROM leads WHERE status = 'new' AND score_band = 'hot')        hot_uncontacted,
        (SELECT COUNT(*) FROM submissions WHERE status = 'pending')                     pending_submissions,
        (SELECT COUNT(*) FROM reward_redemptions WHERE status = 'requested')            pending_redemptions,
        -- Học viên đang tụt lại.
        --
        -- Đây là việc quan trọng nhất của người vận hành lớp, và trước đây hệ
        -- thống mù hoàn toàn: dữ liệu (last_submit_date, posts_done) có sẵn,
        -- không ai đọc. Đến ngày 9 có chừng chục người đã ngừng nộp, mà con số
        -- "bài chờ duyệt" lại GIẢM đi nên trông càng nhẹ nhàng — anh Thành phát
        -- hiện vào cuối khoá, khi không cứu được ai nữa.
        (SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id = e.student_id
          WHERE e.status = 'active'
            AND e.started_at <= unixepoch()
            AND (st.last_submit_date IS NULL
                 OR st.last_submit_date < date('now','+7 hours','-3 days')))      hoc_vien_tut_lai`,
    ),

    c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM leads)                                              leads,
        (SELECT COUNT(*) FROM students)                                           students,
        (SELECT COUNT(*) FROM orders WHERE status IN ('paid','overpaid'))         paid_orders,
        (SELECT COALESCE(SUM(amount_total),0) FROM orders WHERE status IN ('paid','overpaid')) revenue,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending')                    pending_orders,
        (SELECT COALESCE(SUM(amount),0) FROM commissions WHERE status IN ('pending','approved','payout_requested')) commission_owed,
        -- "Hôm nay" = ngày lịch Việt Nam, không phải 24 giờ trượt.
        --
        -- Với 24 giờ trượt, anh Thành duyệt bài lúc 22h thứ Hai thì 9h sáng thứ
        -- Ba con số vẫn đang tính cả mẻ tối qua — anh tưởng sáng nay đã làm rồi.
        -- Đến 23h thứ Ba nó tự tụt về 0 dù anh chưa động vào gì.
        (SELECT COUNT(*) FROM submissions WHERE status = 'approved'
           AND date(reviewed_at,'unixepoch','+7 hours') = date('now','+7 hours'))       approved_today,
        (SELECT COUNT(DISTINCT student_id) FROM submissions
           WHERE date(created_at,'unixepoch','+7 hours') = date('now','+7 hours'))      active_today,
        -- Hôm nay là ngày thứ mấy của khoá, và bao nhiêu người đã nộp.
        (SELECT COUNT(*) FROM enrollments WHERE status = 'active')                      dang_hoc,
        (SELECT COUNT(DISTINCT s.student_id) FROM submissions s
           JOIN enrollments e ON e.id = s.enrollment_id
          WHERE e.status = 'active'
            AND date(s.created_at,'unixepoch','+7 hours') = date('now','+7 hours'))     da_nop_hom_nay`,
    ),

    c.env.DB.prepare(
      `SELECT id, code, full_name, phone, source, score, score_band, status, created_at
       FROM leads ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);

  /**
   * Số chỗ còn lại — con số anh Thành nhìn đầu tiên mỗi sáng.
   *
   * Đếm đơn TỪ MỐC MỞ KHOÁ HIỆN TẠI, không phải từ đầu lịch sử. Trước đây nó
   * trừ COUNT(*) toàn bộ đơn đã trả tiền, nên ngày mở bán khoá 2 là 30 đơn của
   * khoá 1 đã ăn hết 30 chỗ của khoá 2 và trang bán báo "hết chỗ" ngay hôm đầu.
   * Chưa đặt mốc thì giữ nguyên nếp cũ — đếm tất, đúng cho khoá đầu tiên.
   */
  const product = await c.env.DB.prepare(
    `SELECT seats_total, seats_offset, start_date, cohort_hien_tai, cohort_khai_giang,
            cohort_bat_dau_tu
     FROM products WHERE slug = 'thu-thach-21-ngay'`,
  ).first<{
    seats_total: number | null; seats_offset: number; start_date: string | null;
    cohort_hien_tai: string | null; cohort_khai_giang: string | null;
    cohort_bat_dau_tu: number | null;
  }>();

  /**
   * Hôm nay là ngày thứ mấy của khoá.
   *
   * Dashboard trước đây không trả lời được câu này, dù nó là câu đầu tiên người
   * quản lớp cần biết mỗi sáng. start_date có được đọc, nhưng chỉ để in chuỗi
   * ngày cạnh số chỗ còn lại.
   */
  const ngayKhaiGiang = product?.cohort_khai_giang ?? product?.start_date ?? null;
  const ngayThu = ngayKhaiGiang
    ? Math.floor(
      (Date.now() / 1000 - Date.parse(`${ngayKhaiGiang}T00:00:00+07:00`) / 1000) / 86400) + 1
    : null;

  const t = firstOf<Record<string, number>>(batch, 4) ?? {};

  const daBanKhoaNay = product?.cohort_bat_dau_tu
    ? (await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM orders
       WHERE status IN ('paid','overpaid') AND paid_at >= ?`,
    ).bind(product.cohort_bat_dau_tu).first<{ n: number }>())?.n ?? 0
    : (t.paid_orders ?? 0);

  const seatsLeft = product?.seats_total == null
    ? null
    : Math.max(0, product.seats_total - daBanKhoaNay - product.seats_offset);

  return c.json({
    ok: true,
    days,
    totals: {
      ...t, seatsLeft,
      seatsTotal: product?.seats_total ?? null,
      startDate: product?.start_date ?? null,
      cohort: product?.cohort_hien_tai ?? null,
      daBanKhoaNay,
      ngayKhaiGiang,
      // null khi chưa đặt ngày; ngoài 1..21 nghĩa là chưa khai giảng hoặc đã xong.
      ngayThu: ngayThu !== null && ngayThu >= 1 && ngayThu <= 21 ? ngayThu : null,
      ngayThuTho: ngayThu,
    },
    todo: firstOf<Record<string, number>>(batch, 3) ?? {},
    funnel: rowsOf(batch, 0),
    bands: rowsOf(batch, 1),
    sources: rowsOf(batch, 2),
    recentLeads: rowsOf(batch, 5),
  });
});
