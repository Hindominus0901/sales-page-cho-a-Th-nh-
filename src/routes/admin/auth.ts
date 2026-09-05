import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { createSession, clearCookie, readSession, revokeSession, csrfToken, COOKIE_ADMIN }
  from '../../lib/auth/session';
import { verifyPassword } from '../../lib/security/hash';
import { loginLockedOut, loginFailed, loginSucceeded, requireAdmin, adminUserOf }
  from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { now } from '../../lib/util/datetime';

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
