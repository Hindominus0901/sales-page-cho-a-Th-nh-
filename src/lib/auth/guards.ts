import type { Context, MiddlewareHandler } from 'hono';
import type { HonoEnv, Env } from '../../types';
import { readSession, assertCsrf, type SessionRow } from './session';
import { isLockedOut, recordFailure, clearFailures } from '../security/ratelimit';

export interface AdminUser {
  id: string; email: string; name: string; role: 'owner' | 'admin' | 'staff'; is_active: number;
}

export interface AffiliateUser {
  id: string; code: string; name: string; email: string; status: string; commission_rate: number;
}

/** Bắt buộc đăng nhập admin. Mọi route /api/admin/* đi qua đây. */
export const requireAdmin: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const session = await readSession(c.env, c.req.raw, 'admin');
  if (!session) return c.json({ ok: false, error: 'Chưa đăng nhập.' }, 401);

  const user = await c.env.DB
    .prepare(`SELECT id, email, name, role, is_active FROM admin_users WHERE id = ?`)
    .bind(session.subject_id).first<AdminUser>();
  if (!user || !user.is_active) {
    return c.json({ ok: false, error: 'Tài khoản đã bị khoá.' }, 403);
  }

  if (isMutating(c) && !await assertCsrf(c, session)) {
    return c.json({ ok: false, error: 'Phiên làm việc không hợp lệ, anh tải lại trang giúp em.' }, 403);
  }

  c.set('adminId', user.id);
  c.set('sessionId', session.id);
  (c as Context<HonoEnv> & { adminUser?: AdminUser }).adminUser = user;
  await next();
};

/** Bắt buộc đăng nhập CTV, và tài khoản phải đang hoạt động. */
export const requireAffiliate: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const session = await readSession(c.env, c.req.raw, 'affiliate');
  if (!session) return c.json({ ok: false, error: 'Chưa đăng nhập.' }, 401);

  const aff = await c.env.DB
    .prepare(`SELECT id, code, name, email, status, commission_rate FROM affiliates WHERE id = ?`)
    .bind(session.subject_id).first<AffiliateUser>();
  if (!aff) return c.json({ ok: false, error: 'Không tìm thấy tài khoản.' }, 403);
  if (aff.status !== 'active') {
    return c.json({
      ok: false,
      error: aff.status === 'pending'
        ? 'Tài khoản đang chờ duyệt. Bên Thành sẽ liên hệ với anh chị.'
        : 'Tài khoản đang tạm ngưng. Anh chị nhắn Zalo để được hỗ trợ.',
    }, 403);
  }

  if (isMutating(c) && !await assertCsrf(c, session)) {
    return c.json({ ok: false, error: 'Phiên làm việc không hợp lệ, anh chị tải lại trang giúp em.' }, 403);
  }

  c.set('affiliateId', aff.id);
  c.set('sessionId', session.id);
  (c as Context<HonoEnv> & { affiliate?: AffiliateUser }).affiliate = aff;
  await next();
};

/** Một số việc chỉ chủ tài khoản và admin được làm (duyệt chi tiền, đổi giá). */
export function requireRole(...roles: AdminUser['role'][]): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = (c as Context<HonoEnv> & { adminUser?: AdminUser }).adminUser;
    if (!user || !roles.includes(user.role)) {
      return c.json({ ok: false, error: 'Anh không có quyền thực hiện việc này.' }, 403);
    }
    await next();
  };
}

const isMutating = (c: Context<HonoEnv>): boolean =>
  c.req.method !== 'GET' && c.req.method !== 'HEAD';

export const adminUserOf = (c: Context<HonoEnv>): AdminUser =>
  (c as Context<HonoEnv> & { adminUser: AdminUser }).adminUser;

export const affiliateOf = (c: Context<HonoEnv>): AffiliateUser =>
  (c as Context<HonoEnv> & { affiliate: AffiliateUser }).affiliate;

/**
 * Khoá đăng nhập theo email: 5 lần SAI trong 15 phút thì khoá.
 *
 * Đếm trên KV chứ không phải DB để lần thử sai không tốn một lượt ghi database.
 * Chỉ lần sai mới bị tính — đăng nhập đúng phải xoá bộ đếm, nếu không người
 * dùng thật đăng nhập vài lần trong ngày sẽ bị khoá oan.
 */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW = 900;

export const loginLockedOut = (env: Env, key: string): Promise<boolean> =>
  isLockedOut(env, `login:${key}`, LOGIN_LIMIT, LOGIN_WINDOW);

export const loginFailed = (env: Env, key: string): Promise<void> =>
  recordFailure(env, `login:${key}`, LOGIN_WINDOW);

export const loginSucceeded = (env: Env, key: string): Promise<void> =>
  clearFailures(env, `login:${key}`, LOGIN_WINDOW);
