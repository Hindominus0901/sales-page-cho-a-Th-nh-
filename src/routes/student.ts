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

  // admin_note: lý do từ chối. Trước đây cột này không nằm trong câu SELECT nên
  // học viên chỉ thấy "Bị từ chối" mà không bao giờ biết vì sao — trong khi
  // admin đã gõ lý do vào một ô mà họ tưởng là gửi cho học viên.
  const redemptions = await c.env.DB.prepare(
    `SELECT reward_name, cost_coin, status, admin_note, created_at FROM reward_redemptions
     WHERE student_id = ? ORDER BY created_at DESC LIMIT 20`,
  ).bind(session.studentId).all();

  /**
   * Lịch sử nhận xét của cả 21 ngày.
   *
   * `submissions.feedback` bị xoá mỗi lần nộp lại, nên học viên sửa xong là mất
   * chỗ đối chiếu xem mình đã sửa đúng chưa. Lịch sử nằm ở bảng riêng và không
   * bao giờ bị xoá.
   */
  const lichSuNhanXet = await c.env.DB.prepare(
    `SELECT s.day, r.action, r.feedback, r.created_at
     FROM submission_reviews r JOIN submissions s ON s.id = r.submission_id
     WHERE s.enrollment_id = ? AND r.feedback IS NOT NULL
     ORDER BY r.created_at ASC`,
  ).bind(session.enrollmentId).all();

  /**
   * Đề bài 21 ngày.
   *
   * Trước đây học viên vào ngày 1 thấy một ô trống hỏi "Link bài đăng" mà không
   * nói phải đăng gì — đề bài chỉ có trong nhóm Zalo, ai bỏ lỡ tin nhắn ngày 7
   * thì không có chỗ nào tra lại. Lấy theo khoá của học viên, và rơi về hàng
   * dùng chung (cohort NULL) khi khoá đó chưa soạn riêng.
   */
  const noiDung = await c.env.DB.prepare(
    `SELECT day, title, brief, video_url, tips FROM challenge_days
     WHERE COALESCE(cohort,'') IN (COALESCE(?,''), '')
     ORDER BY day, CASE WHEN cohort IS NULL THEN 1 ELSE 0 END`,
  ).bind(session.cohort ?? null).all<{
    day: number; title: string; brief: string | null;
    video_url: string | null; tips: string | null;
  }>();

  // Hàng của đúng khoá thắng hàng dùng chung (ORDER BY ở trên đưa nó lên trước).
  const deBai = new Map<number, unknown>();
  for (const r of noiDung.results ?? []) if (!deBai.has(r.day)) deBai.set(r.day, r);

  /**
   * Bài của cả lớp hôm nay.
   *
   * Chỉ bài ĐÃ ĐƯỢC DUYỆT — bài chờ duyệt là riêng tư cho tới khi team xem xong.
   * Các bài này vốn đã công khai trên Facebook/TikTok, nên không lộ thêm gì; cái
   * lộ ra là việc ai đang đi cùng mình, và đó chính là điểm.
   *
   * Trước mục này, nền tảng không có MỘT tương tác học viên–học viên nào: 21
   * ngày là 21 ngày một mình, trong khi khoá học được bán bằng lời hứa đồng hành.
   */
  const baiCaLop = await c.env.DB.prepare(
    `SELECT s.day, s.post_url, s.channel, st.full_name
     FROM submissions s
     JOIN students st ON st.id = s.student_id
     JOIN enrollments e ON e.id = s.enrollment_id
     WHERE s.status = 'approved'
       AND s.post_url IS NOT NULL
       AND COALESCE(e.cohort,'') = COALESCE(?,'')
       AND date(s.created_at,'unixepoch','+7 hours') >= date('now','+7 hours','-2 days')
     ORDER BY s.created_at DESC LIMIT 40`,
  ).bind(session.cohort ?? null).all();

  return c.json({
    ok: true,
    deBai: Array.from(deBai.values()),
    baiCaLop: baiCaLop.results ?? [],
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
    lichSuNhanXet: lichSuNhanXet.results ?? [],
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

/**
 * Chặn lụt theo IP — hàng rào ngoài, ngưỡng rộng.
 *
 * Chạy TRƯỚC khi biết là ai, nên nó chỉ chặn kẻ bắn hàng loạt bằng mã bịa.
 * Ngưỡng để rộng có chủ ý: nhiều học viên dùng chung một IP là chuyện thường ở
 * Việt Nam (4G qua CGNAT, WiFi văn phòng, hai vợ chồng cùng nhà), và hàng rào
 * này không được phép là thứ chặn họ.
 */
async function lutTuMotIp(c: Context<HonoEnv>, khoa: string): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const limited = await rateLimit(c.env, `${khoa}:ip:${ip}`, 120, 600);
  return !limited.ok;
}

/**
 * Chặn thao tác quá nhanh của MỘT học viên — hàng rào thật.
 *
 * Trước đây chỗ này đếm theo IP với ngưỡng thật (10 lượt đổi quà/10 phút cho cả
 * IP), nên hai người cùng mạng ăn chung hạn mức: ai bấm trước thì người sau nhận
 * "Anh chị thao tác hơi nhanh" dù mới bấm lần đầu. Tệ nhất đúng vào ngày cuối
 * đợt khi cả lớp nộp cùng lúc. Danh tính luôn xác định được ngay trước đó, nên
 * đếm theo người là đúng.
 */
async function quaNhanh(
  c: Context<HonoEnv>, khoa: string, soLan: number, studentId: string,
): Promise<boolean> {
  const limited = await rateLimit(c.env, `${khoa}:hv:${studentId}`, soLan, 600);
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
  if (await lutTuMotIp(c, 'nop')) return c.json(CHAM, 429);
  const session = await tuMa(c);
  if (!session) return c.json(CHUA_NHAN_RA, 404);
  if (await quaNhanh(c, 'nop', 30, session.studentId)) return c.json(CHAM, 429);
  return nopBai(c, session);
});

studentRoutes.post('/api/hoc/:token/doi-qua', async (c) => {
  if (await lutTuMotIp(c, 'qua')) return c.json(CHAM, 429);
  const session = await tuMa(c);
  if (!session) return c.json(CHUA_NHAN_RA, 404);
  if (await quaNhanh(c, 'qua', 10, session.studentId)) return c.json(CHAM, 429);
  return doiQua(c, session);
});

// ------------------------------------------------------- đường đăng nhập

studentRoutes.get('/api/hv/trang', async (c) => {
  const session = await tuPhien(c);
  if (!session) return c.json(CHUA_DANG_NHAP, 401);
  return xemTrang(c, session);
});

studentRoutes.post('/api/hv/nop-bai', async (c) => {
  if (await lutTuMotIp(c, 'nop')) return c.json(CHAM, 429);
  const session = await tuPhien(c);
  if (!session) return c.json(CHUA_DANG_NHAP, 401);
  if (await quaNhanh(c, 'nop', 30, session.studentId)) return c.json(CHAM, 429);
  return nopBai(c, session);
});

studentRoutes.post('/api/hv/doi-qua', async (c) => {
  if (await lutTuMotIp(c, 'qua')) return c.json(CHAM, 429);
  const session = await tuPhien(c);
  if (!session) return c.json(CHUA_DANG_NHAP, 401);
  if (await quaNhanh(c, 'qua', 10, session.studentId)) return c.json(CHAM, 429);
  return doiQua(c, session);
});
