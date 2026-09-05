import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, requireRole, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { approveSubmission, adjustCoin, readMechanics } from '../../lib/game/award';
import { rankOf, parseTiers } from '../../lib/game/rank';
import { isStreakAlive } from '../../lib/game/streak';
import { uuid } from '../../lib/util/id';
import { now, ictDate, ictDateTime } from '../../lib/util/datetime';

export const adminGameRoutes = new Hono<HonoEnv>();
adminGameRoutes.use('/api/admin/*', requireAdmin);

async function tiers(env: HonoEnv['Bindings']) {
  const row = await env.DB.prepare(`SELECT value_json FROM settings WHERE key = 'rank.tiers'`)
    .first<{ value_json: string }>();
  return parseTiers(row?.value_json);
}

// ---------------------------------------------------------------- duyệt bài

adminGameRoutes.get('/api/admin/submissions', async (c) => {
  const status = c.req.query('status') ?? 'pending';
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.day, s.post_url, s.content, s.channel, s.status, s.feedback,
            s.is_late, s.coin_awarded, s.xp_awarded, s.created_at, s.reviewed_at,
            st.id AS student_id, st.full_name, st.phone, st.xp, st.coin,
            st.streak_current, st.last_submit_date,
            e.cohort, u.name AS reviewer_name
     FROM submissions s
     JOIN students st ON st.id = s.student_id
     LEFT JOIN enrollments e ON e.id = s.enrollment_id
     LEFT JOIN admin_users u ON u.id = s.reviewed_by
     ${status === 'all' ? '' : 'WHERE s.status = ?'}
     ORDER BY s.created_at ASC LIMIT 200`,
  ).bind(...(status === 'all' ? [] : [status])).all<Record<string, unknown>>();

  const list = await tiers(c.env);
  const today = ictDate();
  return c.json({
    ok: true,
    submissions: (rows.results ?? []).map((r) => ({
      ...r,
      createdAtText: ictDateTime(r.created_at as number),
      rank: rankOf(Number(r.xp ?? 0), list).tier,
      streakAlive: isStreakAlive((r.last_submit_date as string) ?? null, today),
    })),
    counts: await counts(c.env),
  });
});

async function counts(env: HonoEnv['Bindings']) {
  const row = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM submissions WHERE status='pending')     pending,
      (SELECT COUNT(*) FROM submissions WHERE status='approved')    approved,
      (SELECT COUNT(*) FROM submissions WHERE status='needs_work')  needs_work,
      (SELECT COUNT(*) FROM submissions
         WHERE status='approved' AND reviewed_at > unixepoch()-86400) approved_today`,
  ).first<Record<string, number>>();
  return row ?? {};
}

adminGameRoutes.post('/api/admin/submissions/:id/review', async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ action?: string; feedback?: string }>()
    .catch(() => ({} as { action?: string; feedback?: string }));
  const feedback = String(body.feedback ?? '').trim().slice(0, 4000) || null;

  if (body.action === 'approve') {
    const r = await approveSubmission(c.env, id, { id: admin.id, label: admin.email }, feedback);
    if (!r) return c.json({ ok: false, error: 'Không tìm thấy bài nộp.' }, 404);
    return c.json({
      ok: true, ...r,
      message: r.awarded
        ? `Đã duyệt, cộng ${r.coin} coin và ${r.xp} XP.${r.streakBroken ? ' Chuỗi ngày đã đứt, đếm lại từ 1.' : ''}`
        : 'Bài này đã được duyệt trước đó.',
    });
  }

  if (body.action === 'needs_work' || body.action === 'reject') {
    if (!feedback) {
      return c.json({
        ok: false,
        error: 'Anh viết nhận xét giúp em — học viên cần biết cần sửa chỗ nào.',
      }, 400);
    }
    const res = await c.env.DB.prepare(
      `UPDATE submissions SET status = ?, feedback = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    ).bind(body.action, feedback, admin.id, now(), now(), id).run();
    if ((res.meta.changes ?? 0) === 0) {
      return c.json({ ok: false, error: 'Bài này đã được xử lý rồi.' }, 400);
    }
    await audit(c.env, {
      actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
      action: 'submission.' + body.action, entityType: 'submission', entityId: id,
      after: { feedback },
    });
    return c.json({ ok: true, message: 'Đã gửi nhận xét cho học viên.' });
  }

  return c.json({ ok: false, error: 'Thao tác không hợp lệ.' }, 400);
});

// ---------------------------------------------------------------- xếp hạng

adminGameRoutes.get('/api/admin/leaderboard', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT st.id, st.full_name, st.phone, st.xp, st.coin,
            st.streak_current, st.streak_best, st.last_submit_date,
            e.cohort, e.progress_day, e.posts_done
     FROM students st LEFT JOIN enrollments e ON e.student_id = st.id
     ORDER BY st.xp DESC, st.streak_current DESC LIMIT 100`,
  ).all<Record<string, unknown>>();

  const list = await tiers(c.env);
  const today = ictDate();
  return c.json({
    ok: true,
    tiers: list,
    leaderboard: (rows.results ?? []).map((r, i) => ({
      ...r,
      position: i + 1,
      rank: rankOf(Number(r.xp ?? 0), list),
      streakAlive: isStreakAlive((r.last_submit_date as string) ?? null, today),
    })),
  });
});

/** Heatmap 8 tuần: số bài được duyệt mỗi ngày, cho cả hệ thống. */
adminGameRoutes.get('/api/admin/heatmap', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT date(created_at, 'unixepoch', '+7 hours') AS d, COUNT(*) AS n
     FROM submissions
     WHERE created_at > unixepoch() - 56*86400
     GROUP BY d ORDER BY d`,
  ).all<{ d: string; n: number }>();

  const byDay = new Map((rows.results ?? []).map((r) => [r.d, r.n]));
  const days: { date: string; n: number }[] = [];
  const todayMs = Date.parse(ictDate() + 'T00:00:00Z');
  for (let i = 55; i >= 0; i--) {
    const date = new Date(todayMs - i * 86400000).toISOString().slice(0, 10);
    days.push({ date, n: byDay.get(date) ?? 0 });
  }
  return c.json({ ok: true, days, max: Math.max(1, ...days.map((d) => d.n)) });
});

// ---------------------------------------------------------------- quà tặng

adminGameRoutes.get('/api/admin/rewards', async (c) => {
  const [rewards, redemptions] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM rewards ORDER BY sort_order, created_at`),
    c.env.DB.prepare(
      `SELECT r.*, st.full_name, st.phone, st.coin AS student_coin
       FROM reward_redemptions r JOIN students st ON st.id = r.student_id
       ORDER BY r.created_at DESC LIMIT 200`),
  ]);

  const list = await tiers(c.env);
  return c.json({
    ok: true,
    tiers: list,
    rewards: (rewards?.results ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return { ...row, minRankName: list[Number(row.min_rank ?? 0)]?.name ?? '—' };
    }),
    redemptions: (redemptions?.results ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return { ...row, createdAtText: ictDateTime(row.created_at as number) };
    }),
  });
});

adminGameRoutes.post('/api/admin/rewards', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const b = await c.req.json<Record<string, string | number | null>>()
    .catch(() => ({}) as Record<string, string | number | null>);
  const name = String(b.name ?? '').trim().slice(0, 160);
  const cost = Number(b.costCoin);
  if (!name || !Number.isFinite(cost) || cost < 0) {
    return c.json({ ok: false, error: 'Anh nhập tên quà và số coin hợp lệ giúp em.' }, 400);
  }
  const id = uuid();
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO rewards (id, name, description, cost_coin, min_rank, stock, is_active, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,1,?,?,?)`,
  ).bind(id, name, b.description ?? null, Math.round(cost),
    Number(b.minRank ?? 0), b.stock ?? null, Number(b.sortOrder ?? 0), ts, ts).run();

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'reward.create', entityType: 'reward', entityId: id, after: { name, cost },
  });
  return c.json({ ok: true, id });
});

adminGameRoutes.patch('/api/admin/rewards/:id', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const b = await c.req.json<Record<string, string | number | null>>()
    .catch(() => ({}) as Record<string, string | number | null>);
  await c.env.DB.prepare(
    `UPDATE rewards SET name = COALESCE(?, name), description = COALESCE(?, description),
       cost_coin = COALESCE(?, cost_coin), min_rank = COALESCE(?, min_rank),
       stock = COALESCE(?, stock), is_active = COALESCE(?, is_active), updated_at = ?
     WHERE id = ?`,
  ).bind(b.name ?? null, b.description ?? null, b.costCoin ?? null, b.minRank ?? null,
    b.stock ?? null, b.isActive ?? null, now(), id).run();
  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'reward.update', entityType: 'reward', entityId: id, after: b,
  });
  return c.json({ ok: true });
});

/**
 * Duyệt hoặc từ chối yêu cầu đổi quà.
 *
 * Coin đã bị trừ lúc học viên đặt đổi (giữ chỗ). Từ chối thì phải HOÀN LẠI —
 * nếu không, học viên mất coin mà không nhận được gì.
 */
adminGameRoutes.post('/api/admin/redemptions/:id/:action', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const action = c.req.param('action');
  const b = await c.req.json<{ note?: string }>().catch(() => ({} as { note?: string }));

  const r = await c.env.DB.prepare(
    `SELECT id, student_id, reward_id, reward_name, cost_coin, status FROM reward_redemptions WHERE id = ?`,
  ).bind(id).first<{ id: string; student_id: string; reward_id: string;
    reward_name: string; cost_coin: number; status: string }>();
  if (!r) return c.json({ ok: false, error: 'Không tìm thấy yêu cầu đổi quà.' }, 404);

  const allowed: Record<string, string[]> = {
    approve: ['requested'], fulfill: ['requested', 'approved'], reject: ['requested', 'approved'],
  };
  if (!allowed[action]?.includes(r.status)) {
    return c.json({ ok: false, error: `Yêu cầu này đang ở trạng thái "${r.status}", không làm được việc đó.` }, 400);
  }

  const target = action === 'approve' ? 'approved' : action === 'fulfill' ? 'fulfilled' : 'rejected';
  const ts = now();

  await c.env.DB.prepare(
    `UPDATE reward_redemptions SET status = ?, admin_note = COALESCE(?, admin_note),
       decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ? AND status = ?`,
  ).bind(target, b.note ?? null, admin.id, ts, ts, id, r.status).run();

  if (target === 'rejected') {
    await adjustCoin(c.env, r.student_id, r.cost_coin, 'refund',
      `Hoàn coin do từ chối đổi quà "${r.reward_name}"`, { id: admin.id, label: admin.email });
    // Trả lại một suất vào kho.
    await c.env.DB.prepare(
      `UPDATE rewards SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL`,
    ).bind(r.reward_id).run();
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'redemption.' + action, entityType: 'reward_redemption', entityId: id,
    before: { status: r.status }, after: { status: target },
  });
  return c.json({ ok: true, refunded: target === 'rejected' ? r.cost_coin : 0 });
});

// ---------------------------------------------------------------- cơ chế

adminGameRoutes.get('/api/admin/mechanics', async (c) => {
  return c.json({ ok: true, mechanics: await readMechanics(c.env), tiers: await tiers(c.env) });
});

adminGameRoutes.put('/api/admin/mechanics', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const b = await c.req.json<Record<string, unknown>>()
    .catch(() => ({}) as Record<string, unknown>);
  const map: Record<string, string> = {
    coinPerSubmission: 'coin.per_submission', coinPerContent: 'coin.per_content',
    coinPerCall: 'coin.per_call', streakBonusPct: 'coin.streak_bonus_pct',
    xpPerSubmission: 'xp.per_submission',
  };

  const stmts = [];
  for (const [field, key] of Object.entries(map)) {
    const v = Number(b[field]);
    if (!Number.isFinite(v) || v < 0) continue;
    stmts.push(c.env.DB.prepare(
      `INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(key, JSON.stringify(Math.round(v)), admin.id, now()));
  }
  if (Array.isArray(b.tiers) && b.tiers.length) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO settings (key, value_json, updated_by, updated_at) VALUES ('rank.tiers',?,?,?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(JSON.stringify(b.tiers), admin.id, now()));
  }
  if (stmts.length) await c.env.DB.batch(stmts);

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'mechanics.update', entityType: 'setting', after: b,
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- coin tay

adminGameRoutes.post('/api/admin/students/:id/coin', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const b = await c.req.json<{ delta?: number; note?: string }>()
    .catch(() => ({} as { delta?: number; note?: string }));
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return c.json({ ok: false, error: 'Anh nhập số coin cần cộng hoặc trừ giúp em.' }, 400);
  }
  await adjustCoin(c.env, c.req.param('id'), Math.round(delta), 'manual',
    String(b.note ?? '').slice(0, 300), { id: admin.id, label: admin.email });
  return c.json({ ok: true });
});

adminGameRoutes.get('/api/admin/students/:id/coin', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT l.delta, l.reason, l.note, l.created_at, u.name AS actor_name
     FROM coin_ledger l LEFT JOIN admin_users u ON u.id = l.actor_id
     WHERE l.student_id = ? ORDER BY l.created_at DESC LIMIT 100`,
  ).bind(c.req.param('id')).all<Record<string, unknown>>();
  return c.json({
    ok: true,
    ledger: (rows.results ?? []).map((r) => ({ ...r, createdAtText: ictDateTime(r.created_at as number) })),
  });
});
