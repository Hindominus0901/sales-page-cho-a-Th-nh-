import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { createSession, clearCookie, readSession, revokeSession, COOKIE_STUDENT }
  from '../lib/auth/session';
import { verifyPassword, hashPassword } from '../lib/security/hash';
import { loginLockedOut, loginFailed, loginSucceeded } from '../lib/auth/guards';
import { checkPassword } from '../lib/security/password-policy';
import { capPhieu } from '../lib/auth/password-reset';
import { passwordResetMail } from '../lib/email/templates';
import { queueMail, drainOutbox } from '../lib/email/outbox';
import { rateLimit } from '../lib/security/ratelimit';
import { audit } from '../lib/db/audit';
import { now } from '../lib/util/datetime';

export const studentAuthRoutes = new Hono<HonoEnv>();

interface HocVien {
  id: string; full_name: string; email: string | null; password_hash: string | null;
}

/**
 * Đăng nhập học viên.
 *
 * Học viên vào lớp được bằng hai đường: đường link bí mật cũ (không mật khẩu)
 * và đường này. Giữ cả hai vì học viên đang học không được phép bị đá ra giữa
 * chừng chỉ vì hệ thêm tính năng.
 */
studentAuthRoutes.post('/api/hv/dang-nhap', async (c) => {
  type Body = { email?: string; password?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  const emailNorm = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!emailNorm || !password) {
    return c.json({ ok: false, error: 'Anh chị nhập đủ email và mật khẩu giúp em.' }, 400);
  }
  if (await loginLockedOut(c.env, `hv:${emailNorm}`)) {
    return c.json({ ok: false, error: 'Sai quá nhiều lần. Anh chị thử lại sau 15 phút.' }, 429);
  }

  const hv = await c.env.DB.prepare(
    `SELECT id, full_name, email, password_hash FROM students WHERE email_norm = ?`,
  ).bind(emailNorm).first<HocVien>();

  // Cùng một câu cho "không có tài khoản", "chưa đặt mật khẩu" và "sai mật
  // khẩu". Nói rõ email nào đã mua khoá là rò rỉ thông tin về khách hàng.
  const sai = async () => {
    await loginFailed(c.env, `hv:${emailNorm}`);
    return c.json({ ok: false, error: 'Email hoặc mật khẩu không đúng.' }, 401);
  };
  if (!hv || !hv.password_hash) return sai();
  if (!await verifyPassword(password, hv.password_hash)) return sai();

  await loginSucceeded(c.env, `hv:${emailNorm}`);
  const { cookie } = await createSession(c.env, 'student', hv.id, c.req.raw);
  await c.env.DB.prepare(`UPDATE students SET last_login_at = ? WHERE id = ?`)
    .bind(now(), hv.id).run();

  c.header('set-cookie', cookie);
  return c.json({ ok: true, name: hv.full_name });
});

studentAuthRoutes.post('/api/hv/dang-xuat', async (c) => {
  const session = await readSession(c.env, c.req.raw, 'student');
  if (session) await revokeSession(c.env, session.id);
  c.header('set-cookie', clearCookie(COOKIE_STUDENT, new URL(c.req.url).protocol === 'https:'));
  return c.json({ ok: true });
});

/** Đang đăng nhập là ai. Trang /hoc gọi cái này để biết chạy chế độ nào. */
studentAuthRoutes.get('/api/hv/me', async (c) => {
  const session = await readSession(c.env, c.req.raw, 'student');
  if (!session) return c.json({ ok: false }, 401);
  const hv = await c.env.DB.prepare(`SELECT full_name FROM students WHERE id = ?`)
    .bind(session.subject_id).first<{ full_name: string }>();
  if (!hv) return c.json({ ok: false }, 401);
  return c.json({ ok: true, name: hv.full_name });
});

/**
 * Đặt mật khẩu lần đầu, đi từ đường link bí mật.
 *
 * Mã trong link ĐÃ chứng minh danh tính — nó được gửi tới đúng hộp thư của học
 * viên khi thanh toán xong, và chỉ họ có. Nên ở đây không hỏi mật khẩu cũ (làm
 * gì có), mà kiểm tra mã.
 *
 * Chỉ cho ĐẶT LẦN ĐẦU. Đã có mật khẩu rồi mà vẫn cho đặt lại bằng link thì ai
 * nhặt được link cũ (chuyển tiếp email, ảnh chụp màn hình) là đổi được mật
 * khẩu và chiếm luôn tài khoản. Đổi mật khẩu về sau đi đường quên mật khẩu,
 * vốn gửi mã mới tới hộp thư.
 */
studentAuthRoutes.post('/api/hoc/:token/dat-mat-khau', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const limited = await rateLimit(c.env, `hvdat:${ip}`, 10, 3600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thử lại sau ít phút giúp em.' }, 429);
  }

  const token = c.req.param('token') ?? '';
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return c.json({ ok: false, error: 'Đường link không đúng.' }, 404);
  }

  type Body = { matKhau?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  const matKhau = String(body.matKhau ?? '');

  const hv = await c.env.DB.prepare(
    `SELECT s.id, s.full_name, s.email, s.email_norm, s.password_hash
     FROM enrollments e JOIN students s ON s.id = e.student_id
     WHERE e.access_token = ?`,
  ).bind(token).first<HocVien & { email_norm: string | null }>();

  if (!hv) return c.json({ ok: false, error: 'Đường link không đúng hoặc đã bị thu hồi.' }, 404);

  if (!hv.email_norm) {
    return c.json({
      ok: false,
      error: 'Tài khoản của anh chị chưa có email nên chưa đặt được mật khẩu. '
        + 'Anh chị nhắn Zalo để bên em bổ sung giúp.',
    }, 400);
  }

  if (hv.password_hash) {
    return c.json({
      ok: false,
      error: 'Tài khoản này đã có mật khẩu. Nếu quên, anh chị dùng chức năng '
        + 'quên mật khẩu để nhận link mới qua email.',
    }, 400);
  }

  const loi = checkPassword(matKhau, hv.email ?? '');
  if (loi) return c.json({ ok: false, error: loi }, 400);

  await c.env.DB.prepare(`UPDATE students SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(matKhau), now(), hv.id).run();

  await audit(c.env, {
    actorType: 'system', actorId: null, actorLabel: hv.email,
    action: 'student.password_set', entityType: 'student', entityId: hv.id,
  });

  // Đăng nhập luôn: họ vừa chứng minh danh tính và vừa đặt mật khẩu, bắt gõ
  // lại ngay là thừa một bước chẳng để làm gì.
  const { cookie } = await createSession(c.env, 'student', hv.id, c.req.raw);
  c.header('set-cookie', cookie);
  return c.json({ ok: true, email: hv.email });
});

/** Học viên quên mật khẩu. Cùng khuôn với admin và CTV. */
studentAuthRoutes.post('/api/hv/quen-mat-khau', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  type Body = { email?: string };
  const body = await c.req.json<Body>().catch(() => ({} as Body));
  const emailNorm = String(body.email ?? '').trim().toLowerCase();

  const cauTraLoi = { ok: true, message: 'Nếu email này có tài khoản, em đã gửi hướng dẫn tới đó.' };

  const limited = await rateLimit(c.env, `reset:${ip}`, 10, 3600);
  if (!limited.ok || !emailNorm) return c.json(cauTraLoi);

  // Chưa từng đặt mật khẩu thì không phải "quên" — họ vào bằng link. Gửi thư
  // đặt lại cho người chưa có mật khẩu chỉ làm họ rối.
  const hv = await c.env.DB.prepare(
    `SELECT id, full_name, email FROM students
     WHERE email_norm = ? AND password_hash IS NOT NULL`,
  ).bind(emailNorm).first<{ id: string; full_name: string; email: string }>();
  if (!hv) return c.json(cauTraLoi);

  const phieu = await capPhieu(c.env, 'student', hv.id, hv.email, c.req.header('cf-connecting-ip') ?? null);
  if (!phieu) return c.json(cauTraLoi);

  await queueMail(c.env, passwordResetMail(c.env, {
    resetId: phieu.resetId, token: phieu.token, subjectType: 'student',
    email: hv.email, name: hv.full_name,
  }));
  c.executionCtx.waitUntil(drainOutbox(c.env).catch((err) => console.error('[email] lượt gửi lỗi', err)));

  return c.json(cauTraLoi);
});
