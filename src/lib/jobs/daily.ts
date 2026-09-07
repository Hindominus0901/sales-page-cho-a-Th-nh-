import type { Env } from '../../types';
import { now, ictDate } from '../util/datetime';
import { drainOutbox, queueMail } from '../email/outbox';
import { nhacNopBaiMail } from '../email/templates';
import { audit } from '../db/audit';

/**
 * Việc chạy hằng đêm. Mỗi việc tự bọc try/catch: một việc hỏng không được
 * kéo theo các việc còn lại.
 */
export async function runDailyJobs(env: Env): Promise<void> {
  await safely('hết hạn đơn chờ', () => expireStaleOrders(env));
  await safely('tự duyệt hoa hồng', () => autoApproveCommissions(env));
  await safely('dọn phiên hết hạn', () => pruneSessions(env));
  await safely('nhắc học viên chưa nộp bài', () => nhacHocVien(env));
  await safely('đóng khoá đã hết 21 ngày', () => dongKhoaHetHan(env));
  // Lưới đỡ cho hộp thư đi. Việc gửi chính đã chạy ngay sau webhook; lượt này
  // nhặt những cái lúc đó lỗi, để một mail hỏng lúc 2h sáng không nằm im mãi.
  await safely('gửi lại email còn tồn', () => drainOutbox(env));
}

/**
 * Việc chạy mỗi giờ: chỉ đẩy hộp thư đi.
 *
 * Một lượt chỉ gửi được 20 email (trần subrequest của Workers), nên nếu chỉ có
 * cron hằng đêm thì hàng đợi tồn 30 email phải mất hai ngày mới hết. Mỗi giờ
 * một lượt là 480 email/ngày, thừa sức cho quy mô này, mà lượt nào không có gì
 * để gửi thì tốn đúng một câu SELECT.
 *
 * Các việc còn lại (hết hạn đơn, duyệt hoa hồng, dọn phiên) cố ý KHÔNG chạy ở
 * đây: chúng tính theo ngày, chạy 24 lần/ngày chẳng thêm gì ngoài rác trong log.
 */
export async function runHourlyJobs(env: Env): Promise<void> {
  await safely('đẩy hộp thư đi', () => drainOutbox(env));
}

async function safely(label: string, fn: () => Promise<unknown>): Promise<void> {
  try { await fn(); } catch (err) { console.error(`[cron] ${label} lỗi:`, err); }
}

/**
 * Đơn quá hạn mà chưa nhận được đồng nào thì chuyển sang 'expired'.
 *
 * KHÔNG xoá: khách chuyển khoản muộn vẫn phải khớp được vào đúng đơn, và
 * webhook vẫn nhận đơn ở trạng thái này (chỉ loại 'cancelled' và 'refunded').
 * Đơn đã nhận một phần cũng không đụng tới — tiền đã vào thì đơn còn sống.
 */
async function expireStaleOrders(env: Env): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE orders SET status = 'expired', updated_at = ?
     WHERE status = 'pending' AND amount_paid = 0
       AND expires_at IS NOT NULL AND expires_at < unixepoch()`,
  ).bind(now()).run();
  const n = res.meta.changes ?? 0;
  if (n > 0) console.log(`[cron] ${n} đơn hết hạn`);
}

/**
 * Hoa hồng qua kỳ soát đơn (COMMISSION_HOLD_DAYS, hiện 7 ngày) và không bị treo
 * thì tự duyệt.
 *
 * Khoảng đệm này ra đời để chờ hết hạn hoàn tiền. Khoá nay KHÔNG hoàn tiền nữa
 * nhưng vẫn giữ 7 ngày, có chủ ý: nó là lưới bắt đơn gian lận, chuyển khoản bị
 * ngân hàng đảo, và CTV tự mua rồi xin huỷ — những thứ không biến mất cùng với
 * chính sách hoàn tiền.
 * Hoa hồng 'held' KHÔNG bao giờ được tự duyệt — phải có người xem.
 */
async function autoApproveCommissions(env: Env): Promise<void> {
  const ts = now();
  const res = await env.DB.prepare(
    `UPDATE commissions SET status = 'approved', approved_at = ?, updated_at = ?
     WHERE status = 'pending' AND available_at <= ?`,
  ).bind(ts, ts, ts).run();

  const n = res.meta.changes ?? 0;
  if (n > 0) {
    console.log(`[cron] tự duyệt ${n} hoa hồng`);
    await audit(env, {
      actorType: 'system', action: 'commission.auto_approve',
      entityType: 'commission', after: { count: n },
    });
  }
}

async function pruneSessions(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE expires_at < unixepoch() - 86400`).run();
}

/** Bao nhiêu ngày im lặng thì thôi nhắc. Người đã bỏ thì đừng làm phiền thêm. */
const NGUNG_NHAC_SAU = 5;

/**
 * Nhắc học viên chưa nộp bài.
 *
 * Trước việc này, cron hằng đêm không có MỘT việc nào cho lớp học — cả bốn việc
 * đều thuộc về bán hàng. Học viên quên là quên luôn, không ai gọi, và anh Thành
 * cũng không biết ai đang tụt lại cho tới cuối khoá.
 *
 * Hai loại thư, khác nhau về giọng:
 *   - chuỗi sắp đứt (nghỉ đúng một ngày): tiếc cho họ, giục nhẹ
 *   - đã im vài ngày: trấn an là nộp bù vẫn đủ coin
 *
 * Ba chốt để nó không thành phiền:
 *   - chỉ nhắc người đang học (`status = 'active'`) và đã tới ngày khai giảng
 *   - ngừng sau NGUNG_NHAC_SAU ngày im lặng
 *   - refId kèm ngày, nên UNIQUE(template, ref_id) bảo đảm tối đa một lá/ngày
 */
async function nhacHocVien(env: Env): Promise<void> {
  const homNay = ictDate();
  const homQua = ictDate(now() - 86400);

  const rows = await env.DB.prepare(
    `SELECT st.id, st.full_name, st.email, st.streak_current, st.last_submit_date,
            e.started_at
     FROM enrollments e JOIN students st ON st.id = e.student_id
     WHERE e.status = 'active'
       AND st.email IS NOT NULL AND st.email != ''
       AND e.started_at <= unixepoch()
       -- Chưa nộp hôm nay (nộp rồi thì không có gì để nhắc)
       AND (st.last_submit_date IS NULL OR st.last_submit_date < ?)
       -- Và khoá chưa quá 21 ngày
       AND e.started_at > unixepoch() - 21 * 86400`,
  ).bind(homNay).all<{
    id: string; full_name: string; email: string;
    streak_current: number; last_submit_date: string | null; started_at: number;
  }>();

  for (const r of rows.results ?? []) {
    // Chưa nộp bài nào: đếm từ ngày khai giảng.
    const mocCuoi = r.last_submit_date
      ? Date.parse(`${r.last_submit_date}T00:00:00Z`) / 1000
      : r.started_at;
    const soNgayIm = Math.floor((Date.parse(`${homNay}T00:00:00Z`) / 1000 - mocCuoi) / 86400);

    if (soNgayIm < 1 || soNgayIm > NGUNG_NHAC_SAU) continue;

    // Nghỉ đúng một ngày và đang có chuỗi: nộp hôm nay là chuỗi còn.
    const chuoiSapDut = r.last_submit_date === homQua && r.streak_current > 1;

    await queueMail(env, nhacNopBaiMail(env, {
      studentId: r.id, ngay: homNay, name: r.full_name, email: r.email,
      soNgayIm, chuoiSapDut, chuoi: r.streak_current,
    }));
  }
}

/**
 * Đóng khoá khi đã qua 21 ngày.
 *
 * `enrollments.status` có giá trị 'completed' trong lược đồ từ đầu, nhưng KHÔNG
 * cron nào và KHÔNG màn hình nào từng đặt nó. Hệ quả: mọi học viên vĩnh viễn
 * "Đang học", và người mua từ hai tháng trước vẫn nộp bù ngày 3 để lấy coin.
 *
 * Để dư 3 ngày sau ngày 21 cho người nộp bù sát nút.
 */
async function dongKhoaHetHan(env: Env): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE enrollments SET status = 'completed', completed_at = ?, updated_at = ?
     WHERE status = 'active' AND started_at < unixepoch() - 24 * 86400`,
  ).bind(now(), now()).run();

  const n = res.meta?.changes ?? 0;
  if (n > 0) {
    await audit(env, {
      actorType: 'system', actorId: null, actorLabel: 'cron',
      action: 'enrollment.auto_complete', entityType: 'enrollment', entityId: null,
      after: { soLuong: n },
    });
  }
}
