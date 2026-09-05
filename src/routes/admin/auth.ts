import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { createSession, clearCookie, readSession, revokeSession, csrfToken, COOKIE_ADMIN }
  from '../../lib/auth/session';
import { verifyPassword, hashPassword } from '../../lib/security/hash';
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

// ------------------------------------------------------- tự đổi mật khẩu

/**
 * Mật khẩu tối thiểu 12 ký tự.
 *
 * Cloudflare Workers chặn PBKDF2 ở 100.000 vòng — thấp hơn khuyến nghị của
 * OWASP, và đó là trần nền tảng chứ không phải lựa chọn. Bù lại bằng độ dài:
 * một mật khẩu 12 ký tự thật sự ngẫu nhiên vẫn ngoài tầm dò, còn "Thanh2024"
 * thì 100.000 vòng không cứu nổi.
 */
const MIN_PASSWORD = 12;

/**
 * Những chuỗi khiến mật khẩu thành đoán được.
 *
 * Danh sách này không nhằm bắt hết mọi mật khẩu yếu — không danh sách nào làm
 * được thế. Nó chặn đúng những thứ người ta thật sự hay gõ ở dự án NÀY, và
 * quan trọng hơn: chặn việc lấy chính email hay tên thương hiệu làm mật khẩu.
 */
const CAM = ['password', 'matkhau', 'goccreator', 'goc creator', '123456', 'qwerty',
  'admin', 'abc123', '111111', 'iloveyou'];

function checkPassword(moi: string, email: string): string | null {
  if (moi.length < MIN_PASSWORD) {
    return `Mật khẩu phải từ ${MIN_PASSWORD} ký tự trở lên — hiện mới ${moi.length}.`;
  }
  if (moi.length > 200) return 'Mật khẩu dài quá 200 ký tự.';
  if (moi.trim() !== moi) return 'Mật khẩu không được bắt đầu hoặc kết thúc bằng dấu cách.';

  const thuong = moi.toLowerCase();
  for (const xau of CAM) {
    if (thuong.includes(xau)) return `Mật khẩu không được chứa "${xau}" — dễ đoán quá.`;
  }
  // Phần trước @ của email là thứ người dò thử đầu tiên.
  const ten = email.split('@')[0]?.toLowerCase() ?? '';
  if (ten.length >= 4 && thuong.includes(ten)) {
    return 'Mật khẩu không được chứa email của anh chị.';
  }
  // Một ký tự lặp lại suốt thì dài mấy cũng vô nghĩa.
  if (/^(.)\1*$/.test(moi)) return 'Mật khẩu chỉ có một ký tự lặp lại.';
  return null;
}

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
