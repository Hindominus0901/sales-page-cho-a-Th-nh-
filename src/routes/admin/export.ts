import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, requireRole, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { ictDateTime, ictDate } from '../../lib/util/datetime';

/**
 * Xuất dữ liệu ra file.
 *
 * Ba lý do đây không phải tính năng phụ:
 *
 * Đối soát. Cuối tháng anh Thành cần đặt bảng đơn hàng cạnh sao kê ngân hàng.
 * Trước đây chỉ Lead xuất được, còn Đơn hàng thì không — mà Đơn hàng mới là cái
 * dính tới tiền.
 *
 * Quyền sở hữu dữ liệu. Toàn bộ khách hàng, học viên, hoa hồng của anh Thành
 * nằm trong một cơ sở dữ liệu mà anh ấy không mở được bằng tay. Một nút tải về
 * là ranh giới giữa "dữ liệu của tôi" và "dữ liệu bị khoá trong hệ thống của
 * người khác".
 *
 * Sao lưu. D1 có bản sao của Cloudflare, nhưng một bản JSON tải về máy là thứ
 * duy nhất sống sót qua việc xoá nhầm hoặc mất tài khoản.
 */
export const adminExportRoutes = new Hono<HonoEnv>();
adminExportRoutes.use('/api/admin/*', requireAdmin);

/** Ô CSV an toàn: chặn công thức Excel và thoát dấu nháy kép. */
function o(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Ô bắt đầu bằng = + - @ bị Excel coi là công thức — thêm nháy đơn để chặn.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** BOM UTF-8 để Excel tiếng Việt mở không lỗi font; CRLF cho đúng nếp Windows. */
function csv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(o).join(',')).join('\r\n') + '\r\n';
}

function tepCsv(ten: string, noiDung: string): Response {
  return new Response(noiDung, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${ten}-${ictDate()}.csv"`,
      'cache-control': 'no-store',
    },
  });
}

const TRANG_THAI_DON: Record<string, string> = {
  pending: 'Chờ chuyển khoản', partially_paid: 'Chuyển thiếu', paid: 'Đã thanh toán',
  overpaid: 'Chuyển thừa', expired: 'Hết hạn', cancelled: 'Đã huỷ', refunded: 'Đã hoàn tiền',
};

/**
 * Đơn hàng — bảng để đối soát với sao kê ngân hàng.
 *
 * Đăng ký TRƯỚC mọi route có tham số đường dẫn ở file này. Bài học từ
 * `/api/admin/leads/export.csv`: nó nằm sau `/api/admin/leads/:id` nên Hono
 * nuốt nó thành :id và tính năng chưa bao giờ chạy được cho bất kỳ ai.
 */
adminExportRoutes.get('/api/admin/xuat/don-hang.csv', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const rows = await c.env.DB.prepare(
    `SELECT o.order_code, o.full_name, o.phone, o.email, o.status,
            o.amount_total, o.amount_paid, o.created_at, o.paid_at,
            a.code AS affiliate_code, p.name AS product_name, e.cohort
     FROM orders o
     LEFT JOIN affiliates a ON a.id = o.affiliate_id
     LEFT JOIN products p ON p.id = o.product_id
     LEFT JOIN enrollments e ON e.order_id = o.id
     ORDER BY o.created_at DESC`,
  ).all<Record<string, unknown>>();

  const bang: unknown[][] = [[
    'Mã đơn', 'Họ tên', 'Điện thoại', 'Email', 'Trạng thái',
    'Học phí', 'Đã nhận', 'Còn thiếu', 'Ngày tạo', 'Ngày thanh toán',
    'CTV giới thiệu', 'Khoá học', 'Sản phẩm',
  ]];

  for (const r of rows.results ?? []) {
    const tong = Number(r.amount_total ?? 0);
    const daTra = Number(r.amount_paid ?? 0);
    bang.push([
      r.order_code, r.full_name, r.phone, r.email,
      TRANG_THAI_DON[String(r.status)] ?? r.status,
      tong, daTra, Math.max(0, tong - daTra),
      ictDateTime(Number(r.created_at)),
      r.paid_at ? ictDateTime(Number(r.paid_at)) : '',
      r.affiliate_code, r.cohort, r.product_name,
    ]);
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'export.orders', entityType: 'order', entityId: null,
    after: { soDong: (rows.results ?? []).length },
  });

  return tepCsv('don-hang', csv(bang));
});

/** Học viên — tiến độ 21 ngày, coin, XP. KHÔNG kèm mã vào lớp. */
adminExportRoutes.get('/api/admin/xuat/hoc-vien.csv', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const rows = await c.env.DB.prepare(
    `SELECT s.full_name, s.phone, s.email, s.coin, s.xp,
            s.streak_current, s.streak_best, s.last_submit_date,
            e.cohort, e.status, e.posts_done, e.started_at, e.last_seen_at,
            o.order_code
     FROM students s
     LEFT JOIN enrollments e ON e.student_id = s.id
     LEFT JOIN orders o ON o.id = e.order_id
     ORDER BY s.created_at DESC`,
  ).all<Record<string, unknown>>();

  const bang: unknown[][] = [[
    'Họ tên', 'Điện thoại', 'Email', 'Khoá', 'Trạng thái',
    'Bài đã duyệt', 'Coin', 'XP', 'Chuỗi hiện tại', 'Chuỗi dài nhất',
    'Nộp bài lần cuối', 'Mở lớp lần cuối', 'Vào lớp từ', 'Mã đơn',
  ]];

  for (const r of rows.results ?? []) {
    bang.push([
      r.full_name, r.phone, r.email, r.cohort,
      r.status === 'active' ? 'Đang học' : r.status === 'completed' ? 'Hoàn thành' : r.status,
      r.posts_done, r.coin, r.xp, r.streak_current, r.streak_best,
      r.last_submit_date,
      r.last_seen_at ? ictDateTime(Number(r.last_seen_at)) : 'chưa mở lần nào',
      r.started_at ? ictDateTime(Number(r.started_at)) : '',
      r.order_code,
    ]);
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'export.students', entityType: 'student', entityId: null,
    after: { soDong: (rows.results ?? []).length },
  });

  return tepCsv('hoc-vien', csv(bang));
});

/** Hoa hồng — bảng để chốt tiền với cộng tác viên. */
adminExportRoutes.get('/api/admin/xuat/hoa-hong.csv', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const rows = await c.env.DB.prepare(
    `SELECT a.code AS affiliate_code, a.name AS affiliate_name, a.email,
            a.bank_name, a.bank_account_no, a.bank_account_name,
            c.amount, c.status, c.hold_reason, c.created_at, c.approved_at,
            o.order_code, o.full_name AS buyer
     FROM commissions c
     JOIN affiliates a ON a.id = c.affiliate_id
     LEFT JOIN orders o ON o.id = c.order_id
     ORDER BY c.created_at DESC`,
  ).all<Record<string, unknown>>();

  const bang: unknown[][] = [[
    'Mã CTV', 'Tên CTV', 'Email CTV', 'Ngân hàng', 'Số tài khoản', 'Chủ tài khoản',
    'Hoa hồng', 'Trạng thái', 'Lý do treo', 'Mã đơn', 'Khách mua', 'Ngày phát sinh', 'Ngày duyệt',
  ]];

  for (const r of rows.results ?? []) {
    bang.push([
      r.affiliate_code, r.affiliate_name, r.email,
      r.bank_name, r.bank_account_no, r.bank_account_name,
      r.amount, r.status, r.hold_reason, r.order_code, r.buyer,
      ictDateTime(Number(r.created_at)),
      r.approved_at ? ictDateTime(Number(r.approved_at)) : '',
    ]);
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'export.commissions', entityType: 'commission', entityId: null,
    after: { soDong: (rows.results ?? []).length },
  });

  return tepCsv('hoa-hong', csv(bang));
});

/**
 * Sao lưu toàn bộ, dạng JSON.
 *
 * Chỉ chủ hệ thống. Đây là bản sao đầy đủ của mọi thứ trong hệ, kể cả thông tin
 * ngân hàng của cộng tác viên — không phải thứ để một tài khoản quản trị bất kỳ
 * tải về.
 *
 * KHÔNG kèm bảng `sessions`, `password_resets` và cột `password_hash`: chúng là
 * chìa khoá, không phải dữ liệu. Một file sao lưu nằm trong thư mục Tải về mà
 * chứa chìa khoá là chỗ hở tệ hơn thứ nó bảo vệ. `enrollments.access_token`
 * cũng vậy — mã vào lớp cấp lại được, không cần sao lưu.
 */
adminExportRoutes.get('/api/admin/xuat/sao-luu.json', requireRole('owner'), async (c) => {
  const admin = adminUserOf(c);

  const bang: [string, string][] = [
    ['products', 'SELECT * FROM products'],
    ['leads', 'SELECT * FROM leads'],
    ['orders', 'SELECT * FROM orders'],
    ['payments', 'SELECT * FROM payments'],
    ['students', 'SELECT id, lead_id, full_name, phone, phone_norm, email, email_norm, '
      + 'coin, xp, streak_current, streak_best, last_submit_date, created_at FROM students'],
    ['enrollments', 'SELECT id, student_id, product_id, order_id, cohort, status, '
      + 'started_at, completed_at, progress_day, posts_done, created_at FROM enrollments'],
    ['submissions', 'SELECT * FROM submissions'],
    ['submission_reviews', 'SELECT * FROM submission_reviews'],
    ['challenge_days', 'SELECT * FROM challenge_days'],
    ['rewards', 'SELECT * FROM rewards'],
    ['reward_redemptions', 'SELECT * FROM reward_redemptions'],
    ['coin_ledger', 'SELECT * FROM coin_ledger'],
    ['affiliates', 'SELECT id, code, name, email, phone, status, commission_rate, '
      + 'bank_name, bank_account_no, bank_account_name, notes, created_at FROM affiliates'],
    ['commissions', 'SELECT * FROM commissions'],
    ['payouts', 'SELECT * FROM payouts'],
    ['workshop_sessions', 'SELECT * FROM workshop_sessions'],
    ['workshop_registrations', 'SELECT * FROM workshop_registrations'],
    ['settings', 'SELECT * FROM settings'],
    ['page_content', 'SELECT * FROM page_content'],
  ];

  const duLieu: Record<string, unknown[]> = {};
  for (const [ten, sql] of bang) {
    try {
      const r = await c.env.DB.prepare(sql).all<Record<string, unknown>>();
      duLieu[ten] = r.results ?? [];
    } catch (err) {
      // Một bảng chưa tồn tại (migration chưa chạy) không được làm hỏng cả bản
      // sao lưu — ghi lại lý do rồi đi tiếp.
      duLieu[ten] = [];
      console.error(`[sao-luu] bỏ qua bảng ${ten}:`, err);
    }
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'export.backup', entityType: 'system', entityId: null,
  });

  return new Response(JSON.stringify({
    xuatLuc: ictDateTime(Math.floor(Date.now() / 1000)),
    boiVi: admin.email,
    ghiChu: 'KHÔNG chứa mật khẩu, phiên đăng nhập hay mã vào lớp — chúng là chìa '
      + 'khoá, không phải dữ liệu. Giữ file này cẩn thận: nó có số điện thoại và '
      + 'thông tin ngân hàng của cộng tác viên.',
    duLieu,
  }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="sao-luu-goc-creator-${ictDate()}.json"`,
      'cache-control': 'no-store',
    },
  });
});
