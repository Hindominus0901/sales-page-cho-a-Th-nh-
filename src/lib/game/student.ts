import type { Env } from '../../types';
import { uuid } from '../util/id';
import { now, ictDate } from '../util/datetime';
import { audit, auditStmt } from '../db/audit';
import { rankOf, parseTiers, type RankInfo } from './rank';
import { readMechanics } from './award';

export interface StudentSession {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  cohort: string | null;
  status: string;
  progressDay: number;
  postsDone: number;
  startedAt: number | null;
  xp: number;
  coin: number;
  streakCurrent: number;
  streakBest: number;
}

/**
 * Đổi mã trong link lấy phiên học viên.
 *
 * Enrollment đã huỷ/hoàn tiền vẫn mở được trang — học viên xem lại được bài
 * và nhận xét cũ — nhưng route nộp bài chặn riêng. Đóng sập cả trang thì
 * người vừa xin hoàn tiền mất luôn mọi thứ họ đã viết, mà chẳng để làm gì.
 */
export async function sessionFromToken(env: Env, token: string): Promise<StudentSession | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  const row = await env.DB.prepare(
    `SELECT e.id AS enrollment_id, e.student_id, e.cohort, e.status, e.progress_day,
            e.posts_done, e.started_at,
            s.full_name, s.xp, s.coin, s.streak_current, s.streak_best
     FROM enrollments e JOIN students s ON s.id = e.student_id
     WHERE e.access_token = ?`,
  ).bind(token).first<{
    enrollment_id: string; student_id: string; cohort: string | null; status: string;
    progress_day: number; posts_done: number; started_at: number | null;
    full_name: string; xp: number; coin: number;
    streak_current: number; streak_best: number;
  }>();
  if (!row) return null;

  // Ghi lần ghé gần nhất để anh Thành thấy ai đã mở link, ai chưa bao giờ mở.
  // Cố ý không await: chậm một nhịp ghi thống kê không đáng để người dùng chờ.
  env.DB.prepare(`UPDATE enrollments SET last_seen_at = ? WHERE id = ?`)
    .bind(now(), row.enrollment_id).run()
    .catch((err) => console.error('[hoc] không ghi được last_seen_at', err));

  return {
    enrollmentId: row.enrollment_id,
    studentId: row.student_id,
    fullName: row.full_name,
    cohort: row.cohort,
    status: row.status,
    progressDay: row.progress_day,
    postsDone: row.posts_done,
    startedAt: row.started_at,
    xp: row.xp,
    coin: row.coin,
    streakCurrent: row.streak_current,
    streakBest: row.streak_best,
  };
}

export interface DaySlot {
  day: number;
  status: 'approved' | 'pending' | 'needs_work' | 'rejected' | 'empty';
  postUrl: string | null;
  content: string | null;
  channel: string | null;
  feedback: string | null;
  coinAwarded: number;
  submittedAt: number | null;
}

/** 21 ô ngày, ô nào chưa nộp thì 'empty' — trang luôn vẽ đủ 21 ô. */
export async function daySlots(env: Env, enrollmentId: string): Promise<DaySlot[]> {
  const rows = await env.DB.prepare(
    `SELECT day, status, post_url, content, channel, feedback, coin_awarded, created_at
     FROM submissions WHERE enrollment_id = ?`,
  ).bind(enrollmentId).all<{
    day: number; status: DaySlot['status']; post_url: string | null; content: string | null;
    channel: string | null; feedback: string | null; coin_awarded: number; created_at: number;
  }>();

  const byDay = new Map((rows.results ?? []).map((r) => [r.day, r]));
  return Array.from({ length: 21 }, (_, i) => {
    const d = i + 1;
    const r = byDay.get(d);
    return {
      day: d,
      status: r?.status ?? 'empty',
      postUrl: r?.post_url ?? null,
      content: r?.content ?? null,
      channel: r?.channel ?? null,
      feedback: r?.feedback ?? null,
      coinAwarded: r?.coin_awarded ?? 0,
      submittedAt: r?.created_at ?? null,
    };
  });
}

export async function rankFor(env: Env, xp: number): Promise<RankInfo> {
  const row = await env.DB.prepare(`SELECT value_json FROM settings WHERE key = 'rank.tiers'`)
    .first<{ value_json: string }>();
  return rankOf(xp, parseTiers(row?.value_json));
}

export interface SubmitInput {
  day: number;
  postUrl: string;
  content: string;
  channel: string;
}

export type SubmitOutcome =
  | { ok: true; created: boolean }
  | { ok: false; error: string };

const CHANNELS = new Set(['facebook', 'tiktok', 'youtube', 'khac']);

/**
 * Học viên nộp hoặc sửa bài của một ngày.
 *
 * Nộp lại thì SỬA bài cũ chứ không tạo bài thứ hai — `UNIQUE(enrollment_id, day)`
 * bảo đảm điều đó ở tầng dữ liệu, không phụ thuộc câu lệnh viết đúng. Bài đã
 * được duyệt thì khoá lại: sửa được sau khi duyệt nghĩa là link đã nhận coin
 * có thể bị thay bằng link khác, coin vẫn giữ nguyên.
 */
export async function submitDay(
  env: Env,
  session: StudentSession,
  input: SubmitInput,
): Promise<SubmitOutcome> {
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 21) {
    return { ok: false, error: 'Ngày phải nằm trong khoảng 1–21.' };
  }
  if (session.status !== 'active') {
    return { ok: false, error: 'Khoá học của anh chị đang tạm dừng. Nhắn cho team giúp em nhé.' };
  }

  const url = input.postUrl.trim();
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url) || url.length > 500) {
    return { ok: false, error: 'Link bài đăng chưa đúng. Anh chị dán link đầy đủ, bắt đầu bằng https:// giúp em.' };
  }
  const content = input.content.trim().slice(0, 2000);
  const channel = CHANNELS.has(input.channel) ? input.channel : 'khac';

  const existing = await env.DB.prepare(
    `SELECT id, status FROM submissions WHERE enrollment_id = ? AND day = ?`,
  ).bind(session.enrollmentId, input.day).first<{ id: string; status: string }>();

  if (existing?.status === 'approved') {
    return { ok: false, error: 'Bài ngày này đã được duyệt và cộng thưởng rồi, không sửa lại được nữa.' };
  }

  const ts = now();
  if (existing) {
    // Nộp lại sau khi bị trả về: quay lại hàng chờ, và XOÁ nhận xét cũ —
    // giữ lại thì học viên tưởng team đã xem bài mới.
    await env.DB.prepare(
      `UPDATE submissions SET post_url = ?, content = ?, channel = ?, status = 'pending',
         feedback = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = ?
       WHERE id = ? AND status != 'approved'`,
    ).bind(url, content, channel, ts, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO submissions (id, enrollment_id, student_id, day, post_url, content,
                                channel, status, is_late, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, 'pending', ?, ?, ?)
       ON CONFLICT(enrollment_id, day) DO NOTHING`,
    ).bind(uuid(), session.enrollmentId, session.studentId, input.day, url, content,
      channel, isLate(session, input.day) ? 1 : 0, ts, ts).run();
  }

  await audit(env, {
    actorType: 'student', actorId: session.studentId, actorLabel: session.fullName,
    action: existing ? 'submission.resubmit' : 'submission.create',
    entityType: 'submission', entityId: session.enrollmentId,
    after: { day: input.day, channel },
  });

  return { ok: true, created: !existing };
}

/**
 * Nộp muộn = nộp sau ngày đáng lẽ phải nộp. Chỉ để đánh dấu, không chặn:
 * người bận rộn nộp bù cuối tuần vẫn phải nộp được, chỉ là không tính vào
 * điều kiện học bổng.
 */
function isLate(session: StudentSession, day: number): boolean {
  if (!session.startedAt) return false;
  const dueDay = Math.floor((now() - session.startedAt) / 86400) + 1;
  return day < dueDay;
}

export type RedeemOutcome = { ok: true; coinLeft: number } | { ok: false; error: string };

/**
 * Đổi quà. Trừ coin và trừ tồn kho NGAY lúc đặt, không đợi admin duyệt — đợi
 * thì học viên đổi được nhiều quà hơn số coin đang có. Admin từ chối thì hoàn
 * lại cả hai (đã có sẵn ở luồng duyệt trong trang quản trị).
 */
export async function redeemReward(
  env: Env,
  session: StudentSession,
  rewardId: string,
  note: string,
): Promise<RedeemOutcome> {
  const reward = await env.DB.prepare(
    `SELECT id, name, cost_coin, min_rank, stock, is_active FROM rewards WHERE id = ?`,
  ).bind(rewardId).first<{
    id: string; name: string; cost_coin: number; min_rank: number;
    stock: number | null; is_active: number;
  }>();

  if (!reward || !reward.is_active) return { ok: false, error: 'Phần quà này không còn nhận đổi.' };
  if (reward.stock !== null && reward.stock <= 0) return { ok: false, error: 'Phần quà này đã hết.' };

  const rank = await rankFor(env, session.xp);
  if (rank.index < reward.min_rank) {
    return { ok: false, error: 'Phần quà này cần bậc cao hơn. Anh chị nộp thêm bài để lên bậc nhé.' };
  }

  const ts = now();
  // Điều kiện `coin >= ?` nằm trong chính câu UPDATE: hai lần bấm đổi cùng lúc
  // thì chỉ một lần trừ được coin, lần kia không đổi dòng nào.
  const spend = await env.DB.prepare(
    `UPDATE students SET coin = coin - ?, updated_at = ? WHERE id = ? AND coin >= ?`,
  ).bind(reward.cost_coin, ts, session.studentId, reward.cost_coin).run();

  if ((spend.meta.changes ?? 0) === 0) {
    return { ok: false, error: `Anh chị cần ${reward.cost_coin.toLocaleString('vi-VN')} coin để đổi phần quà này.` };
  }

  const redemptionId = uuid();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO reward_redemptions (id, student_id, reward_id, reward_name, cost_coin,
                                       status, note, created_at, updated_at)
       VALUES (?,?,?,?,?, 'requested', ?,?,?)`,
    ).bind(redemptionId, session.studentId, reward.id, reward.name, reward.cost_coin,
      note.trim().slice(0, 500) || null, ts, ts),

    env.DB.prepare(`UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock IS NOT NULL`)
      .bind(reward.id),

    env.DB.prepare(
      `INSERT INTO coin_ledger (id, student_id, delta, reason, note, ref_type, ref_id, created_at)
       VALUES (?,?,?, 'redeem', ?, 'reward_redemption', ?, ?)`,
    ).bind(uuid(), session.studentId, -reward.cost_coin, `Đổi quà: ${reward.name}`, redemptionId, ts),

    auditStmt(env, {
      actorType: 'student', actorId: session.studentId, actorLabel: session.fullName,
      action: 'redemption.create', entityType: 'reward_redemption', entityId: redemptionId,
      after: { reward: reward.name, cost: reward.cost_coin },
    }),
  ]);

  return { ok: true, coinLeft: session.coin - reward.cost_coin };
}

/** Quà đang mở, kèm cờ học viên này đã đủ điều kiện đổi chưa. */
export async function rewardsFor(env: Env, session: StudentSession, rank: RankInfo) {
  const rows = await env.DB.prepare(
    `SELECT id, name, description, cost_coin, min_rank, stock, image_url
     FROM rewards WHERE is_active = 1 ORDER BY sort_order, cost_coin`,
  ).all<{
    id: string; name: string; description: string | null; cost_coin: number;
    min_rank: number; stock: number | null; image_url: string | null;
  }>();

  return (rows.results ?? []).map((r) => ({
    ...r,
    canRedeem: session.coin >= r.cost_coin && rank.index >= r.min_rank
      && (r.stock === null || r.stock > 0),
    reason: r.stock !== null && r.stock <= 0 ? 'Đã hết'
      : rank.index < r.min_rank ? 'Cần bậc cao hơn'
      : session.coin < r.cost_coin ? `Còn thiếu ${(r.cost_coin - session.coin).toLocaleString('vi-VN')} coin`
      : null,
  }));
}

/** Ngày thứ mấy của hành trình, để trang gợi ý sẵn ô ngày hôm nay. */
export function currentDay(session: StudentSession): number {
  if (!session.startedAt) return 1;
  const d = Math.floor((now() - session.startedAt) / 86400) + 1;
  return Math.min(21, Math.max(1, d));
}

export { ictDate, readMechanics };
