import { Hono } from 'hono';
import type { HonoEnv } from '../types';
import { registerFormSchema, fieldErrors } from '../lib/validation/forms';
import { toPhoneNorm } from '../lib/validation/phone';
import { upsertLead } from '../lib/db/leads';
import { track, bumpDailyStats } from '../lib/db/events';
import { rateLimit } from '../lib/security/ratelimit';
import { verifyTurnstile } from '../lib/security/turnstile';
import { generateOrderCode } from '../lib/payments/order-code';
import { transferInfo } from '../lib/payments/sepay';
import { uuid } from '../lib/util/id';
import { now, hoursFromNow } from '../lib/util/datetime';
import { readBody } from './public';
import type { OrderRow } from '../lib/payments/fulfill';

export const checkoutRoutes = new Hono<HonoEnv>();

const ORDER_TTL_HOURS = 48;

/** Tạo đơn. Giữ nguyên hợp đồng /api/register của hệ cũ để JS trang không phải sửa. */
checkoutRoutes.post('/api/register', async (c) => {
  const visitor = c.get('visitor');
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';

  const limited = await rateLimit(c.env, `reg:${ip}`, 8, 600);
  if (!limited.ok) {
    return c.json({ ok: false, error: 'Anh chị thao tác hơi nhanh, thử lại sau ít phút giúp em.' }, 429);
  }

  const parsed = registerFormSchema.safeParse(await readBody(c.req.raw));
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    if (errors._spam) return c.json({ ok: false, error: 'Không gửi được, anh chị thử lại giúp em.' }, 400);
    return c.json({ ok: false, errors }, 400);
  }
  const form = parsed.data;

  if (!await verifyTurnstile(c.env, form['cf-turnstile-response'], c.req.header('cf-connecting-ip') ?? null)) {
    return c.json({ ok: false, error: 'Xác thực chống bot không thành công, anh chị tải lại trang giúp em.' }, 400);
  }

  const product = await c.env.DB.prepare(
    `SELECT id, price FROM products WHERE slug = 'thu-thach-21-ngay' AND is_active = 1`,
  ).first<{ id: string; price: number }>();
  if (!product) return c.json({ ok: false, error: 'Khoá học đang tạm đóng đăng ký.' }, 503);

  const { lead } = await upsertLead(c.env, {
    fullName: form.name,
    phone: form.phone,
    email: form.email,
    source: 'checkout',
    sourcePage: '/dang-ky',
    answers: {
      field: form.field, note: form.note, budget: form.budget,
      timeline: form.timeline, daily_time: form.daily_time,
      channel: form.channel, goal: form.goal,
    },
    scoring: {
      budget: form.budget, timeline: form.timeline, dailyTime: form.daily_time,
      channel: form.channel, goal: form.goal, freeText: [form.note],
    },
    visitor,
  });

  const phoneNorm = toPhoneNorm(form.phone);

  /**
   * Gộp đơn trùng: cùng số điện thoại còn một đơn chưa trả trong 24h thì trả
   * lại chính đơn đó thay vì tạo đơn mới. Giữ hành vi của hệ cũ, và tránh việc
   * khách bấm hai lần rồi chuyển khoản vào mã đơn đã bị bỏ quên.
   */
  const pending = await c.env.DB.prepare(
    `SELECT * FROM orders
     WHERE phone_norm = ? AND status = 'pending' AND created_at > unixepoch() - 86400
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(phoneNorm).first<OrderRow>();

  let order: OrderRow;
  if (pending) {
    order = pending;
  } else {
    const code = await generateOrderCode(c.env);
    const id = uuid();
    const ts = now();
    await c.env.DB.prepare(
      `INSERT INTO orders
         (id, order_code, product_id, lead_id, full_name, phone, phone_norm, email, email_norm,
          field, note, amount_total, amount_paid, status, affiliate_id, visitor_id,
          utm_source, utm_medium, utm_campaign, utm_content,
          ip_hash, user_agent, expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,'pending',?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, code, product.id, lead.id, form.name, form.phone, phoneNorm,
      form.email, form.email.toLowerCase(), form.field, form.note, product.price,
      // Affiliate lấy từ lead trước (đã đóng băng lúc lead ra đời), cookie sau.
      lead.affiliate_id ?? visitor.affiliateId, visitor.visitorId,
      visitor.utm.utm_source, visitor.utm.utm_medium,
      visitor.utm.utm_campaign, visitor.utm.utm_content,
      visitor.ipHash, visitor.userAgent, hoursFromNow(ORDER_TTL_HOURS), ts, ts,
    ).run();

    order = {
      id, order_code: code, product_id: product.id, lead_id: lead.id,
      student_id: null, full_name: form.name, phone: form.phone, phone_norm: phoneNorm,
      email: form.email, email_norm: form.email.toLowerCase(),
      amount_total: product.price, amount_paid: 0, discount: 0, status: 'pending',
      affiliate_id: lead.affiliate_id ?? visitor.affiliateId, paid_at: null,
      expires_at: hoursFromNow(ORDER_TTL_HOURS), created_at: ts,
    };

    await track(c.env, 'checkout_started', visitor, {
      pageKey: 'sales_21d', leadId: lead.id, orderId: id, value: product.price,
    });
    await bumpDailyStats(c.env, 'sales_21d', order.affiliate_id, { orders: 1, leads: 1 });
  }

  return c.json({
    ok: true,
    order: { code: order.order_code, amount: order.amount_total, status: order.status },
    payment: buildPayment(c.env, order),
  });
});

/** Tra cứu đơn — trang thanh toán poll endpoint này. */
checkoutRoutes.get('/api/order/:code', async (c) => {
  const order = await c.env.DB
    .prepare('SELECT * FROM orders WHERE order_code = ?')
    .bind(c.req.param('code').toUpperCase())
    .first<OrderRow>();
  if (!order) return c.json({ ok: false, error: 'Không tìm thấy đơn.' }, 404);

  c.header('Cache-Control', 'no-store');
  return c.json({
    ok: true,
    order: {
      code: order.order_code,
      name: order.full_name,
      status: order.status,
      amount: order.amount_total,
      amountPaid: order.amount_paid,
      remaining: Math.max(0, order.amount_total - order.amount_paid),
      paidAt: order.paid_at,
      expiresAt: order.expires_at,
    },
    // Trả thiếu thì QR đổi sang số tiền còn lại, giữ nguyên nội dung chuyển khoản.
    payment: order.status === 'pending' || order.status === 'partially_paid'
      ? buildPayment(c.env, order)
      : null,
  });
});

/** Khách tự báo "đã chuyển khoản" — chỉ để ghi nhận, không đổi trạng thái đơn. */
checkoutRoutes.post('/api/order/:code/confirm', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const order = await c.env.DB
    .prepare('SELECT id, status FROM orders WHERE order_code = ?')
    .bind(code).first<{ id: string; status: string }>();
  if (!order) return c.json({ ok: false, error: 'Không tìm thấy đơn.' }, 404);

  await track(c.env, 'qr_shown', c.get('visitor'), {
    pageKey: 'sales_21d', orderId: order.id, props: { self_reported: true },
  });
  return c.json({ ok: true, status: order.status });
});

/**
 * QR luôn kèm thông tin chuyển khoản thủ công. Nhiều người mua trên máy tính
 * hoặc dùng app ngân hàng không quét được sẽ gõ tay — gõ sai nội dung là giao
 * dịch rơi vào "chưa khớp" và phải xử lý tay.
 */
function buildPayment(env: HonoEnv['Bindings'], order: OrderRow) {
  const remaining = Math.max(0, order.amount_total - order.amount_paid);
  return transferInfo(env, {
    amount: remaining > 0 ? remaining : order.amount_total,
    description: order.order_code,
  });
}
