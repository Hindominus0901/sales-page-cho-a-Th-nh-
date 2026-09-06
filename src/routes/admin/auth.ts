import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { createSession, clearCookie, readSession, revokeSession, csrfToken, COOKIE_ADMIN }
  from '../../lib/auth/session';
import { verifyPassword, hashPassword } from '../../lib/security/hash';
import { checkPassword } from '../../lib/security/password-policy';
import { loginLockedOut, loginFailed, loginSucceeded, requireAdmin, adminUserOf }
  from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { now } from '../../lib/util/datetime';
import { capPhieu, doiPhieu } from '../../lib/auth/password-reset';
import { passwordResetMail } from '../../lib/email/templates';
import { queueMail, drainOutbox } from '../../lib/email/outbox';
import { rateLimit } from '../../lib/security/ratelimit';

export const adminAuthRoutes = new Hono<HonoEnv>();

adminAuthRoutes.post('/api/admin/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
    .catch(() => ({} as { email?: string; password?: string }));
  const emailNorm = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!emailNorm || !password) {
    return c.json({ ok: false, error: 'Anh nhập đủ email và mật khẩu giúp em.' }, 400);
  }
  if (await loginLockedOut(c.env, emailNorm)) {
    return c.json({ ok: false, error: 'Sai quá nhiều lần. Anh thử lại sau 15 phút.' }, 429);
  }

  const user = await c.env.DB
    .prepare(`SELECT id, name, email, role, password_hash, is_active FROM admin_users WHERE email_norm = ?`)
    .bind(emailNorm)
    .first<{ id: string; name: string; email: string; role: string; password_hash: string; is_active: number }>();

  // Cùng một câu lỗi cho "không có tài khoản" và "sai mật khẩu": đừng cho biết
  // email nào tồn tại.
  const invalid = async () => {
    await loginFailed(c.env, emailNorm);
    return c.json({ ok: false, error: 'Email hoặc mật khẩu không đúng.' }, 401);
  };
  if (!user || !user.is_active) return invalid();
  if (!await verifyPassword(password, user.password_hash)) return invalid();

  await loginSucceeded(c.env, emailNorm);
  const { cookie } = await createSession(c.env, 'admin', user.id, c.req.raw);
  await c.env.DB.prepare(`UPDATE admin_users SET last_login_at = ? WHERE id = ?`)
    .bind(now(), user.id).run();
  await audit(c.env, {
    actorType: 'admin', actorId: user.id, actorLabel: user.email,
    action: 'admin.login', entityType: 'admin_user', entityId: user.id,
  });

  c.header('set-cookie', cookie);
  return c.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

adminAuthRoutes.post('/api/admin/logout', async (c) => {
  const session = await readSession(c.env, c.req.raw, 'admin');
  if (session) await revokeSession(c.env, session.id);
  c.header('set-cookie', clearCookie(COOKIE_ADMIN, new URL(c.req.url).protocol === 'https:'));
  return c.json({ ok: true });
});

/** Phiên hiện tại + token CSRF. SPA gọi đầu tiên để biết đã đăng nhập chưa. */
adminAuthRoutes.get('/api/admin/me', requireAdmin, async (c) => {
  const session = await readSession(c.env, c.req.raw, 'admin');
  const user = adminUserOf(c);
  return c.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    csrfToken: session ? await csrfToken(session) : null,
  });
});

// ------------------------------------------------------- tự đổi mật khẩu

/**
 * Tự đổi mật khẩu của chính mình, có nhập mật khẩu cũ.
 *
 * KHÔNG nằm dưới requireRole('owner') như phần còn lại của file: nhân viên và
 * quản trị cũng phải đổi được mật khẩu của họ. Route này chỉ đụng vào chính
 * người đang đăng nhập nên không có gì để leo thang.
 *
 * Hỏi mật khẩu cũ vì phiên đăng nhập có thể bị bỏ quên trên máy người khác —
 * hỏi mật khẩu cũ khiến người mượn được cái máy đó không đổi được khoá.
 */
adminAuthRoutes.post('/api/admin/me/mat-khau', requireAdmin, async (c) => {
  const me = adminUserOf(c);
  type Body = { current?: string; next?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  const cu = String(body.current ?? '');
  const moi = String(body.next ?? '');

  if (!cu || !moi) return c.json({ ok: false, error: 'Anh chị nhập đủ hai ô giúp em.' }, 400);

  // Khoá theo tài khoản, dùng chung bộ đếm với màn hình đăng nhập: dò mật khẩu
  // cũ ở đây cũng là dò mật khẩu, không vì đổi cửa mà thành miễn phí.
  if (await loginLockedOut(c.env, me.email.toLowerCase())) {
    return c.json({ ok: false, error: 'Sai quá nhiều lần. Anh chị thử lại sau 15 phút.' }, 429);
  }

  const row = await c.env.DB.prepare(`SELECT password_hash FROM admin_users WHERE id = ?`)
    .bind(me.id).first<{ password_hash: string }>();
  if (!row || !await verifyPassword(cu, row.password_hash)) {
    await loginFailed(c.env, me.email.toLowerCase());
    return c.json({ ok: false, error: 'Mật khẩu hiện tại không đúng.' }, 400);
  }
  await loginSucceeded(c.env, me.email.toLowerCase());

  if (cu === moi) return c.json({ ok: false, error: 'Mật khẩu mới trùng mật khẩu cũ.' }, 400);

  const loi = checkPassword(moi, me.email);
  if (loi) return c.json({ ok: false, error: loi }, 400);

  await c.env.DB.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(moi), now(), me.id).run();

  // Thu hồi mọi phiên KHÁC của chính mình — đó là điểm của việc đổi mật khẩu:
  // cái máy ở quán cà phê quên đăng xuất phải chết. Phiên hiện tại giữ lại,
  // người vừa gõ đúng mật khẩu cũ không có lý do gì bị đá ra.
  const phien = await readSession(c.env, c.req.raw, 'admin');
  await c.env.DB.prepare(
    `DELETE FROM sessions WHERE subject_type = 'admin' AND subject_id = ? AND id != ?`,
  ).bind(me.id, phien?.id ?? '').run();

  await audit(c.env, {
    actorType: 'admin', actorId: me.id, actorLabel: me.email,
    action: 'admin.change_password', entityType: 'admin_user', entityId: me.id,
  });

  return c.json({ ok: true });
});

// ------------------------------------------------------- quên mật khẩu

/**
 * Xin đặt lại mật khẩu.
 *
 * KHÔNG có requireAdmin — người quên mật khẩu thì đúng là chưa đăng nhập được.
 *
 * Luôn trả về CÙNG MỘT CÂU, dù email có tài khoản hay không, dù có cấp được
 * phiếu hay bị chặn vì xin quá nhiều. Trả lời khác nhau là biến trang này
 * thành công cụ dò xem địa chỉ nào có tài khoản quản trị — thông tin đầu tiên
 * mà người muốn đột nhập đi tìm.
 */
adminAuthRoutes.post('/api/admin/quen-mat-khau', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  type Body = { email?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  const emailNorm = String(body.email ?? '').trim().toLowerCase();

  const cauTraLoi = { ok: true, message: 'Nếu email này có tài khoản, em đã gửi hướng dẫn tới đó.' };

  // Chặn theo IP để một người không quét được cả danh sách email.
  const limited = await rateLimit(c.env, `reset:${ip}`, 10, 3600);
  if (!limited.ok) return c.json(cauTraLoi);
  if (!emailNorm) return c.json(cauTraLoi);

  const user = await c.env.DB.prepare(
    `SELECT id, name, email FROM admin_users WHERE email_norm = ? AND is_active = 1`,
  ).bind(emailNorm).first<{ id: string; name: string; email: string }>();
  if (!user) return c.json(cauTraLoi);

  const phieu = await capPhieu(c.env, 'admin', user.id, user.email, c.req.header('cf-connecting-ip') ?? null);
  if (!phieu) return c.json(cauTraLoi);

  await queueMail(c.env, passwordResetMail(c.env, {
    resetId: phieu.resetId, token: phieu.token, subjectType: 'admin',
    email: user.email, name: user.name,
  }));
  c.executionCtx.waitUntil(drainOutbox(c.env).catch((err) => console.error('[email] lượt gửi lỗi', err)));

  await audit(c.env, {
    actorType: 'system', actorId: null, actorLabel: user.email,
    action: 'admin.reset_requested', entityType: 'admin_user', entityId: user.id,
  });

  return c.json(cauTraLoi);
});

/** Đổi mã trong đường link lấy mật khẩu mới. Dùng chung cho cả ba vai trò. */
adminAuthRoutes.post('/api/dat-lai-mat-khau', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  type Body = { ma?: string; matKhau?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));

  // Mã là 32 byte ngẫu nhiên nên không dò nổi, nhưng vẫn chặn để không ai biến
  // đây thành chỗ đốt CPU của Worker.
  const limited = await rateLimit(c.env, `datlai:${ip}`, 20, 3600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thử lại sau ít phút giúp em.' }, 429);
  }

  const res = await doiPhieu(c.env, String(body.ma ?? ''), String(body.matKhau ?? ''));
  if (!res.ok) return c.json({ ok: false, error: res.error }, 400);

  await audit(c.env, {
    actorType: 'system', actorId: null, actorLabel: res.email,
    action: res.subjectType + '.reset_done',
    entityType: res.subjectType, entityId: res.subjectId,
  });

  return c.json({ ok: true, vai: res.subjectType });
});
