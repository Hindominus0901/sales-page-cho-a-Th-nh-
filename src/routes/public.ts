import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { workshopFormSchema, leadMagnetFormSchema, fieldErrors } from '../lib/validation/forms';
import { toPhoneNorm } from '../lib/validation/phone';
import { upsertLead } from '../lib/db/leads';
import { track, bumpDailyStats } from '../lib/db/events';
import { rateLimit } from '../lib/security/ratelimit';
import { uuid } from '../lib/util/id';
import { queueMail } from '../lib/email/outbox';
import { workshopMail } from '../lib/email/templates';
import { now, ictDateTime } from '../lib/util/datetime';

export const publicRoutes = new Hono<HonoEnv>();

/** Cấu hình trang cần khi render: giá, số chỗ còn lại, ngày khai giảng. */
publicRoutes.get('/api/config', async (c) => {
  const product = await c.env.DB.prepare(
    `SELECT slug, name, price, compare_at_price, seats_total, seats_offset, start_date,
            cohort_hien_tai, cohort_khai_giang, cohort_bat_dau_tu
     FROM products WHERE slug = 'thu-thach-21-ngay'`,
  ).first<{
    slug: string; name: string; price: number; compare_at_price: number | null;
    seats_total: number | null; seats_offset: number; start_date: string | null;
    cohort_hien_tai: string | null; cohort_khai_giang: string | null;
    cohort_bat_dau_tu: number | null;
  }>();

  if (!product) return c.json({ ok: false, error: 'chưa có sản phẩm' }, 503);

  // Đếm đơn TỪ MỐC MỞ KHOÁ HIỆN TẠI. Cùng lý do như ở dashboard: đếm cả lịch sử
  // thì mở bán khoá 2 là trang bán báo "hết chỗ" ngay hôm đầu, vì 30 đơn khoá 1
  // đã ăn hết 30 chỗ khoá 2. Chưa đặt mốc thì đếm tất — đúng cho khoá đầu tiên.
  const sold = product.cohort_bat_dau_tu
    ? await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM orders
       WHERE status IN ('paid','overpaid') AND paid_at >= ?`,
    ).bind(product.cohort_bat_dau_tu).first<{ n: number }>()
    : await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM orders WHERE status IN ('paid','overpaid')`,
    ).first<{ n: number }>();

  // Zalo và email hỗ trợ lấy từ SETTINGS, không phải site.config.json.
  //
  // Trước đây hai khoá này sửa được trong /admin, báo "Đã lưu", rồi không nơi
  // nào đọc — anh Thành đổi số Zalo mà trang bán vẫn im. Trong khi nhiều trang
  // bảo khách "nhắn Zalo" mà không có Zalo nào để nhắn. Đọc ở đây là biến ô đó
  // thành thật, và đổi được không cần deploy lại.
  const [zalo, emailHoTro] = await Promise.all([
    getSetting(c.env, 'contact.zalo'),
    getSetting(c.env, 'contact.email'),
  ]);

  const taken = (sold?.n ?? 0) + product.seats_offset;
  const seatsLeft = product.seats_total === null
    ? null
    : Math.max(0, product.seats_total - taken);

  return c.json({
    ok: true,
    price: product.price,
    listPrice: product.compare_at_price,
    seatsTotal: product.seats_total,
    seatsLeft,
    startDate: product.cohort_khai_giang ?? product.start_date,
    cohort: product.cohort_hien_tai,
    contact: { zalo: zalo || null, email: emailHoTro || null },
  });
});

/**
 * Buổi workshop đang mở đăng ký, để trang HỎI TRƯỚC khi hiện form.
 *
 * Trước đây `/workshop` hiện form đầy đủ trong mọi trường hợp, khách điền hết
 * tám ô rồi mới nhận 503 "chưa có buổi nào". Đó không phải trang trống, đó là
 * trang bẫy: nó lấy công của người ta rồi mới từ chối. Mà chuyện chưa có buổi
 * nào lại rất dễ xảy ra — bảng workshop_sessions rỗng lúc mới dựng, và buổi đã
 * bắt đầu quá hai tiếng cũng rơi khỏi điều kiện.
 *
 * Chỉ trả những gì trang cần để quyết định hiện gì; không trả link Zoom —
 * link đó chỉ đưa cho người đã đăng ký.
 */
publicRoutes.get('/api/workshop/buoi-hien-tai', async (c) => {
  const session = await pickWorkshopSession(c.env, c.req.query('session'));
  c.header('Cache-Control', 'no-store');
  return c.json({
    ok: true,
    coBuoi: Boolean(session),
    buoi: session
      ? { slug: session.slug, title: session.title, startsAt: session.starts_at }
      : null,
  });
});

/**
 * Đăng ký workshop — thay hoàn toàn Google Form.
 * Trả về thông tin buổi học để trang cảm ơn hiện link Zoom ngay.
 */
publicRoutes.post('/api/workshop/register', async (c) => {
  const visitor = c.get('visitor');
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';

  const limited = await rateLimit(c.env, `ws:${ip}`, 5, 600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' }, 429);
  }

  const parsed = workshopFormSchema.safeParse(await readBody(c.req.raw));
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // Bẫy bot: trả về như thành công để bot không dò ra cơ chế chặn.
    if (errors._spam) return c.json({ ok: true, registration: { id: 'ok' } });
    return c.json({ ok: false, errors }, 400);
  }
  const form = parsed.data;


  const session = await pickWorkshopSession(c.env, form.session);
  if (!session) {
    return c.json({ ok: false, error: 'Hiện chưa có buổi workshop nào đang mở đăng ký.' }, 503);
  }

  const { lead } = await upsertLead(c.env, {
    fullName: form.name,
    phone: form.phone,
    email: form.email || null,
    source: 'workshop',
    sourcePage: '/workshop',
    answers: {
      field: form.field, stuck: form.stuck, goal_text: form.goal_text,
      daily_time: form.daily_time, channel: form.channel, goal: form.goal,
      workshop_session: session.slug,
    },
    scoring: {
      dailyTime: form.daily_time,
      channel: form.channel,
      goal: form.goal,
      freeText: [form.stuck, form.goal_text],
    },
    visitor,
  });

  const phoneNorm = toPhoneNorm(form.phone);
  // UNIQUE(session_id, phone_norm): đăng ký lại là no-op, không tạo bản ghi trùng.
  await c.env.DB.prepare(
    `INSERT INTO workshop_registrations
       (id, session_id, lead_id, full_name, phone_norm, email_norm, answers_json, affiliate_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(session_id, phone_norm) DO NOTHING`,
  ).bind(
    uuid(), session.id, lead.id, form.name, phoneNorm,
    form.email ? form.email.toLowerCase() : null,
    JSON.stringify({ field: form.field, stuck: form.stuck, goal_text: form.goal_text }),
    visitor.affiliateId, now(),
  ).run();

  // Khoá chống trùng là (buổi, số điện thoại) chứ không phải id dòng đăng ký:
  // dòng đó dùng ON CONFLICT DO NOTHING nên đăng ký lại không sinh id mới, và
  // lấy id ra để làm khoá thì phải truy vấn thêm một lượt chẳng để làm gì.
  await queueMail(c.env, workshopMail(c.env, {
    id: `${session.id}:${phoneNorm}`,
    name: form.name,
    email: form.email || null,
    sessionTitle: session.title,
    whenText: session.starts_at ? ictDateTime(session.starts_at) : null,
    zoomUrl: session.zoom_url || null,
    zaloUrl: session.zalo_group_url || null,
  }));

  await track(c.env, 'lead_created', visitor, { pageKey: 'workshop', leadId: lead.id });
  await bumpDailyStats(c.env, 'workshop', visitor.affiliateId, { leads: 1 });

  return c.json({
    ok: true,
    lead: { code: lead.code, name: lead.full_name },
    session: {
      title: session.title,
      startsAt: session.starts_at,
      zoomUrl: session.zoom_url || null,
      zoomMeetingId: session.zoom_meeting_id || null,
      zoomPasscode: session.zoom_passcode || null,
      zaloGroupUrl: session.zalo_group_url || null,
    },
  });
});

/** Lead magnet "Bản Đồ 21 Ngày" — giữ nguyên hợp đồng API của hệ cũ. */
publicRoutes.post('/api/leads', async (c) => {
  const visitor = c.get('visitor');
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';

  const limited = await rateLimit(c.env, `lead:${ip}`, 8, 600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' }, 429);
  }

  const parsed = leadMagnetFormSchema.safeParse(await readBody(c.req.raw));
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    if (errors._spam) return c.json({ ok: true, lead: { code: 'OK' }, downloadUrl: null, zaloGroupUrl: null });
    return c.json({ ok: false, errors }, 400);
  }
  const form = parsed.data;


  const { lead } = await upsertLead(c.env, {
    fullName: form.name,
    phone: form.phone,
    email: form.email || null,
    source: 'ban_do',
    sourcePage: '/ban-do-21-ngay',
    answers: { magnet: form.magnet },
    scoring: { freeText: [] },
    visitor,
  });

  await track(c.env, 'lead_created', visitor, { pageKey: 'ban_do', leadId: lead.id });
  await bumpDailyStats(c.env, 'ban_do', visitor.affiliateId, { leads: 1 });

  // Chưa cấu hình link thì trả null — trang chỉ hiện lời cảm ơn, không hiện nút chết.
  const [downloadUrl, zaloGroupUrl] = await Promise.all([
    getSetting(c.env, 'lead_magnet.download_url'),
    getSetting(c.env, 'lead_magnet.zalo_group_url'),
  ]);

  return c.json({
    ok: true,
    lead: { code: lead.code, name: lead.full_name },
    downloadUrl,
    zaloGroupUrl,
  });
});

/**
 * Danh sách chờ khi chưa có buổi workshop nào.
 *
 * Không có buổi nào mở đăng ký là chuyện sẽ xảy ra thường xuyên — giữa hai buổi,
 * hoặc lúc mới dựng. Trước đây khách rơi vào ngõ cụt và đi mất. Xin mỗi email là
 * đủ để báo lại, và biến một trang chết thành một trang vẫn thu được người quan
 * tâm. Cố ý KHÔNG đòi tên và số điện thoại: người ở đây chưa nhận lại được gì cả.
 */
publicRoutes.post('/api/workshop/cho-lich', async (c) => {
  const visitor = c.get('visitor');
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';

  const limited = await rateLimit(c.env, `wscho:${ip}`, 5, 600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' }, 429);
  }

  const body = await readBody(c.req.raw) as Record<string, unknown>;
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return c.json({ ok: false, error: 'Email chưa đúng. Anh chị nhập lại giúp em.' }, 400);
  }

  const { lead } = await upsertLead(c.env, {
    // Chưa xin tên và số điện thoại, nên lấy phần trước @ làm tên tạm — đủ để
    // anh Thành nhìn ra ai là ai trong danh sách lead.
    fullName: email.split('@')[0] || email,
    phone: '',
    email,
    source: 'workshop',
    sourcePage: '/workshop',
    // Cờ này phân biệt người CHỜ LỊCH với người đã đăng ký một buổi cụ thể.
    answers: { cho_lich: true },
    scoring: { freeText: [] },
    visitor,
  });

  await track(c.env, 'lead_created', visitor, { pageKey: 'workshop', leadId: lead.id });

  return c.json({ ok: true, message: 'Cảm ơn anh chị. Có lịch buổi mới là Thành báo ngay.' });
});

/** Ghi nhận sự kiện từ trình duyệt (beacon). Luôn trả 204, không chặn trang. */
publicRoutes.post('/api/track', async (c) => {
  try {
    const body = await c.req.json<{ event?: string; pageKey?: string; path?: string }>();
    const allowed = ['page_view', 'cta_click', 'form_start', 'video_play'] as const;
    const name = allowed.find((a) => a === body.event);
    if (name) {
      await track(c.env, name, c.get('visitor'), { pageKey: body.pageKey, path: body.path });
      if (name === 'page_view' && body.pageKey) {
        await bumpDailyStats(c.env, body.pageKey, c.get('visitor').affiliateId, { views: 1 });
      }
    }
  } catch { /* theo dõi hỏng không được làm hỏng trang */ }
  return c.body(null, 204);
});

/** Link giới thiệu rút gọn: /r/MINHANH?to=/ban-do-21-ngay */
publicRoutes.get('/r/:code', (c) => {
  const url = new URL(c.req.url);
  const to = url.searchParams.get('to');
  const safe = !to || !to.startsWith('/') || to.startsWith('//') ? '/' : to.slice(0, 200);
  // Middleware attribution đã ghi click và đặt cookie trước khi tới đây.
  return c.redirect(safe, 302);
});

// ---------------------------------------------------------------- tiện ích

async function pickWorkshopSession(env: HonoEnv['Bindings'], slug?: string) {
  if (slug) {
    const found = await env.DB
      .prepare(`SELECT * FROM workshop_sessions WHERE slug = ? AND status IN ('upcoming','live')`)
      .bind(slug).first<WorkshopSessionRow>();
    if (found) return found;
  }
  return env.DB.prepare(
    `SELECT * FROM workshop_sessions
     WHERE status = 'upcoming' AND starts_at > unixepoch() - 7200
     ORDER BY starts_at ASC LIMIT 1`,
  ).first<WorkshopSessionRow>();
}

interface WorkshopSessionRow {
  id: string; slug: string; title: string; starts_at: number;
  zoom_url: string | null; zoom_meeting_id: string | null;
  zoom_passcode: string | null; zalo_group_url: string | null;
}

async function getSetting(env: HonoEnv['Bindings'], key: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?')
    .bind(key).first<{ value_json: string }>();
  if (!row) return null;
  try {
    const v = JSON.parse(row.value_json);
    return typeof v === 'string' && v.trim() ? v : null;
  } catch { return null; }
}

/** Nhận được cả JSON lẫn form-urlencoded để front-end cũ không phải sửa. */
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try { return await req.json(); } catch { return {}; }
  }
  const form = await req.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export { readBody, getSetting };
