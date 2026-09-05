import type { Env } from '../../types';
import { uuid } from '../util/id';
import { now } from '../util/datetime';
import type { Mail } from './templates';
import { sendMail } from './resend';

/**
 * Câu lệnh xếp email vào hàng đợi, dạng D1PreparedStatement để nhét thẳng vào
 * db.batch() atomic đang ghi nhận đơn.
 *
 * ON CONFLICT DO NOTHING dựa trên UNIQUE(template, ref_id): webhook SePay gửi
 * lại bao nhiêu lần thì cũng chỉ một email đi ra. Không phụ thuộc vào việc mã
 * kiểm tra cẩn thận — cơ sở dữ liệu không cho phép dòng thứ hai.
 */
export function queueMailStmt(env: Env, mail: Mail): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO email_outbox (id, to_email, to_name, subject, body_text, body_html,
                               template, ref_type, ref_id, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?, 'pending', ?)
     ON CONFLICT(template, ref_id) DO NOTHING`,
  ).bind(uuid(), mail.toEmail, mail.toName, mail.subject, mail.text, mail.html,
    mail.template, mail.refType, mail.refId, now());
}

/** Xếp hàng ngoài batch, cho những chỗ không có sẵn một batch atomic. */
export async function queueMail(env: Env, mail: Mail | null): Promise<void> {
  if (!mail) return;
  try {
    await queueMailStmt(env, mail).run();
  } catch (err) {
    // Không để việc xếp email làm hỏng việc chính. Khách đăng ký được là quan
    // trọng hơn khách nhận được mail.
    console.error('[email] không xếp được vào hàng đợi', mail.template, err);
  }
}

const MAX_ATTEMPTS = 4;

export interface DrainResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Gửi những email đang chờ.
 *
 * Chạy hai nơi: ngay sau khi webhook trả 200 (qua ctx.waitUntil, khách nhận mail
 * trong vài giây) và trong việc chạy hằng đêm để nhặt những cái lỗi. Gửi ngay mà
 * không có lưới đỡ thì một mail lỗi lúc 2h sáng nằm đó mãi mãi.
 */
export async function drainOutbox(env: Env, limit = 20): Promise<DrainResult> {
  const out: DrainResult = { sent: 0, failed: 0, skipped: 0 };

  const rows = await env.DB.prepare(
    `SELECT id, to_email, to_name, subject, body_text, body_html, attempts
     FROM email_outbox
     WHERE status = 'pending' AND attempts < ?
     ORDER BY created_at LIMIT ?`,
  ).bind(MAX_ATTEMPTS, limit).all<{
    id: string; to_email: string; to_name: string | null; subject: string;
    body_text: string; body_html: string | null; attempts: number;
  }>();

  const list = rows.results ?? [];
  if (list.length === 0) return out;

  // Chưa cấu hình nhà cung cấp: đánh dấu 'skipped' rồi thôi. KHÔNG phải 'failed'
  // — hai thứ này đọc khác hẳn nhau trong trang quản trị. 'failed' nghĩa là có
  // gì đó hỏng cần sửa; 'skipped' nghĩa là tính năng chưa bật, đúng như thực tế.
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    await env.DB.batch(list.map((r) => env.DB.prepare(
      `UPDATE email_outbox SET status = 'skipped',
         last_error = 'chưa đặt RESEND_API_KEY hoặc EMAIL_FROM', sent_at = ?
       WHERE id = ? AND status = 'pending'`,
    ).bind(now(), r.id)));
    out.skipped = list.length;
    return out;
  }

  for (const row of list) {
    const res = await sendMail(env, {
      to: row.to_email, toName: row.to_name,
      subject: row.subject, text: row.body_text, html: row.body_html,
    });

    if (res.ok) {
      await env.DB.prepare(
        `UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = ?,
           last_error = NULL WHERE id = ?`,
      ).bind(now(), row.id).run();
      out.sent++;
      continue;
    }

    // Hết lượt thử thì chuyển hẳn sang 'failed' để nó hiện ra trong trang quản
    // trị, thay vì nằm im trong hàng đợi và không ai biết.
    const attempts = row.attempts + 1;
    await env.DB.prepare(
      `UPDATE email_outbox SET attempts = ?, last_error = ?,
         status = CASE WHEN ? >= ? THEN 'failed' ELSE 'pending' END
       WHERE id = ?`,
    ).bind(attempts, res.error.slice(0, 500), attempts, MAX_ATTEMPTS, row.id).run();
    out.failed++;
  }

  return out;
}
