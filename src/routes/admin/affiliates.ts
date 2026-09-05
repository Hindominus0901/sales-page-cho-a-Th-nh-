import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, requireRole, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { transitionCommission, transitionCommissions, COMMISSION_LABEL, HOLD_REASON_LABEL } from '../../lib/affiliate/commission';
import { PAYOUT_LABEL } from '../../lib/affiliate/payout';
import { uuid, randomToken } from '../../lib/util/id';
import { now, ictDateTime } from '../../lib/util/datetime';
import { hashPassword } from '../../lib/security/hash';
import { toPhoneNorm } from '../../lib/validation/phone';

export const adminAffiliateRoutes = new Hono<HonoEnv>();
adminAffiliateRoutes.use('/api/admin/*', requireAdmin);

adminAffiliateRoutes.get('/api/admin/affiliates', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.code, a.name, a.email, a.phone, a.status, a.commission_rate,
            a.bank_name, a.bank_account_no, a.bank_account_name, a.created_at,
            (SELECT COUNT(*) FROM affiliate_clicks WHERE affiliate_id = a.id) clicks,
            (SELECT COUNT(*) FROM leads WHERE affiliate_id = a.id)            leads,
            (SELECT COUNT(*) FROM orders WHERE affiliate_id = a.id
               AND status IN ('paid','overpaid'))                             paid_orders,
            (SELECT COALESCE(SUM(amount),0) FROM commissions
               WHERE affiliate_id = a.id AND status = 'paid')                 paid_amount,
            (SELECT COALESCE(SUM(amount),0) FROM commissions
               WHERE affiliate_id = a.id
                 AND status IN ('pending','held','approved','payout_requested')) owed_amount
     FROM affiliates a ORDER BY a.created_at DESC`,
  ).all();
  return c.json({ ok: true, affiliates: rows.results ?? [] });
});

/** Tạo CTV. Trả mật khẩu tạm MỘT LẦN — không lưu bản rõ ở đâu cả. */
adminAffiliateRoutes.post('/api/admin/affiliates', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const body = await c.req.json<{
    code?: string; name?: string; email?: string; phone?: string; commissionRate?: number;
  }>().catch(() => ({} as Record<string, never>));

  const code = String(body.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  const name = String(body.name ?? '').trim().slice(0, 120);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 160);

  if (code.length < 3) return c.json({ ok: false, error: 'Mã giới thiệu cần ít nhất 3 ký tự chữ và số.' }, 400);
  if (name.length < 2) return c.json({ ok: false, error: 'Anh nhập tên cộng tác viên giúp em.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return c.json({ ok: false, error: 'Email không hợp lệ.' }, 400);

  const rate = Number.isFinite(body.commissionRate)
    ? Math.max(0, Math.min(10000, Number(body.commissionRate)))
    : Number(c.env.AFFILIATE_DEFAULT_RATE_BP || 2000);

  const tempPassword = randomToken(9);
  const id = uuid();
  const ts = now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO affiliates
         (id, code, name, email, email_norm, phone, phone_norm, password_hash,
          status, commission_rate, approved_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'active', ?,?,?,?)`,
    ).bind(id, code, name, email, email, body.phone ?? null, toPhoneNorm(body.phone) || null,
      await hashPassword(tempPassword), rate, ts, ts, ts).run();
  } catch (err) {
    // D1 báo tên CỘT vi phạm ("affiliates.code"), không phải tên index — bắt
    // theo tên index thì câu lỗi rơi xuống 500 và admin không hiểu vì sao.
    const msg = String(err);
    if (msg.includes('affiliates.code')) {
      return c.json({ ok: false, error: 'Mã giới thiệu này đã có người dùng.' }, 409);
    }
    if (msg.includes('affiliates.email_norm')) {
      return c.json({ ok: false, error: 'Email này đã được đăng ký.' }, 409);
    }
    throw err;
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'affiliate.create', entityType: 'affiliate', entityId: id,
    after: { code, name, email, rate },
  });

  return c.json({
    ok: true,
    affiliate: { id, code, name, email, commissionRate: rate },
    // Hiện một lần duy nhất; hệ thống không lưu bản rõ nên không xem lại được.
    tempPassword,
    note: 'Mật khẩu tạm chỉ hiện một lần. Anh gửi cho CTV và nhắc họ đổi ngay.',
  });
});

adminAffiliateRoutes.patch('/api/admin/affiliates/:id', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string; commissionRate?: number; notes?: string }>()
    .catch(() => ({} as Record<string, never>));

  const before = await c.env.DB.prepare(
    `SELECT status, commission_rate FROM affiliates WHERE id = ?`,
  ).bind(id).first();
  if (!before) return c.json({ ok: false, error: 'Không tìm thấy cộng tác viên.' }, 404);

  const allowed = ['pending', 'active', 'suspended', 'rejected'];
  if (body.status && !allowed.includes(body.status)) {
    return c.json({ ok: false, error: 'Trạng thái không hợp lệ.' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE affiliates SET
       status = COALESCE(?, status),
       commission_rate = COALESCE(?, commission_rate),
       notes = COALESCE(?, notes),
       approved_at = CASE WHEN ? = 'active' AND approved_at IS NULL THEN ? ELSE approved_at END,
       updated_at = ?
     WHERE id = ?`,
  ).bind(body.status ?? null, body.commissionRate ?? null, body.notes ?? null,
    body.status ?? '', now(), now(), id).run();

  // Khoá tài khoản thì cắt luôn mọi phiên đang mở, không chờ hết hạn.
  if (body.status === 'suspended' || body.status === 'rejected') {
    await c.env.DB.prepare(
      `UPDATE sessions SET revoked_at = ? WHERE subject_type = 'affiliate' AND subject_id = ? AND revoked_at IS NULL`,
    ).bind(now(), id).run();
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'affiliate.update', entityType: 'affiliate', entityId: id, before, after: body,
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- hoa hồng

adminAffiliateRoutes.get('/api/admin/commissions', async (c) => {
  const status = c.req.query('status');
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.amount, c.base_amount, c.rate, c.status, c.hold_reason,
            c.available_at, c.created_at, c.approved_at, c.paid_at,
            a.code AS affiliate_code, a.name AS affiliate_name,
            o.order_code, o.full_name AS buyer_name, o.phone AS buyer_phone
     FROM commissions c
     JOIN affiliates a ON a.id = c.affiliate_id
     JOIN orders o ON o.id = c.order_id
     ${status ? 'WHERE c.status = ?' : ''}
     ORDER BY c.created_at DESC LIMIT 300`,
  ).bind(...(status ? [status] : [])).all<Record<string, unknown>>();

  return c.json({
    ok: true,
    commissions: (rows.results ?? []).map((r) => ({
      ...r,
      statusLabel: COMMISSION_LABEL[r.status as keyof typeof COMMISSION_LABEL],
      holdReasonLabel: r.hold_reason ? HOLD_REASON_LABEL[r.hold_reason as string] ?? r.hold_reason : null,
      availableAtText: ictDateTime(r.available_at as number),
    })),
    labels: COMMISSION_LABEL,
  });
});

adminAffiliateRoutes.post('/api/admin/commissions/:id/:action', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const action = c.req.param('action');
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));

  const target = ({
    approve: 'approved', hold: 'held', release: 'pending', reject: 'rejected', void: 'void',
  } as const)[action];
  if (!target) return c.json({ ok: false, error: 'Thao tác không hợp lệ.' }, 400);

  const res = await transitionCommission(c.env, id, target,
    { type: 'admin', id: admin.id, label: admin.email }, { reason: body.reason });
  return res.ok ? c.json({ ok: true }) : c.json({ ok: false, error: res.error }, 400);
});

// ---------------------------------------------------------------- chi trả

adminAffiliateRoutes.get('/api/admin/payouts', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.*, a.code AS affiliate_code, a.name AS affiliate_name
     FROM payouts p JOIN affiliates a ON a.id = p.affiliate_id
     ORDER BY p.requested_at DESC LIMIT 200`,
  ).all<Record<string, unknown>>();
  return c.json({
    ok: true,
    payouts: (rows.results ?? []).map((r) => ({
      ...r,
      statusLabel: PAYOUT_LABEL[r.status as string],
      requestedAtText: ictDateTime(r.requested_at as number),
    })),
  });
});

adminAffiliateRoutes.get('/api/admin/payouts/:id', async (c) => {
  const id = c.req.param('id');
  const payout = await c.env.DB.prepare(
    `SELECT p.*, a.code AS affiliate_code, a.name AS affiliate_name
     FROM payouts p JOIN affiliates a ON a.id = p.affiliate_id WHERE p.id = ?`,
  ).bind(id).first();
  if (!payout) return c.json({ ok: false, error: 'Không tìm thấy đợt chi.' }, 404);

  const items = await c.env.DB.prepare(
    `SELECT i.amount, c.status, o.order_code, o.full_name AS buyer_name, c.created_at
     FROM payout_items i
     JOIN commissions c ON c.id = i.commission_id
     JOIN orders o ON o.id = c.order_id
     WHERE i.payout_id = ? ORDER BY c.created_at`,
  ).bind(id).all();

  return c.json({ ok: true, payout, items: items.results ?? [] });
});

/**
 * Duyệt / từ chối / đánh dấu đã chi.
 *
 * "Đã chi" đòi mã giao dịch ngân hàng: đây là lần cuối tiền đổi chủ, phải có
 * thứ đối chiếu được với sao kê nếu về sau CTV nói chưa nhận được.
 */
adminAffiliateRoutes.post('/api/admin/payouts/:id/:action', requireRole('owner', 'admin'), async (c) => {
  const admin = adminUserOf(c);
  const id = c.req.param('id');
  const action = c.req.param('action');
  const body = await c.req.json<{ reference?: string; reason?: string }>()
    .catch(() => ({} as Record<string, never>));

  const payout = await c.env.DB.prepare(`SELECT id, status, affiliate_id, amount FROM payouts WHERE id = ?`)
    .bind(id).first<{ id: string; status: string; affiliate_id: string; amount: number }>();
  if (!payout) return c.json({ ok: false, error: 'Không tìm thấy đợt chi.' }, 404);

  const items = await c.env.DB.prepare(`SELECT commission_id FROM payout_items WHERE payout_id = ?`)
    .bind(id).all<{ commission_id: string }>();
  const commissionIds = (items.results ?? []).map((r) => r.commission_id);
  const ts = now();

  if (action === 'approve') {
    if (payout.status !== 'requested') return c.json({ ok: false, error: 'Đợt chi này không ở trạng thái chờ duyệt.' }, 400);
    await c.env.DB.prepare(
      `UPDATE payouts SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?`,
    ).bind(ts, admin.id, ts, id).run();

  } else if (action === 'paid') {
    if (payout.status !== 'approved') return c.json({ ok: false, error: 'Anh duyệt đợt chi trước khi đánh dấu đã chuyển.' }, 400);
    const reference = String(body.reference ?? '').trim().slice(0, 120);
    if (!reference) {
      return c.json({
        ok: false,
        error: 'Anh nhập mã giao dịch ngân hàng giúp em — cần để đối chiếu sao kê về sau.',
      }, 400);
    }
    await c.env.DB.prepare(
      `UPDATE payouts SET status = 'paid', paid_at = ?, paid_by = ?, payment_reference = ?, updated_at = ? WHERE id = ?`,
    ).bind(ts, admin.id, reference, ts, id).run();
    await transitionCommissions(c.env, commissionIds, 'paid',
      { type: 'admin', id: admin.id, label: admin.email });

  } else if (action === 'reject') {
    if (payout.status === 'paid') return c.json({ ok: false, error: 'Đợt chi đã chuyển tiền, không từ chối được.' }, 400);
    await c.env.DB.prepare(
      `UPDATE payouts SET status = 'rejected', rejected_reason = ?, updated_at = ? WHERE id = ?`,
    ).bind(String(body.reason ?? '').slice(0, 500), ts, id).run();
    // Trả hoa hồng về 'approved' để CTV yêu cầu lại được — không đánh mất tiền của họ.
    await transitionCommissions(c.env, commissionIds, 'approved',
      { type: 'admin', id: admin.id, label: admin.email });
    await c.env.DB.prepare(`DELETE FROM payout_items WHERE payout_id = ?`).bind(id).run();

  } else {
    return c.json({ ok: false, error: 'Thao tác không hợp lệ.' }, 400);
  }

  await audit(c.env, {
    actorType: 'admin', actorId: admin.id, actorLabel: admin.email,
    action: 'payout.' + action, entityType: 'payout', entityId: id,
    before: { status: payout.status }, after: { action, amount: payout.amount, ...body },
  });
  return c.json({ ok: true });
});
