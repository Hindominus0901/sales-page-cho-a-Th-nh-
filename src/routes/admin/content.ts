import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, requireRole, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { uuid, accessToken } from '../../lib/util/id';
import { now, ictDate, ictDateTime, ICT_OFFSET_SEC } from '../../lib/util/datetime';

export const adminContentRoutes = new Hono<HonoEnv>();
adminContentRoutes.use('/api/admin/*', requireAdmin);

// ---------------------------------------------------------------- workshop

adminContentRoutes.get('/api/admin/workshops', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT w.*, (SELECT COUNT(*) FROM workshop_registrations WHERE session_id = w.id) registrations,
            (SELECT COUNT(*) FROM workshop_registrations WHERE session_id = w.id AND attended = 1) attended
     FROM workshop_sessions w ORDER BY w.starts_at DESC`,
  ).all();
  return c.json({ ok: true, workshops: rows.results ?? [] });
});

adminContentRoutes.post('/api/admin/workshops', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const b = await c.req.json<Record<string, string | number | null>>().catch(() => ({}) as Record<string, string | number | null>);
  const slug = String(b.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  const title = String(b.title ?? '').trim().slice(0, 200);
  const startsAt = Number(b.startsAt);
  if (!slug || !title || !Number.isFinite(startsAt)) {
    return c.json({ ok: false, error: 'Anh nhập đủ mã buổi, tiêu đề và thời gian bắt đầu.' }, 400);
  }

  const id = uuid();
  const ts = now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO workshop_sessions
         (id, slug, title, starts_at, duration_min, zoom_url, zoom_meeting_id, zoom_passcode,
          zalo_group_url, capacity, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'upcoming', ?,?)`,
    ).bind(id, slug, title, startsAt, Number(b.durationMin ?? 135),
      b.zoomUrl ?? null, b.zoomMeetingId ?? null, b.zoomPasscode ?? null,
      b.zaloGroupUrl ?? null, b.capacity ?? null, ts, ts).run();
  } catch (err) {
    if (String(err).includes('workshop_sessions.slug')) {
      return c.json({ ok: false, error: 'Mã buổi này đã tồn tại.' }, 409);
    }
    throw err;
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'workshop.create', entityType: 'workshop_session', entityId: id, after: { slug, title },
  });
  return c.json({ ok: true, id });
});

adminContentRoutes.patch('/api/admin/workshops/:id', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const b = await c.req.json<Record<string, string | number | null>>().catch(() => ({}) as Record<string, string | number | null>);

  const before = await c.env.DB.prepare(`SELECT * FROM workshop_sessions WHERE id = ?`).bind(id).first();
  if (!before) return c.json({ ok: false, error: 'Không tìm thấy buổi workshop.' }, 404);

  await c.env.DB.prepare(
    `UPDATE workshop_sessions SET
       title = COALESCE(?, title), starts_at = COALESCE(?, starts_at),
       zoom_url = COALESCE(?, zoom_url), zoom_meeting_id = COALESCE(?, zoom_meeting_id),
       zoom_passcode = COALESCE(?, zoom_passcode), zalo_group_url = COALESCE(?, zalo_group_url),
       capacity = COALESCE(?, capacity), status = COALESCE(?, status), updated_at = ?
     WHERE id = ?`,
  ).bind(b.title ?? null, b.startsAt ?? null, b.zoomUrl ?? null, b.zoomMeetingId ?? null,
    b.zoomPasscode ?? null, b.zaloGroupUrl ?? null, b.capacity ?? null, b.status ?? null,
    now(), id).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'workshop.update', entityType: 'workshop_session', entityId: id, before, after: b,
  });
  return c.json({ ok: true });
});

adminContentRoutes.get('/api/admin/workshops/:id/registrations', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.full_name, r.phone_norm, r.email_norm, r.attended, r.created_at,
            l.code AS lead_code, l.score, l.score_band, l.status AS lead_status,
            a.code AS affiliate_code
     FROM workshop_registrations r
     LEFT JOIN leads l ON l.id = r.lead_id
     LEFT JOIN affiliates a ON a.id = r.affiliate_id
     WHERE r.session_id = ? ORDER BY r.created_at DESC`,
  ).bind(c.req.param('id')).all<Record<string, unknown>>();
  return c.json({
    ok: true,
    registrations: (rows.results ?? []).map((r) => ({
      ...r,
      // Số lưu dạng 84xxxxxxxxx nhưng người dùng quen nhìn 0xxxxxxxxx.
      phone: '0' + String(r.phone_norm).slice(2),
      createdAtText: ictDateTime(r.created_at as number),
    })),
  });
});

adminContentRoutes.post('/api/admin/workshops/:id/attendance', async (c) => {
  const b = await c.req.json<{ registrationId?: string; attended?: boolean; minutes?: number }>()
    .catch(() => ({} as Record<string, never>));
  if (!b.registrationId) return c.json({ ok: false, error: 'Thiếu mã đăng ký.' }, 400);
  await c.env.DB.prepare(
    `UPDATE workshop_registrations SET attended = ?, attended_min = ? WHERE id = ? AND session_id = ?`,
  ).bind(b.attended ? 1 : 0, b.minutes ?? null, b.registrationId, c.req.param('id')).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- học viên

adminContentRoutes.get('/api/admin/students', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.full_name, s.phone, s.email, s.created_at,
            s.coin, s.xp, s.streak_current,
            e.id AS enrollment_id, e.cohort, e.status AS enrollment_status,
            e.progress_day, e.posts_done, e.access_token, e.last_seen_at,
            o.order_code, o.amount_total
     FROM students s
     LEFT JOIN enrollments e ON e.student_id = s.id
     LEFT JOIN orders o ON o.id = e.order_id
     ORDER BY s.created_at DESC LIMIT 300`,
  ).all();
  return c.json({ ok: true, students: rows.results ?? [] });
});

/**
 * Cấp lại link học viên. Mã cũ chết ngay lúc mã mới ghi đè — dùng khi học viên
 * lỡ đăng link vào nhóm chung, hoặc mất điện thoại.
 */
adminContentRoutes.post('/api/admin/enrollments/:id/cap-lai-link', async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const token = accessToken();

  const res = await c.env.DB.prepare(
    `UPDATE enrollments SET access_token = ?, token_created_at = ?, updated_at = ? WHERE id = ?`,
  ).bind(token, now(), now(), id).run();

  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ ok: false, error: 'Không tìm thấy học viên này.' }, 404);
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'enrollment.reissue_token', entityType: 'enrollment', entityId: id,
  });
  return c.json({ ok: true, token });
});

adminContentRoutes.patch('/api/admin/enrollments/:id', async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const b = await c.req.json<{ cohort?: string; status?: string; progressDay?: number; postsDone?: number }>()
    .catch(() => ({} as Record<string, never>));

  if (b.progressDay !== undefined && (b.progressDay < 0 || b.progressDay > 21)) {
    return c.json({ ok: false, error: 'Tiến độ phải nằm trong khoảng 0–21 ngày.' }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE enrollments SET cohort = COALESCE(?, cohort), status = COALESCE(?, status),
       progress_day = COALESCE(?, progress_day), posts_done = COALESCE(?, posts_done),
       completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END, updated_at = ?
     WHERE id = ?`,
  ).bind(b.cohort ?? null, b.status ?? null, b.progressDay ?? null, b.postsDone ?? null,
    b.status ?? '', now(), now(), id).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'enrollment.update', entityType: 'enrollment', entityId: id, after: b,
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- cài đặt

/**
 * Cài đặt vận hành sửa được trong CMS. Bí mật thật (khoá webhook, khoá ký
 * phiên) KHÔNG bao giờ nằm ở đây — chúng ở wrangler secret, nơi không đọc
 * ngược ra được kể cả khi lộ quyền admin.
 */
const EDITABLE_SETTINGS = new Set([
  'lead_magnet.download_url',
  'lead_magnet.zalo_group_url',
  'affiliate.payout_threshold',
  'commission.hold_days',
  'order.expires_hours',
  'contact.zalo',
  'contact.email',
]);

adminContentRoutes.get('/api/admin/settings', async (c) => {
  const rows = await c.env.DB.prepare(`SELECT key, value_json, updated_at FROM settings`).all<
    { key: string; value_json: string; updated_at: number }>();
  const product = await c.env.DB.prepare(
    `SELECT price, compare_at_price, seats_total, seats_offset, start_date, is_active
     FROM products WHERE slug = 'thu-thach-21-ngay'`,
  ).first();
  return c.json({
    ok: true,
    settings: rows.results ?? [],
    editableKeys: [...EDITABLE_SETTINGS],
    product,
    bank: {
      bankName: c.env.SEPAY_BANK_NAME,
      accountNo: c.env.SEPAY_ACCOUNT_NO,
      accountName: c.env.SEPAY_ACCOUNT_NAME,
      note: 'Thông tin ngân hàng đặt trong wrangler.jsonc, đổi ở đây không có tác dụng.',
    },
  });
});

adminContentRoutes.put('/api/admin/settings/:key', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const key = c.req.param('key');
  if (!EDITABLE_SETTINGS.has(key)) {
    return c.json({ ok: false, error: 'Khoá cài đặt này không sửa được từ trang quản trị.' }, 400);
  }
  const b = await c.req.json<{ value?: unknown }>().catch(() => ({} as { value?: unknown }));
  const before = await c.env.DB.prepare(`SELECT value_json FROM settings WHERE key = ?`).bind(key).first();

  await c.env.DB.prepare(
    `INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).bind(key, JSON.stringify(b.value ?? ''), admin.id, now()).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'setting.update', entityType: 'setting', entityId: key,
    before, after: { value: b.value },
  });
  return c.json({ ok: true });
});

adminContentRoutes.patch('/api/admin/product', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const b = await c.req.json<Record<string, string | number | null>>().catch(() => ({}) as Record<string, string | number | null>);
  const before = await c.env.DB.prepare(
    `SELECT price, seats_total, seats_offset, start_date FROM products WHERE slug = 'thu-thach-21-ngay'`,
  ).first();

  await c.env.DB.prepare(
    `UPDATE products SET price = COALESCE(?, price),
       compare_at_price = COALESCE(?, compare_at_price),
       seats_total = COALESCE(?, seats_total), seats_offset = COALESCE(?, seats_offset),
       start_date = COALESCE(?, start_date), is_active = COALESCE(?, is_active), updated_at = ?
     WHERE slug = 'thu-thach-21-ngay'`,
  ).bind(b.price ?? null, b.compareAtPrice ?? null, b.seatsTotal ?? null,
    b.seatsOffset ?? null, b.startDate ?? null, b.isActive ?? null, now()).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'product.update', entityType: 'product', entityId: 'thu-thach-21-ngay',
    before, after: b,
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- nhật ký

adminContentRoutes.get('/api/admin/audit', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, actor_type, actor_label, action, entity_type, entity_id,
            before_json, after_json, created_at
     FROM audit_log ORDER BY created_at DESC LIMIT 200`,
  ).all<Record<string, unknown>>();
  return c.json({
    ok: true,
    entries: (rows.results ?? []).map((r) => ({
      ...r, createdAtText: ictDateTime(r.created_at as number),
    })),
  });
});

// ---------------------------------------------------------------- lịch

/**
 * Lịch tháng: buổi workshop và ngày khai giảng.
 *
 * Nhận tháng dạng 'YYYY-MM' và trả về các sự kiện GẮN VỚI NGÀY GIỜ VIỆT NAM,
 * không phải UTC. Buổi 20h ngày 5 theo giờ Việt Nam là 13h ngày 5 UTC — nhưng
 * buổi 8h sáng ngày 1 lại là 1h sáng ngày 1 UTC, và một buổi 6h sáng sẽ rơi
 * sang ngày HÔM TRƯỚC nếu tính bằng UTC. Lịch mà đặt sự kiện sai ô ngày thì
 * còn tệ hơn không có lịch.
 *
 * Ngày khai giảng nằm ở products.start_date, đã là chuỗi 'YYYY-MM-DD' theo giờ
 * Việt Nam nên không phải quy đổi gì.
 */
adminContentRoutes.get('/api/admin/lich', async (c) => {
  const thang = String(c.req.query('thang') ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(thang)) {
    return c.json({ ok: false, error: 'Tham số "thang" phải dạng YYYY-MM.' }, 400);
  }

  // Khoảng unix bao trọn tháng theo giờ Việt Nam: từ 00:00 ngày 1 tới 00:00
  // ngày 1 tháng sau, cả hai quy về UTC bằng cách trừ đi 7 giờ.
  const [y, m] = thang.split('-').map(Number) as [number, number];
  const dau = Math.floor(Date.UTC(y, m - 1, 1) / 1000) - ICT_OFFSET_SEC;
  const cuoi = Math.floor(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000) - ICT_OFFSET_SEC;

  const ws = await c.env.DB.prepare(
    `SELECT w.id, w.slug, w.title, w.starts_at, w.duration_min, w.status,
            w.zoom_url, w.capacity,
            (SELECT COUNT(*) FROM workshop_registrations WHERE session_id = w.id) registrations
     FROM workshop_sessions w
     WHERE w.starts_at >= ? AND w.starts_at < ?
     ORDER BY w.starts_at`,
  ).bind(dau, cuoi).all<{
    id: string; slug: string; title: string; starts_at: number; duration_min: number;
    status: string; zoom_url: string | null; capacity: number | null; registrations: number;
  }>();

  interface SuKien {
    kind: 'workshop' | 'khai_giang';
    id: string; date: string; time: string; title: string; status: string;
    zoomUrl: string | null; registrations: number; capacity: number | null;
  }

  const events: SuKien[] = (ws.results ?? []).map((w) => ({
    kind: 'workshop',
    id: w.id,
    date: ictDate(w.starts_at),
    time: ictDateTime(w.starts_at).slice(0, 5),
    title: w.title,
    status: w.status,
    zoomUrl: w.zoom_url,
    registrations: w.registrations,
    capacity: w.capacity,
  }));

  const sp = await c.env.DB.prepare(
    `SELECT start_date FROM products WHERE slug = 'thu-thach-21-ngay'`,
  ).first<{ start_date: string | null }>();

  if (sp?.start_date && sp.start_date.startsWith(thang)) {
    events.push({
      kind: 'khai_giang',
      id: 'khai-giang',
      date: sp.start_date,
      time: '',
      title: 'Khai giảng Thử Thách 21 Ngày',
      status: 'upcoming',
      zoomUrl: null,
      registrations: 0,
      capacity: null,
    });
  }

  events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return c.json({ ok: true, thang, events });
});

// ---------------------------------------------------------------- hộp thư đi

/**
 * Hộp thư đi.
 *
 * Email hỏng mà không ai nhìn thấy thì bằng không có email: khách trả tiền,
 * thư không tới, và chuyện đó chỉ lộ ra khi họ nhắn Zalo hỏi. Màn hình này là
 * chỗ duy nhất nhìn được cả hàng đợi.
 *
 * 'skipped' KHÁC 'failed', và phân biệt được là quan trọng: 'skipped' nghĩa là
 * chưa đặt RESEND_API_KEY — tính năng chưa bật, không có gì hỏng. 'failed' mới
 * là có thứ cần sửa.
 */
adminContentRoutes.get('/api/admin/hop-thu', async (c) => {
  const trangThai = String(c.req.query('trang_thai') ?? '').trim();
  const hopLe = ['pending', 'sent', 'failed', 'skipped'];
  const loc = hopLe.includes(trangThai) ? trangThai : null;

  const rows = await c.env.DB.prepare(
    `SELECT id, to_email, to_name, subject, template, ref_type, ref_id,
            status, attempts, last_error, created_at, sent_at
     FROM email_outbox
     ${loc ? 'WHERE status = ?' : ''}
     ORDER BY created_at DESC LIMIT 200`,
  ).bind(...(loc ? [loc] : [])).all<Record<string, unknown>>();

  const dem = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM email_outbox GROUP BY status`,
  ).all<{ status: string; n: number }>();

  const tong: Record<string, number> = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of dem.results ?? []) tong[r.status] = r.n;

  return c.json({
    ok: true,
    tong,
    emails: (rows.results ?? []).map((r) => ({
      ...r,
      createdAtText: ictDateTime(r.created_at as number),
      sentAtText: r.sent_at ? ictDateTime(r.sent_at as number) : null,
    })),
  });
});

/**
 * Xếp lại một email để lượt gửi sau nhặt.
 *
 * KHÔNG gửi thẳng ở đây. Gửi thẳng thì màn hình treo chờ nhà cung cấp mail, và
 * nếu Resend chậm thì admin bấm lại lần nữa — thành hai email cho một người.
 * Đưa về 'pending' và để cron mỗi giờ lo, đúng đường mà mọi email khác đi.
 *
 * attempts đặt lại 0 vì đây là một quyết định mới của con người: bốn lần thử
 * trước đã hết lượt, người xem đã nhìn lý do lỗi và vẫn muốn thử lại.
 */
adminContentRoutes.post('/api/admin/hop-thu/:id/gui-lai', requireRole('owner', 'admin'), async (c) => {
  const id = c.req.param('id');
  const admin = adminUserOf(c);

  const row = await c.env.DB.prepare(
    `SELECT id, to_email, status FROM email_outbox WHERE id = ?`,
  ).bind(id).first<{ id: string; to_email: string; status: string }>();
  if (!row) return c.json({ ok: false, error: 'Không tìm thấy email này.' }, 404);
  if (row.status === 'sent') {
    return c.json({ ok: false, error: 'Email này đã gửi rồi — gửi lại là khách nhận hai lần.' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE email_outbox SET status = 'pending', attempts = 0, last_error = NULL WHERE id = ?`,
  ).bind(id).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'email.requeue', entityType: 'email_outbox', entityId: id,
    before: { status: row.status }, after: { status: 'pending', to: row.to_email },
  });

  return c.json({ ok: true });
});
