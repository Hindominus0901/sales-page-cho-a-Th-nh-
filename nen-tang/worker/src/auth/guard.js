/** Kiem tra quyen dung chung cho moi route can dang nhap. */
import { apiError } from '../lib/respond.js';
import { readSession } from './session.js';

/**
 * Nap nguoi dung hien tai vao rc.user (mot lan cho moi request).
 * @returns {Promise<object|null>}
 */
export async function loadUser(rc) {
  if (rc.user !== undefined) return rc.user;
  const session = await readSession(rc);
  rc.user = session ? session.user : null;
  rc.sessionId = session ? session.sessionId : null;
  return rc.user;
}

/** @returns {Promise<Response|null>} Response loi neu chua dang nhap. */
export async function requireUser(rc) {
  const user = await loadUser(rc);
  if (!user) return apiError(401, 'unauthorized', 'Bạn cần đăng nhập.');
  return null;
}

/** @returns {Promise<Response|null>} Response loi neu khong du quyen. */
export async function requireRole(rc, ...roles) {
  const denied = await requireUser(rc);
  if (denied) return denied;
  if (!roles.includes(rc.user.role)) {
    return apiError(403, 'forbidden', 'Bạn không có quyền thực hiện thao tác này.');
  }
  return null;
}

/**
 * Ban than nguoi dung xem ho so cua chinh minh - tra ve day du.
 * Cot nhay cam cua he thong (legacy_lead_id, org_id) khong bao gio gui ra ngoai.
 */
export const selfUser = (u) => ({
  id: u.id,
  email: u.email,
  email_verified: !!u.email_verified,
  full_name: u.full_name,
  role: u.role,
  status: u.status,
  avatar_url: u.avatar_url || '',
  phone: u.phone || '',
  bio: u.bio || '',
  team_id: u.team_id || null,
  mentor_id: u.mentor_id || null,
  total_xp: u.total_xp,
  total_coin: u.total_coin,
  content_count: u.content_count,
  call_count: u.call_count,
  assignment_count: u.assignment_count,
  current_streak: u.current_streak,
  longest_streak: u.longest_streak,
  last_activity_date: u.last_activity_date,
  created_date: u.created_date,
  updated_date: u.updated_date,
});
