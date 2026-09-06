import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAffiliate, affiliateOf, loginLockedOut, loginFailed, loginSucceeded }
  from '../../lib/auth/guards';
import { createSession, clearCookie, readSession, revokeSession, csrfToken, COOKIE_AFF }
  from '../../lib/auth/session';
import { verifyPassword, hashPassword, hashIp } from '../../lib/security/hash';
import { requestPayout, PAYOUT_LABEL } from '../../lib/affiliate/payout';
import { COMMISSION_LABEL, HOLD_REASON_LABEL } from '../../lib/affiliate/commission';
import { audit } from '../../lib/db/audit';
import { now, ictDateTime } from '../../lib/util/datetime';
import { toPhoneNorm } from '../../lib/validation/phone';
import { capPhieu } from '../../lib/auth/password-reset';
import { passwordResetMail } from '../../lib/email/templates';
import { queueMail, drainOutbox } from '../../lib/email/outbox';
import { rateLimit } from '../../lib/security/ratelimit';

export const affiliateRoutes = new Hono<HonoEnv>();

affiliateRoutes.post('/api/aff/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
    .catch(() => ({} as { email?: string; password?: string }));
  const emailNorm = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!emailNorm || !password) return c.json({ ok: false, error: 'Anh chị nhập đủ email và mật khẩu giúp em.' }, 400);
  const throttleKey = 'aff:' + emailNorm;
  if (await loginLockedOut(c.env, throttleKey)) {
    return c.json({ ok: false, error: 'Sai quá nhiều lần. Anh chị thử lại sau 15 phút.' }, 429);
  }

  const aff = await c.env.DB.prepare(
    `SELECT id, code, name, email, status, password_hash FROM affiliates WHERE email_norm = ?`,
  ).bind(emailNorm).first<{
    id: string; code: string; name: string; email: string; status: string; password_hash: string | null;
  }>();

  const invalid = async () => {
    await loginFailed(c.env, throttleKey);
    return c.json({ ok: false, error: 'Email hoặc mật khẩu không đúng.' }, 401);
  };
  if (!aff || !aff.password_hash) return invalid();
  if (!await verifyPassword(password, aff.password_hash)) return invalid();
  if (aff.status !== 'active') {
    return c.json({
      ok: false,
      error: aff.status === 'pending'
        ? 'Tài khoản đang chờ duyệt. Bên Thành sẽ liên hệ với anh chị.'
        : 'Tài khoản đang tạm ngưng. Anh chị nhắn Zalo để được hỗ trợ.',
    }, 403);
  }

  await loginSucceeded(c.env, throttleKey);
  const { cookie } = await createSession(c.env, 'affiliate', aff.id, c.req.raw);
  // Lưu IP lần đăng nhập để phát hiện CTV tự mua qua link của chính mình.
  await c.env.DB.prepare(`UPDATE affiliates SET last_login_at = ?, last_login_ip_hash = ? WHERE id = ?`)
    .bind(now(), await hashIp(c.env, c.req.header('cf-connecting-ip') ?? null), aff.id).run();

  c.header('set-cookie', cookie);
  return c.json({ ok: true, affiliate: { id: aff.id, code: aff.code, name: aff.name, email: aff.email } });
});

affiliateRoutes.post('/api/aff/logout', async (c) => {
  const session = await readSession(c.env, c.req.raw, 'affiliate');
  if (session) await revokeSession(c.env, session.id);
  c.header('set-cookie', clearCookie(COOKIE_AFF, new URL(c.req.url).protocol === 'https:'));
  return c.json({ ok: true });
});

/**
 * CTV xin đặt lại mật khẩu.
 *
 * Nằm TRƯỚC khối use() bên dưới và có tên trong danh sách công khai của nó —
 * người quên mật khẩu thì đúng là chưa đăng nhập được.
 *
 * Cùng câu trả lời cho mọi trường hợp, kể cả email không có tài khoản: khác
 * nhau là biến trang này thành công cụ dò xem ai đang làm CTV cho Góc Creator.
 */
affiliateRoutes.post('/api/aff/quen-mat-khau', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  type Body = { email?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  const emailNorm = String(body.email ?? '').trim().toLowerCase();

  const cauTraLoi = { ok: true, message: 'Nếu email này có tài khoản, em đã gửi hướng dẫn tới đó.' };

  const limited = await rateLimit(c.env, `reset:${ip}`, 10, 3600);
  if (!limited.ok || !emailNorm) return c.json(cauTraLoi);

  // CTV chưa được duyệt cũng không cấp phiếu: họ chưa có mật khẩu để đặt lại,
  // và gửi thư "đặt lại mật khẩu" cho người chưa có tài khoản là khó hiểu.
  const aff = await c.env.DB.prepare(
    `SELECT id, name, email FROM affiliates
     WHERE email_norm = ? AND status = 'active' AND password_hash IS NOT NULL`,
  ).bind(emailNorm).first<{ id: string; name: string; email: string }>();
  if (!aff) return c.json(cauTraLoi);

  const phieu = await capPhieu(c.env, 'affiliate', aff.id, aff.email, c.req.header('cf-connecting-ip') ?? null);
  if (!phieu) return c.json(cauTraLoi);

  await queueMail(c.env, passwordResetMail(c.env, {
    resetId: phieu.resetId, token: phieu.token, subjectType: 'affiliate',
    email: aff.email, name: aff.name,
  }));
  c.executionCtx.waitUntil(drainOutbox(c.env).catch((err) => console.error('[email] lượt gửi lỗi', err)));

  await audit(c.env, {
    actorType: 'system', actorId: null, actorLabel: aff.email,
    action: 'affiliate.reset_requested', entityType: 'affiliate', entityId: aff.id,
  });

  return c.json(cauTraLoi);
});

affiliateRoutes.use('/api/aff/*', async (c, next) => {
  // Hai route trên là công khai; phần còn lại bắt buộc đăng nhập.
  const path = new URL(c.req.url).pathname;
  const congKhai = ['/api/aff/login', '/api/aff/logout', '/api/aff/quen-mat-khau'];
  if (congKhai.includes(path)) return next();
  return requireAffiliate(c, next);
});

affiliateRoutes.get('/api/aff/me', async (c) => {
  const aff = affiliateOf(c);
  const session = await readSession(c.env, c.req.raw, 'affiliate');
  const row = await c.env.DB.prepare(
    `SELECT bank_name, bank_account_no, bank_account_name, payout_threshold, phone
     FROM affiliates WHERE id = ?`,
  ).bind(aff.id).first();
  return c.json({
    ok: true,
    affiliate: { ...aff, ...row, ratePercent: aff.commission_rate / 100 },
    csrfToken: session ? await csrfToken(session) : null,
    baseUrl: c.env.PUBLIC_BASE_URL,
  });
});

/** Bảng điều khiển CTV — chỉ số của riêng họ, không nhìn thấy của ai khác. */
affiliateRoutes.get('/api/aff/stats', async (c) => {
  const aff = affiliateOf(c);
  const [totals, byStatus, recentOrders, clicks] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM affiliate_clicks WHERE affiliate_id = ?1) clicks,
        (SELECT COUNT(*) FROM leads WHERE affiliate_id = ?1)            leads,
        (SELECT COUNT(*) FROM orders WHERE affiliate_id = ?1)           orders,
        (SELECT COUNT(*) FROM orders WHERE affiliate_id = ?1
           AND status IN ('paid','overpaid'))                           paid_orders,
        (SELECT COALESCE(SUM(amount),0) FROM commissions
           WHERE affiliate_id = ?1 AND status = 'paid')                 paid_amount,
        (SELECT COALESCE(SUM(amount),0) FROM commissions
           WHERE affiliate_id = ?1 AND status = 'approved')             available_amount,
        (SELECT COALESCE(SUM(amount),0) FROM commissions
           WHERE affiliate_id = ?1 AND status IN ('pending','held'))    pending_amount`,
    ).bind(aff.id),
    c.env.DB.prepare(
      `SELECT status, COUNT(*) n, COALESCE(SUM(amount),0) total
       FROM commissions WHERE affiliate_id = ? GROUP BY status`,
    ).bind(aff.id),
    c.env.DB.prepare(
      `SELECT o.order_code, o.status, o.amount_total, o.created_at, o.paid_at,
              c.amount AS commission_amount, c.status AS commission_status, c.hold_reason,
              -- Không lộ số điện thoại và email đầy đủ của khách cho CTV.
              substr(o.full_name, 1, 1) || '***' AS buyer_masked
       FROM orders o LEFT JOIN commissions c ON c.order_id = o.id
       WHERE o.affiliate_id = ? ORDER BY o.created_at DESC LIMIT 50`,
    ).bind(aff.id),
    c.env.DB.prepare(
      `SELECT click_date, COUNT(*) n FROM affiliate_clicks
       WHERE affiliate_id = ? GROUP BY click_date ORDER BY click_date DESC LIMIT 30`,
    ).bind(aff.id),
  ]);

  return c.json({
    ok: true,
    totals: totals?.results[0] ?? {},
    byStatus: byStatus?.results ?? [],
    orders: (recentOrders?.results ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        ...row,
        commissionStatusLabel: row.commission_status
          ? COMMISSION_LABEL[row.commission_status as keyof typeof COMMISSION_LABEL] : null,
        holdReasonLabel: row.hold_reason
          ? HOLD_REASON_LABEL[row.hold_reason as string] ?? row.hold_reason : null,
      };
    }),
    clicksByDay: clicks?.results ?? [],
    labels: COMMISSION_LABEL,
  });
});

/** Link giới thiệu cho từng trang. */
affiliateRoutes.get('/api/aff/links', (c) => {
  const aff = affiliateOf(c);
  const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return c.json({
    ok: true,
    code: aff.code,
    links: [
      { label: 'Trang bán Thử thách 21 ngày', url: `${base}/?ref=${aff.code}` },
      { label: 'Workshop miễn phí',           url: `${base}/workshop?ref=${aff.code}` },
      { label: 'Bản Đồ 21 Ngày (tài liệu 0đ)', url: `${base}/ban-do-21-ngay?ref=${aff.code}` },
      { label: 'Link rút gọn',                url: `${base}/r/${aff.code}` },
    ],
    note: 'Hoa hồng tính theo lần chạm ĐẦU TIÊN, giữ trong 90 ngày. Khách bấm link của anh '
      + 'chị trước thì dù sau đó có bấm link người khác, hoa hồng vẫn thuộc về anh chị.',
  });
});

affiliateRoutes.patch('/api/aff/bank', async (c) => {
  const aff = affiliateOf(c);
  const body = await c.req.json<{ bankName?: string; accountNo?: string; accountName?: string; phone?: string }>()
    .catch(() => ({} as Record<string, never>));

  const bankName = String(body.bankName ?? '').trim().slice(0, 80);
  const accountNo = String(body.accountNo ?? '').replace(/\s/g, '').slice(0, 40);
  const accountName = String(body.accountName ?? '').trim().toUpperCase().slice(0, 120);
  if (!bankName || !accountNo || !accountName) {
    return c.json({ ok: false, error: 'Anh chị điền đủ tên ngân hàng, số tài khoản và tên chủ tài khoản.' }, 400);
  }

  const before = await c.env.DB.prepare(
    `SELECT bank_name, bank_account_no, bank_account_name FROM affiliates WHERE id = ?`,
  ).bind(aff.id).first();

  await c.env.DB.prepare(
    `UPDATE affiliates SET bank_name = ?, bank_account_no = ?, bank_account_name = ?,
       phone = COALESCE(?, phone), phone_norm = COALESCE(?, phone_norm), updated_at = ?
     WHERE id = ?`,
  ).bind(bankName, accountNo, accountName, body.phone ?? null,
    body.phone ? toPhoneNorm(body.phone) : null, now(), aff.id).run();

  // Đổi tài khoản nhận tiền là việc đáng ghi lại: nếu về sau có tranh chấp
  // "tiền chuyển nhầm đâu", đây là thứ truy được.
  await audit(c.env, {
    actorType: 'affiliate', actorId: aff.id, actorLabel: aff.code,
    action: 'affiliate.bank_update', entityType: 'affiliate', entityId: aff.id,
    before, after: { bankName, accountNo, accountName },
  });
  return c.json({ ok: true });
});

affiliateRoutes.post('/api/aff/password', async (c) => {
  const aff = affiliateOf(c);
  const body = await c.req.json<{ current?: string; next?: string }>()
    .catch(() => ({} as Record<string, never>));
  const next = String(body.next ?? '');
  if (next.length < 8) return c.json({ ok: false, error: 'Mật khẩu mới cần ít nhất 8 ký tự.' }, 400);

  const row = await c.env.DB.prepare(`SELECT password_hash FROM affiliates WHERE id = ?`)
    .bind(aff.id).first<{ password_hash: string | null }>();
  if (!row?.password_hash || !await verifyPassword(String(body.current ?? ''), row.password_hash)) {
    return c.json({ ok: false, error: 'Mật khẩu hiện tại không đúng.' }, 400);
  }

  await c.env.DB.prepare(`UPDATE affiliates SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(next), now(), aff.id).run();
  // Đổi mật khẩu thì cắt mọi phiên khác — kể cả phiên kẻ khác đang mượn.
  await c.env.DB.prepare(
    `UPDATE sessions SET revoked_at = ? WHERE subject_type = 'affiliate' AND subject_id = ? AND id != ?`,
  ).bind(now(), aff.id, c.get('sessionId') ?? '').run();
  return c.json({ ok: true });
});

affiliateRoutes.get('/api/aff/payouts', async (c) => {
  const aff = affiliateOf(c);
  const rows = await c.env.DB.prepare(
    `SELECT id, payout_code, amount, item_count, status, requested_at, paid_at, payment_reference,
            rejected_reason
     FROM payouts WHERE affiliate_id = ? ORDER BY requested_at DESC`,
  ).bind(aff.id).all<Record<string, unknown>>();
  return c.json({
    ok: true,
    payouts: (rows.results ?? []).map((r) => ({
      ...r,
      statusLabel: PAYOUT_LABEL[r.status as string],
      requestedAtText: ictDateTime(r.requested_at as number),
    })),
  });
});

affiliateRoutes.post('/api/aff/payouts', async (c) => {
  const aff = affiliateOf(c);
  const res = await requestPayout(c.env, aff.id);
  return res.ok ? c.json(res) : c.json(res, 400);
});
