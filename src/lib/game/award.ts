import type { Env } from '../../types';
import { uuid } from '../util/id';
import { now, ictDate } from '../util/datetime';
import { auditStmt } from '../db/audit';
import { applyStreak, streakMultiplier, type StreakState } from './streak';

export interface Mechanics {
  coinPerSubmission: number;
  coinPerContent: number;
  coinPerCall: number;
  streakBonusPct: number;
  xpPerSubmission: number;
}

const NUM = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  try {
    const v = JSON.parse(raw);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  } catch { return fallback; }
};

export async function readMechanics(env: Env): Promise<Mechanics> {
  const rows = await env.DB.prepare(
    `SELECT key, value_json FROM settings WHERE key LIKE 'coin.%' OR key LIKE 'xp.%'`,
  ).all<{ key: string; value_json: string }>();
  const map = new Map((rows.results ?? []).map((r) => [r.key, r.value_json]));
  return {
    coinPerSubmission: NUM(map.get('coin.per_submission'), 50),
    coinPerContent:    NUM(map.get('coin.per_content'), 20),
    coinPerCall:       NUM(map.get('coin.per_call'), 100),
    streakBonusPct:    NUM(map.get('coin.streak_bonus_pct'), 10),
    xpPerSubmission:   NUM(map.get('xp.per_submission'), 100),
  };
}

export interface AwardResult {
  coin: number;
  xp: number;
  streak: number;
  streakBest: number;
  streakBroken: boolean;
  /** false khi bài này đã được duyệt trước đó — không cộng lần hai. */
  awarded: boolean;
}

/**
 * Duyệt một bài nộp: cộng coin, XP và chuỗi ngày.
 *
 * An toàn khi bấm duyệt hai lần: câu UPDATE có điều kiện `status != 'approved'`
 * nên lần thứ hai không đổi được dòng nào và hàm thoát sớm. Không có ràng buộc
 * UNIQUE nào chặn được việc này vì bản ghi đã tồn tại — phải chặn bằng chính
 * điều kiện chuyển trạng thái.
 */
export async function approveSubmission(
  env: Env,
  submissionId: string,
  actor: { id: string; label: string },
  feedback: string | null,
): Promise<AwardResult | null> {
  const sub = await env.DB.prepare(
    `SELECT s.*, st.xp, st.coin, st.streak_current, st.streak_best, st.last_submit_date
     FROM submissions s JOIN students st ON st.id = s.student_id
     WHERE s.id = ?`,
  ).bind(submissionId).first<{
    id: string; student_id: string; enrollment_id: string; day: number; status: string;
    created_at: number; xp: number; coin: number;
    streak_current: number; streak_best: number; last_submit_date: string | null;
  }>();
  if (!sub) return null;
  if (sub.status === 'approved') {
    return {
      coin: 0, xp: 0, streak: sub.streak_current, streakBest: sub.streak_best,
      streakBroken: false, awarded: false,
    };
  }

  const m = await readMechanics(env);
  const ts = now();

  // Chuỗi tính theo NGÀY NỘP, không phải ngày duyệt — team duyệt muộn thì
  // học viên không bị mất chuỗi vì lỗi của bên mình.
  const submitDate = ictDate(sub.created_at);
  const state: StreakState = {
    current: sub.streak_current, best: sub.streak_best, lastDate: sub.last_submit_date,
  };
  const streak = applyStreak(state, submitDate);

  const multiplier = streak.counted ? streakMultiplier(streak.current, m.streakBonusPct) : 1;
  const coin = Math.round(m.coinPerSubmission * multiplier);
  const xp = m.xpPerSubmission;

  const res = await env.DB.prepare(
    `UPDATE submissions SET status = 'approved', feedback = COALESCE(?, feedback),
       reviewed_by = ?, reviewed_at = ?, coin_awarded = ?, xp_awarded = ?, updated_at = ?
     WHERE id = ? AND status != 'approved'`,
  ).bind(feedback, actor.id, ts, coin, xp, ts, submissionId).run();

  // Hai người bấm duyệt cùng lúc: chỉ một câu UPDATE đổi được dòng.
  if ((res.meta.changes ?? 0) === 0) {
    return { coin: 0, xp: 0, streak: sub.streak_current, streakBest: sub.streak_best,
             streakBroken: false, awarded: false };
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE students SET xp = xp + ?, coin = coin + ?,
         streak_current = ?, streak_best = ?, last_submit_date = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(xp, coin, streak.current, streak.best, streak.lastDate, ts, sub.student_id),

    env.DB.prepare(
      `INSERT INTO coin_ledger (id, student_id, delta, reason, note, ref_type, ref_id, actor_id, created_at)
       VALUES (?,?,?, 'submission', ?, 'submission', ?, ?, ?)`,
    ).bind(uuid(), sub.student_id, coin,
      `Duyệt bài ngày ${sub.day}${multiplier > 1 ? ` (thưởng chuỗi ×${multiplier.toFixed(2)})` : ''}`,
      submissionId, actor.id, ts),

    // Tiến độ = số bài ĐÃ DUYỆT, không phải số bài đã nộp.
    env.DB.prepare(
      `UPDATE enrollments SET
         posts_done = (SELECT COUNT(*) FROM submissions WHERE enrollment_id = ? AND status = 'approved'),
         progress_day = MAX(progress_day, ?), updated_at = ?
       WHERE id = ?`,
    ).bind(sub.enrollment_id, sub.day, ts, sub.enrollment_id),

    auditStmt(env, {
      actorType: 'admin', actorId: actor.id, actorLabel: actor.label,
      action: 'submission.approve', entityType: 'submission', entityId: submissionId,
      after: { day: sub.day, coin, xp, streak: streak.current },
    }),
  ]);

  return {
    coin, xp, streak: streak.current, streakBest: streak.best,
    streakBroken: streak.broken, awarded: true,
  };
}

/** Cộng/trừ coin bằng tay. Luôn ghi sổ cái để số dư giải thích được. */
export async function adjustCoin(
  env: Env,
  studentId: string,
  delta: number,
  reason: string,
  note: string,
  actor: { id: string; label: string },
): Promise<void> {
  const ts = now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE students SET coin = MAX(0, coin + ?), updated_at = ? WHERE id = ?`)
      .bind(delta, ts, studentId),
    env.DB.prepare(
      `INSERT INTO coin_ledger (id, student_id, delta, reason, note, actor_id, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(uuid(), studentId, delta, reason, note, actor.id, ts),
    auditStmt(env, {
      actorType: 'admin', actorId: actor.id, actorLabel: actor.label,
      action: 'coin.adjust', entityType: 'student', entityId: studentId,
      after: { delta, reason, note },
    }),
  ]);
}
