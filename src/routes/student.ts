import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { rateLimit } from '../lib/security/ratelimit';
import {
  sessionFromToken, daySlots, rankFor, rewardsFor, submitDay, redeemReward, currentDay,
} from '../lib/game/student';
import { readMechanics } from '../lib/game/award';

export const studentRoutes = new Hono<HonoEnv>();

/**
 * Mã truy cập nằm trên đường dẫn nên nó lọt vào Referer khi học viên bấm sang
 * trang khác. `no-referrer` cắt đường rò đó; `noindex` giữ link khỏi Google.
 */
studentRoutes.use('/api/hoc/*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Referrer-Policy', 'no-referrer');
  await next();
});

studentRoutes.get('/api/hoc/:token', async (c) => {
  const session = await sessionFromToken(c.env, c.req.param('token'));
  if (!session) return c.json({ ok: false, error: 'Đường link không đúng hoặc đã bị thu hồi.' }, 404);

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
});

studentRoutes.post('/api/hoc/:token/nop-bai', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const limited = await rateLimit(c.env, `nop:${ip}`, 30, 600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' }, 429);
  }

  const session = await sessionFromToken(c.env, c.req.param('token'));
  if (!session) return c.json({ ok: false, error: 'Đường link không đúng hoặc đã bị thu hồi.' }, 404);

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
});

studentRoutes.post('/api/hoc/:token/doi-qua', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const limited = await rateLimit(c.env, `qua:${ip}`, 10, 600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' }, 429);
  }

  const session = await sessionFromToken(c.env, c.req.param('token'));
  if (!session) return c.json({ ok: false, error: 'Đường link không đúng hoặc đã bị thu hồi.' }, 404);

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
});
