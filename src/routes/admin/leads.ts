import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { uuid } from '../../lib/util/id';
import { now, ictDateTime } from '../../lib/util/datetime';
import { scoreLead, BAND_LABEL, SCORING_VERSION } from '../../lib/scoring/rules';

export const adminLeadRoutes = new Hono<HonoEnv>();
adminLeadRoutes.use('/api/admin/*', requireAdmin);

const PAGE_SIZE = 50;

/** Danh sách lead — lọc theo band, nguồn, trạng thái, CTV; tìm theo tên/SĐT/email. */
adminLeadRoutes.get('/api/admin/leads', async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const args: unknown[] = [];

  if (q.band)   { where.push('l.score_band = ?'); args.push(q.band); }
  if (q.source) { where.push('l.source = ?');     args.push(q.source); }
  if (q.status) { where.push('l.status = ?');     args.push(q.status); }
  if (q.affiliate) { where.push('l.affiliate_id = ?'); args.push(q.affiliate); }

  if (q.q) {
    const term = `%${q.q.trim().toLowerCase()}%`;
    // Tìm cả theo số điện thoại đã chuẩn hoá: gõ "0912..." vẫn ra dù DB lưu "84912...".
    const digits = q.q.replace(/\D/g, '');
    where.push(`(lower(l.full_name) LIKE ? OR lower(l.email) LIKE ? OR l.phone LIKE ?
                 OR l.phone_norm LIKE ? OR l.code = ?)`);
    args.push(term, term, `%${digits}%`, `%${digits}%`, q.q.trim().toUpperCase());
  }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const page = Math.max(1, Number(q.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT l.id, l.code, l.full_name, l.phone, l.email, l.source, l.score, l.score_band,
              l.status, l.created_at, l.last_contacted_at,
              a.code AS affiliate_code, u.name AS owner_name
       FROM leads l
       LEFT JOIN affiliates a ON a.id = l.affiliate_id
       LEFT JOIN admin_users u ON u.id = l.owner_admin_id
       ${clause}
       ORDER BY
         -- Lead nóng chưa ai gọi luôn nổi lên đầu, bất kể sắp xếp gì khác.
         CASE WHEN l.status = 'new' AND l.score_band = 'hot' THEN 0 ELSE 1 END,
         l.created_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    ).bind(...args),
    c.env.DB.prepare(`SELECT COUNT(*) n FROM leads l ${clause}`).bind(...args),
  ]);

  return c.json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    total: (total?.results[0] as { n: number } | undefined)?.n ?? 0,
    leads: rows?.results ?? [],
    bandLabels: BAND_LABEL,
  });
});

/** Chi tiết lead — kèm breakdown điểm, ghi chú, đơn hàng, đăng ký workshop. */
adminLeadRoutes.get('/api/admin/leads/:id', async (c) => {
  const id = c.req.param('id');
  const lead = await c.env.DB.prepare(
    `SELECT l.*, a.code AS affiliate_code, a.name AS affiliate_name, u.name AS owner_name
     FROM leads l
     LEFT JOIN affiliates a ON a.id = l.affiliate_id
     LEFT JOIN admin_users u ON u.id = l.owner_admin_id
     WHERE l.id = ?`,
  ).bind(id).first<Record<string, unknown>>();
  if (!lead) return c.json({ ok: false, error: 'Không tìm thấy lead.' }, 404);

  const [notes, orders, workshops] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT n.id, n.body, n.created_at, u.name AS admin_name
       FROM lead_notes n LEFT JOIN admin_users u ON u.id = n.admin_id
       WHERE n.lead_id = ? ORDER BY n.created_at DESC`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT order_code, amount_total, amount_paid, status, created_at, paid_at
       FROM orders WHERE lead_id = ? ORDER BY created_at DESC`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT w.title, w.starts_at, r.attended, r.created_at
       FROM workshop_registrations r JOIN workshop_sessions w ON w.id = r.session_id
       WHERE r.lead_id = ? ORDER BY r.created_at DESC`,
    ).bind(id),
  ]);

  return c.json({
    ok: true,
    lead: {
      ...lead,
      answers: safeJson(lead.answers_json),
      // Hiện thành danh sách đọc được: nếu anh Thành không hiểu con số từ đâu
      // ra thì sẽ bỏ qua nó.
      breakdown: safeJson(lead.score_breakdown),
      bandLabel: BAND_LABEL[lead.score_band as keyof typeof BAND_LABEL],
      createdAtText: ictDateTime(lead.created_at as number),
      scoringOutdated: (lead.scoring_version as number) !== SCORING_VERSION,
    },
    notes: notes?.results ?? [],
    orders: orders?.results ?? [],
    workshops: workshops?.results ?? [],
  });
});

adminLeadRoutes.patch('/api/admin/leads/:id', async (c) => {
  const id = c.req.param('id');
  const admin = adminUserOf(c);
  const body = await c.req.json<{ status?: string; ownerAdminId?: string | null; lostReason?: string }>()
    .catch(() => ({} as Record<string, never>));

  const before = await c.env.DB.prepare(
    `SELECT status, owner_admin_id, lost_reason FROM leads WHERE id = ?`,
  ).bind(id).first();
  if (!before) return c.json({ ok: false, error: 'Không tìm thấy lead.' }, 404);

  const allowed = ['new', 'contacted', 'consulting', 'won', 'lost', 'spam'];
  if (body.status && !allowed.includes(body.status)) {
    return c.json({ ok: false, error: 'Trạng thái không hợp lệ.' }, 400);
  }

  const ts = now();
  await c.env.DB.prepare(
    `UPDATE leads SET
       status = COALESCE(?, status),
       owner_admin_id = COALESCE(?, owner_admin_id),
       lost_reason = COALESCE(?, lost_reason),
       last_contacted_at = CASE WHEN ? IN ('contacted','consulting') THEN ? ELSE last_contacted_at END,
       updated_at = ?
     WHERE id = ?`,
  ).bind(body.status ?? null, body.ownerAdminId ?? null, body.lostReason ?? null,
    body.status ?? '', ts, ts, id).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'lead.update', entityType: 'lead', entityId: id,
    before, after: body,
  });
  return c.json({ ok: true });
});

adminLeadRoutes.post('/api/admin/leads/:id/notes', async (c) => {
  const id = c.req.param('id');
  const admin = adminUserOf(c);
  const body = await c.req.json<{ body?: string }>().catch(() => ({} as { body?: string }));
  const text = String(body.body ?? '').trim().slice(0, 4000);
  if (!text) return c.json({ ok: false, error: 'Ghi chú đang trống.' }, 400);

  await c.env.DB.prepare(
    `INSERT INTO lead_notes (id, lead_id, admin_id, body, created_at) VALUES (?,?,?,?,?)`,
  ).bind(uuid(), id, admin.id, text, now()).run();
  return c.json({ ok: true });
});

/**
 * Chấm lại điểm theo luật hiện hành. Dùng khi đổi bảng điểm — lead cũ vẫn giữ
 * scoring_version của nó cho tới khi được chấm lại có chủ đích.
 */
adminLeadRoutes.post('/api/admin/leads/rescore', async (c) => {
  const admin = adminUserOf(c);
  const rows = await c.env.DB.prepare(
    `SELECT id, answers_json, email, facebook_url, affiliate_id, phone_norm
     FROM leads WHERE scoring_version != ? LIMIT 500`,
  ).bind(SCORING_VERSION).all<{
    id: string; answers_json: string; email: string | null;
    facebook_url: string | null; affiliate_id: string | null; phone_norm: string;
  }>();

  let updated = 0;
  for (const row of rows.results ?? []) {
    const a = safeJson(row.answers_json) as Record<string, string | undefined>;
    const attended = await c.env.DB
      .prepare(`SELECT 1 FROM workshop_registrations WHERE phone_norm = ? LIMIT 1`)
      .bind(row.phone_norm).first();

    const s = scoreLead({
      budget: a.budget, timeline: a.timeline, dailyTime: a.daily_time,
      channel: a.channel, goal: a.goal,
      attendedWorkshop: Boolean(attended),
      viaAffiliate: Boolean(row.affiliate_id),
      phoneValid: Boolean(row.phone_norm),
      email: row.email, facebookUrl: row.facebook_url,
      freeText: [a.note, a.stuck, a.goal_text].filter((x): x is string => typeof x === 'string'),
    });

    await c.env.DB.prepare(
      `UPDATE leads SET score = ?, score_band = ?, score_breakdown = ?, scoring_version = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(s.score, s.band, JSON.stringify(s.breakdown), s.version, now(), row.id).run();
    updated++;
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'lead.rescore', entityType: 'lead', after: { updated, version: SCORING_VERSION },
  });
  return c.json({ ok: true, updated, version: SCORING_VERSION });
});

/** Xuất CSV — UTF-8 có BOM để Excel tiếng Việt mở không bị lỗi font. */
adminLeadRoutes.get('/api/admin/leads/export.csv', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT l.code, l.full_name, l.phone, l.email, l.source, l.score, l.score_band, l.status,
            l.created_at, a.code AS affiliate_code,
            l.utm_source, l.utm_medium, l.utm_campaign, l.answers_json
     FROM leads l LEFT JOIN affiliates a ON a.id = l.affiliate_id
     ORDER BY l.created_at DESC`,
  ).all<Record<string, unknown>>();

  const head = ['Mã', 'Họ tên', 'Điện thoại', 'Email', 'Nguồn', 'Điểm', 'Phân loại',
    'Trạng thái', 'Thời điểm', 'CTV giới thiệu', 'utm_source', 'utm_medium', 'utm_campaign',
    'Lĩnh vực', 'Đang mắc kẹt', 'Mục tiêu'];

  const lines = [head.join(',')];
  for (const r of rows.results ?? []) {
    const a = safeJson(r.answers_json) as Record<string, unknown>;
    lines.push([
      r.code, r.full_name, r.phone, r.email, r.source, r.score,
      BAND_LABEL[r.score_band as keyof typeof BAND_LABEL] ?? r.score_band,
      r.status, ictDateTime(r.created_at as number), r.affiliate_code,
      r.utm_source, r.utm_medium, r.utm_campaign,
      a.field, a.stuck ?? a.note, a.goal_text,
    ].map(csvCell).join(','));
  }

  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Chặn công thức: ô bắt đầu bằng = + - @ bị Excel coi là công thức.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function safeJson(v: unknown): unknown {
  try { return JSON.parse(String(v ?? '{}')); } catch { return {}; }
}
