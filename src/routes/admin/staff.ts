import { Hono } from 'hono';
import type { HonoEnv } from '../../types';
import { requireAdmin, requireRole, adminUserOf } from '../../lib/auth/guards';
import { audit } from '../../lib/db/audit';
import { hashPassword } from '../../lib/security/hash';
import { uuid } from '../../lib/util/id';
import { now } from '../../lib/util/datetime';

export const adminStaffRoutes = new Hono<HonoEnv>();

// Toàn bộ màn hình này chỉ owner mở được. Ai vào được đây là thêm được người
// vào hệ quản trị, nên không có route nào ở đây nới lỏng cho 'admin'.
adminStaffRoutes.use('/api/admin/staff', requireAdmin, requireRole('owner'));
adminStaffRoutes.use('/api/admin/staff/*', requireAdmin, requireRole('owner'));

type Role = 'owner' | 'admin' | 'staff';
const ROLES: Role[] = ['owner', 'admin', 'staff'];

/** Bảng chữ bỏ ký tự dễ nhầm khi đọc mật khẩu qua điện thoại: 0/O, 1/l/I. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRTVWXY34679';

function randomPassword(len = 14): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * Còn bao nhiêu owner đang hoạt động, không tính người đang bị loại trừ.
 *
 * Đây là câu hỏi đứng sau mọi thao tác hạ vai hay tắt tài khoản: hệ thống mất
 * owner cuối cùng là không ai vào lại được màn hình này nữa, và sửa thì phải
 * vào tận cơ sở dữ liệu.
 */
async function otherActiveOwners(env: HonoEnv['Bindings'], exceptId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND is_active = 1 AND id != ?`,
  ).bind(exceptId).first<{ n: number }>();
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ danh sách

adminStaffRoutes.get('/api/admin/staff', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, email, role, is_active, last_login_at, created_at
     FROM admin_users ORDER BY is_active DESC, created_at`,
  ).all();

  return c.json({ ok: true, staff: rows.results ?? [], me: adminUserOf(c).id });
});

// -------------------------------------------------------------------- thêm mới

adminStaffRoutes.post('/api/admin/staff', async (c) => {
  const me = adminUserOf(c);
  const b = await c.req.json<{ name?: string; email?: string; role?: string }>()
    .catch(() => ({} as Record<string, never>));

  const name = String(b.name ?? '').trim();
  const email = String(b.email ?? '').trim().toLowerCase();
  const role = (b.role ?? 'staff') as Role;

  if (name.length < 2) return c.json({ ok: false, error: 'Cần điền tên người này.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return c.json({ ok: false, error: 'Email chưa đúng.' }, 400);
  }
  if (!ROLES.includes(role)) return c.json({ ok: false, error: 'Vai trò không hợp lệ.' }, 400);

  const password = randomPassword();
  const hash = await hashPassword(password);
  const id = uuid();
  const ts = now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO admin_users (id, email, email_norm, name, password_hash, role, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,1,?,?)`,
    ).bind(id, email, email, name, hash, role, ts, ts).run();
  } catch (err) {
    // D1 báo tên CỘT vi phạm chứ không phải tên index, nên bắt theo cột.
    if (String(err).includes('admin_users.email_norm')) {
      return c.json({ ok: false, error: 'Email này đã có tài khoản rồi.' }, 409);
    }
    throw err;
  }

  await audit(c.env, {
    actorType: 'admin', actorId: me.id, actorLabel: me.email,
    action: 'staff.create', entityType: 'admin_user', entityId: id,
    after: { name, email, role },
  });

  // Mật khẩu trả về ĐÚNG MỘT LẦN ở đây và không bao giờ đọc lại được — không có
  // route nào trả password_hash, và cũng không có route nào giải mã được nó.
  return c.json({ ok: true, id, password });
});

// ----------------------------------------------------------- đổi vai trò / bật tắt

adminStaffRoutes.patch('/api/admin/staff/:id', async (c) => {
  const me = adminUserOf(c);
  const id = c.req.param('id');
  const b = await c.req.json<{ role?: string; isActive?: boolean; name?: string }>()
    .catch(() => ({} as Record<string, never>));

  const target = await c.env.DB.prepare(
    `SELECT id, name, email, role, is_active FROM admin_users WHERE id = ?`,
  ).bind(id).first<{ id: string; name: string; email: string; role: Role; is_active: number }>();
  if (!target) return c.json({ ok: false, error: 'Không tìm thấy người này.' }, 404);

  // Tự khoá mình ra ngoài là loại lỗi chỉ sửa được bằng cách vào tận cơ sở dữ
  // liệu. Chặn ở đây chứ không chỉ ẩn nút trên giao diện.
  if (id === me.id && b.role !== undefined && b.role !== target.role) {
    return c.json({ ok: false, error: 'Không tự đổi vai trò của chính mình được. Nhờ một owner khác làm giúp.' }, 400);
  }
  if (id === me.id && b.isActive === false) {
    return c.json({ ok: false, error: 'Không tự tắt tài khoản của chính mình được.' }, 400);
  }

  // Hệ thống phải luôn còn ít nhất một owner đang hoạt động.
  const dangLaOwner = target.role === 'owner' && target.is_active === 1;
  const boiOwner = b.role !== undefined && b.role !== 'owner';
  const bitTat = b.isActive === false;
  if (dangLaOwner && (boiOwner || bitTat) && (await otherActiveOwners(c.env, id)) === 0) {
    return c.json({
      ok: false,
      error: 'Đây là owner đang hoạt động duy nhất. Thêm một owner nữa trước đã, '
        + 'không thì sẽ không còn ai vào được màn hình này.',
    }, 400);
  }

  if (b.role !== undefined && !ROLES.includes(b.role as Role)) {
    return c.json({ ok: false, error: 'Vai trò không hợp lệ.' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE admin_users SET name = COALESCE(?, name), role = COALESCE(?, role),
       is_active = COALESCE(?, is_active), updated_at = ?
     WHERE id = ?`,
  ).bind(
    b.name?.trim() || null,
    b.role ?? null,
    b.isActive === undefined ? null : (b.isActive ? 1 : 0),
    now(), id,
  ).run();

  // Tắt tài khoản mà phiên đăng nhập vẫn sống thì việc tắt gần như vô nghĩa
  // cho tới khi phiên hết hạn. Đá luôn.
  if (b.isActive === false) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE subject_type = 'admin' AND subject_id = ?`)
      .bind(id).run();
  }

  await audit(c.env, {
    actorType: 'admin', actorId: me.id, actorLabel: me.email,
    action: 'staff.update', entityType: 'admin_user', entityId: id,
    before: { role: target.role, is_active: target.is_active },
    after: { role: b.role ?? target.role, is_active: b.isActive === undefined ? target.is_active : Number(b.isActive) },
  });

  return c.json({ ok: true });
});

// ------------------------------------------------------------ đặt lại mật khẩu

adminStaffRoutes.post('/api/admin/staff/:id/mat-khau', async (c) => {
  const me = adminUserOf(c);
  const id = c.req.param('id');

  const target = await c.env.DB.prepare(`SELECT id, email FROM admin_users WHERE id = ?`)
    .bind(id).first<{ id: string; email: string }>();
  if (!target) return c.json({ ok: false, error: 'Không tìm thấy người này.' }, 404);

  const password = randomPassword();
  await c.env.DB.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .bind(await hashPassword(password), now(), id).run();

  // Đổi mật khẩu mà phiên cũ vẫn dùng được thì việc đổi không chặn được ai.
  await c.env.DB.prepare(`DELETE FROM sessions WHERE subject_type = 'admin' AND subject_id = ?`)
    .bind(id).run();

  await audit(c.env, {
    actorType: 'admin', actorId: me.id, actorLabel: me.email,
    action: 'staff.reset_password', entityType: 'admin_user', entityId: id,
  });

  return c.json({ ok: true, password });
});
