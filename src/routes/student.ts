import { Hono } from 'hono';
import type { Context } from 'hono';
import type { HonoEnv } from '../types';
import { rateLimit } from '../lib/security/ratelimit';
import {
  sessionFromToken, sessionFromStudentId, daySlots, rankFor, rewardsFor,
  submitDay, redeemReward, currentDay, type StudentSession,
} from '../lib/game/student';
import { readMechanics } from '../lib/game/award';
import { readSession } from '../lib/auth/session';

export const studentRoutes = new Hono<HonoEnv>();

/**
 * HAI đường vào cùng một cổng học viên:
 *
 *   /api/hoc/:token/…  — mã bí mật nằm trên đường dẫn, không cần mật khẩu.
 *                        Đây là đường học viên cũ đang dùng; giữ nguyên.
 *   /api/hv/…          — đăng nhập bằng email và mật khẩu.
 *
 * Hai đường khác nhau ở đúng một chỗ: cách biết đây là ai. Từ sau bước đó, cả
 * hai gọi CÙNG những hàm bên dưới — nộp bài, đổi quà và tính coin chỉ có một
 * bản. Nhân đôi chúng là cách chắc chắn để hai bên lệch nhau, và bên lệch sẽ
 * là bên ít người dùng hơn, tức là bên không ai phát hiện ra.
 */

/**
 * Mã truy cập nằm trên đường dẫn nên nó lọt vào Referer khi học viên bấm sang
 * trang khác. `no-referrer` cắt đường rò đó; `noindex` giữ link khỏi Google.
 */
studentRoutes.use('/api/hoc/*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Referrer-Policy', 'no-referrer');
  await next();
});
studentRoutes.use('/api/hv/*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  await next();
});

// ------------------------------------------------------------- giải danh tính

/** Từ mã trên đường dẫn. */
const tuMa = (c: Context<HonoEnv>) => sessionFromToken(c.env, c.req.param('token') ?? '');

/** Từ phiên đăng nhập. */
async function tuPhien(c: Context<HonoEnv>): Promise<StudentSession | null> {
  const phien = await readSession(c.env, c.req.raw, 'student');
  if (!phien) return null;
  return sessionFromStudentId(c.env, phien.subject_id);
}

const CHUA_NHAN_RA = { ok: false as const, error: 'Đường link không đúng hoặc đã bị thu hồi.' };
const CHUA_DANG_NHAP = { ok: false as const, error: 'Chưa đăng nhập.' };

// --------------------------------------------------------------- ba việc chính

async function xemTrang(c: Context<HonoEnv>, session: StudentSession) {
  const rank = await rankFor(c.env, session.xp);
  const [days, rewards, mechanics] = await Promise.all([
    daySlots(c.env, session.enrollmentId),
    rewardsFor(c.env, session, rank),
    readMechanics(c.env),
  ]);

  const redemptions = await c.env.DB.prepare(
    `SELECT reward_name, cost_coin, status, created_at FROM reward_redemptions
     WHERE student_id = ? ORDER BY created_at DESC LIMIT 20`,
  ).bind(session.studentId).all();

  return c.json({
    ok: true,
    student: {
      name: session.fullName,
      cohort: session.cohort,
      status: session.status,
      coin: session.coin,
      xp: session.xp,
      streak: session.streakCurrent,
      streakBest: session.streakBest,
      postsDone: session.postsDone,
      currentDay: currentDay(session),
    },
    rank: {
      icon: rank.tier.icon, name: rank.tier.name,
      next: rank.next ? { icon: rank.next.icon, name: rank.next.name } : null,
      progress: rank.progress, xpToNext: rank.xpToNext,
    },
    days,
    rewards,
    redemptions: redemptions.results ?? [],
    mechanics: {
      coinPerSubmission: mechanics.coinPerSubmission,
      xpPerSubmission: mechanics.xpPerSubmission,
      streakBonusPct: mechanics.streakBonusPct,
    },
  });
}

async function nopBai(c: Context<HonoEnv>, session: StudentSession) {
  const b = await c.req.json<{ day?: number; postUrl?: string; content?: string; channel?: string }>()
    .catch(() => ({} as Record<string, never>));

  const result = await submitDay(c.env, session, {
    day: Number(b.day),
    postUrl: String(b.postUrl ?? ''),
    content: String(b.content ?? ''),
    channel: String(b.channel ?? 'khac'),
  });

  if (!result.ok) return c.json(result, 400);
  return c.json({
    ok: true,
    message: result.created
      ? 'Đã nhận bài của anh chị. Team sẽ đọc và nhận xét trong hôm nay.'
      : 'Đã cập nhật bài. Team sẽ xem lại và nhận xét.',
  });
}

async function doiQua(c: Context<HonoEnv>, session: StudentSession) {
  const b = await c.req.json<{ rewardId?: string; note?: string }>()
    .catch(() => ({} as Record<string, never>));
  if (!b.rewardId) return c.json({ ok: false, error: 'Thiếu phần quà cần đổi.' }, 400);

  const result = await redeemReward(c.env, session, b.rewardId, String(b.note ?? ''));
  if (!result.ok) return c.json(result, 400);
  return c.json({
    ok: true,
    coinLeft: result.coinLeft,
    message: 'Đã ghi nhận. Team sẽ liên hệ anh chị để gửi quà.',
  });
}

/** Chặn thao tác quá nhanh. Đếm theo IP vì lúc này chưa chắc biết là ai. */
async function quaNhanh(c: Context<HonoEnv>, khoa: string, soLan: number): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const limited = await rateLimit(c.env, `${khoa}:${ip}`, soLan, 600);
  return !limited.ok;
}

const CHAM = { ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' };

// ------------------------------------------------------------- đường mã bí mật

studentRoutes.get('/api/hoc/:token', async (c) => {
  const session = await tuMa(c);
  if (!session) return c.json(CHUA_NHAN_RA, 404);
  return xemTrang(c, session);
});

studentRoutes.post('/api/hoc/:token/nop-bai', async (c) => {
  if (await quaNhanh(c, 'nop', 30)) return c.json(CHAM, 429);
  const session = await tuMa(c);
  if (!session) return c.json(CHUA_NHAN_RA, 404);
  return nopBai(c, session);
});

studentRoutes.post('/api/hoc/:token/doi-qua', async (c) => {
  if (await quaNhanh(c, 'qua', 10)) return c.json(CHAM, 429);
  const session = await tuMa(c);
  if (!session) return c.json(CHUA_NHAN_RA, 404);
  return doiQua(c, session);
});

// ------------------------------------------------------- đường đăng nhập

studentRoutes.get('/api/hv/trang', async (c) => {
  const session = await tuPhien(c);
  if (!session) return c.json(CHUA_DANG_NHAP, 401);
  return xemTrang(c, session);
});

studentRoutes.post('/api/hv/nop-bai', async (c) => {
  if (await quaNhanh(c, 'nop', 30)) return c.json(CHAM, 429);
  const session = await tuPhien(c);
  if (!session) return c.json(CHUA_DANG_NHAP, 401);
  return nopBai(c, session);
});

studentRoutes.post('/api/hv/doi-qua', async (c) => {
  if (await quaNhanh(c, 'qua', 10)) return c.json(CHAM, 429);
  const session = await tuPhien(c);
  if (!session) return c.json(CHUA_DANG_NHAP, 401);
  return doiQua(c, session);
});
