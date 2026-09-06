import type { Env } from '../../types';
import { uuid, randomToken } from '../util/id';
import { now, hoursFromNow } from '../util/datetime';
import { hmacSha256, hashIp, hashPassword } from '../security/hash';
import { checkPassword } from '../security/password-policy';

export type SubjectType = 'admin' | 'affiliate' | 'student';

/** Một giờ. Đủ để mở hộp thư và bấm vào, ngắn để một email bị chuyển tiếp không thành chìa khoá vĩnh viễn. */
const HAN_GIO = 1;

/** Tối đa 3 phiếu trong 1 giờ cho cùng một người — chặn kẻ spam hộp thư của họ. */
const TOI_DA_MOI_GIO = 3;

/** Bảng nào giữ mật khẩu của vai trò nào. */
const BANG: Record<SubjectType, string> = {
  admin: 'admin_users', affiliate: 'affiliates', student: 'students',
};

export interface CapKetQua {
  /** Mã thô — CHỈ tồn tại ở đây và trong email. Không bao giờ ghi vào database. */
  token: string;
  /** Id phiếu, dùng làm ref_id của email. */
  resetId: string;
}

/**
 * Cấp một phiếu đặt lại mật khẩu.
 *
 * Trả null khi không nên cấp (quá nhiều lần trong một giờ). Người gọi vẫn phải
 * trả về CÙNG MỘT CÂU cho người dùng dù cấp được hay không — khác nhau là biến
 * trang quên mật khẩu thành công cụ dò xem email nào có tài khoản.
 */
export async function capPhieu(
  env: Env,
  subjectType: SubjectType,
  subjectId: string,
  email: string,
  ip: string | null,
): Promise<CapKetQua | null> {
  const gan = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM password_resets
     WHERE subject_type = ? AND subject_id = ? AND created_at > ?`,
  ).bind(subjectType, subjectId, now() - 3600).first<{ n: number }>();
  if ((gan?.n ?? 0) >= TOI_DA_MOI_GIO) return null;

  const token = randomToken(32);
  const resetId = uuid();

  await env.DB.prepare(
    `INSERT INTO password_resets
       (id, subject_type, subject_id, email, token_hash, expires_at, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(resetId, subjectType, subjectId, email,
    await hmacSha256(env.SESSION_SECRET, token),
    hoursFromNow(HAN_GIO), await hashIp(env, ip), now()).run();

  return { token, resetId };
}

export type DoiKetQua =
  | { ok: true; subjectType: SubjectType; subjectId: string; email: string }
  | { ok: false; error: string };

/**
 * Đổi mã lấy mật khẩu mới.
 *
 * Ba điều kiện, và cả ba đều kiểm ở đây chứ không ở route: mã có thật, chưa
 * hết hạn, chưa dùng. Đặt trong hàm này để ba vai trò không có ba bản kiểm hơi
 * khác nhau.
 *
 * Thu hồi TOÀN BỘ phiên của người đó — khác hẳn với tự đổi mật khẩu (chỗ đó
 * giữ lại phiên hiện tại). Ở đây người xin đặt lại rất có thể chính là người
 * vừa bị chiếm tài khoản, nên mọi phiên đang mở đều đáng ngờ.
 */
export async function doiPhieu(
  env: Env,
  token: string,
  matKhauMoi: string,
): Promise<DoiKetQua> {
  if (!token || !matKhauMoi) {
    return { ok: false, error: 'Thiếu mã hoặc mật khẩu mới.' };
  }

  const hash = await hmacSha256(env.SESSION_SECRET, token);
  const phieu = await env.DB.prepare(
    `SELECT id, subject_type, subject_id, email, expires_at, used_at
     FROM password_resets WHERE token_hash = ?`,
  ).bind(hash).first<{
    id: string; subject_type: SubjectType; subject_id: string;
    email: string; expires_at: number; used_at: number | null;
  }>();

  // Cùng một câu cho "không có mã này" và "mã đã dùng rồi": mã trong đường link
  // là bí mật, và nói rõ nó tồn tại hay không là rò rỉ không cần thiết.
  if (!phieu || phieu.used_at !== null) {
    return { ok: false, error: 'Đường link này không dùng được nữa. Anh chị xin lại một link mới.' };
  }
  if (phieu.expires_at < now()) {
    return { ok: false, error: 'Đường link đã quá hạn 1 giờ. Anh chị xin lại một link mới.' };
  }

  const loi = checkPassword(matKhauMoi, phieu.email);
  if (loi) return { ok: false, error: loi };

  const bang = BANG[phieu.subject_type];
  const ts = now();

  // Ba việc phải cùng thành hoặc cùng không: đặt mật khẩu, đánh dấu phiếu đã
  // dùng, thu hồi phiên. Đặt được mật khẩu mà không đánh dấu phiếu là mã còn
  // dùng lại được; đánh dấu mà không thu hồi phiên là kẻ chiếm tài khoản vẫn
  // ngồi trong đó.
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${bang} SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .bind(await hashPassword(matKhauMoi), ts, phieu.subject_id),
    env.DB.prepare(`UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL`)
      .bind(ts, phieu.id),
    env.DB.prepare(`DELETE FROM sessions WHERE subject_type = ? AND subject_id = ?`)
      .bind(phieu.subject_type, phieu.subject_id),
    // Mọi phiếu khác của người này cũng chết theo. Xin ba lần rồi dùng cái thứ
    // nhất thì hai cái còn lại vẫn nằm trong hộp thư — và hộp thư là thứ có thể
    // đã bị đọc trộm.
    env.DB.prepare(
      `UPDATE password_resets SET used_at = ?
       WHERE subject_type = ? AND subject_id = ? AND used_at IS NULL`,
    ).bind(ts, phieu.subject_type, phieu.subject_id),
  ]);

  return { ok: true, subjectType: phieu.subject_type, subjectId: phieu.subject_id, email: phieu.email };
}
