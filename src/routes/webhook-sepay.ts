import { Hono } from 'hono';
import type { HonoEnv, Env } from '../types';
import type { SepayWebhookPayload } from '../lib/payments/sepay';
import { extractOrderCode } from '../lib/payments/order-code';
import { applyPayment, fulfillOrder, type OrderRow } from '../lib/payments/fulfill';
import { timingSafeEqual } from '../lib/security/hash';
import { phoneLast4 } from '../lib/validation/phone';
import { normalizeTransferContent } from '../lib/payments/order-code';
import { uuid } from '../lib/util/id';
import { now } from '../lib/util/datetime';
import { track } from '../lib/db/events';

export const webhookRoutes = new Hono<HonoEnv>();

/**
 * Webhook đối soát chuyển khoản của SePay.
 *
 * Nguyên tắc bao trùm: LUÔN trả 200 khi bản ghi payment đã nằm trong database.
 * Trả lỗi sẽ khiến SePay gửi lại, mà việc gửi lại được vô hiệu hoá bằng
 * UNIQUE(provider, provider_tx_id) — nên retry không bao giờ gây hại, và cũng
 * không cần thiết một khi dữ liệu đã bền.
 */
webhookRoutes.post('/api/webhooks/sepay', async (c) => {
  const env = c.env;
  const ip = c.req.header('cf-connecting-ip') ?? null;

  // ---- 1. Xác thực TRƯỚC khi đọc body.
  const auth = c.req.header('authorization') ?? '';
  const expected = env.SEPAY_WEBHOOK_API_KEY;
  if (!expected) {
    await logWebhook(env, { status: 503, outcome: 'rejected', body: '', ip,
      error: 'SEPAY_WEBHOOK_API_KEY chưa được đặt' });
    return c.json({ success: false, error: 'webhook chưa được cấu hình' }, 503);
  }
  const presented = auth.startsWith('Apikey ') ? auth.slice(7).trim() : '';
  if (!presented || !timingSafeEqual(presented, expected)) {
    await logWebhook(env, { status: 401, outcome: 'rejected', body: '', ip,
      error: 'sai hoặc thiếu Apikey' });
    return c.json({ success: false }, 401);
  }

  // ---- 2. Ghi nguyên văn envelope, luôn luôn.
  const bodyText = await c.req.text();
  let payload: SepayWebhookPayload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    await logWebhook(env, { status: 400, outcome: 'error', body: bodyText, ip,
      error: 'body không phải JSON hợp lệ' });
    return c.json({ success: false, error: 'invalid json' }, 400);
  }

  const txId = String(payload.id ?? '').trim();
  if (!txId) {
    await logWebhook(env, { status: 400, outcome: 'error', body: bodyText, ip,
      error: 'payload thiếu trường id' });
    return c.json({ success: false, error: 'missing id' }, 400);
  }

  const amount = Number(payload.transferAmount ?? 0);
  const direction = payload.transferType === 'out' ? 'out' : 'in';

  // ---- 3. Chống trùng: bản ghi thứ hai của cùng giao dịch không vào được.
  const paymentId = uuid();
  const inserted = await env.DB.prepare(
    `INSERT INTO payments
       (id, provider, provider_tx_id, reference_code, direction, amount, gateway,
        account_number, sub_account, transaction_date, content, accumulated,
        status, raw_json, created_at)
     VALUES (?, 'sepay', ?,?,?,?,?,?,?,?,?,?, 'unmatched', ?, ?)
     ON CONFLICT(provider, provider_tx_id) DO NOTHING`,
  ).bind(
    paymentId, txId, payload.referenceCode ?? null, direction, amount,
    payload.gateway ?? null, payload.accountNumber ?? null, payload.subAccount ?? null,
    payload.transactionDate ?? null, payload.content ?? null,
    payload.accumulated ?? null, bodyText, now(),
  ).run();

  if ((inserted.meta.changes ?? 0) === 0) {
    await logWebhook(env, { status: 200, outcome: 'duplicate', body: bodyText, ip, key: txId });
    return c.json({ success: true, note: 'đã xử lý trước đó' });
  }

  // ---- 4. Tiền đi ra không liên quan tới đơn hàng.
  if (direction !== 'in') {
    await env.DB.prepare(`UPDATE payments SET status = 'ignored' WHERE id = ?`)
      .bind(paymentId).run();
    await logWebhook(env, { status: 200, outcome: 'ignored', body: bodyText, ip, key: txId });
    return c.json({ success: true });
  }

  // ---- 5. Ghép đơn.
  const match = await matchOrder(env, payload, amount);
  if (!match) {
    await env.DB.prepare(`UPDATE payments SET status = 'unmatched', match_method = 'none' WHERE id = ?`)
      .bind(paymentId).run();
    await logWebhook(env, { status: 200, outcome: 'unmatched', body: bodyText, ip, key: txId });
    // Không phải lỗi: giao dịch hiện trong màn hình "chưa khớp" của CMS để gán tay.
    return c.json({ success: true, note: 'chưa khớp được đơn nào' });
  }

  // ---- 6 & 7. Cộng tiền, rồi hoàn tất nếu vừa đủ.
  try {
    const applied = await applyPayment(
      env, match.order, paymentId, amount, match.method,
      { type: 'webhook', label: 'SePay' },
    );

    if (applied.justPaid) {
      await fulfillOrder(env, applied.order, { type: 'webhook', label: 'SePay' });
      await track(env, 'order_paid', null, {
        pageKey: 'sales_21d', orderId: applied.order.id,
        affiliateId: applied.order.affiliate_id, value: applied.order.amount_total,
      });
    }

    await logWebhook(env, { status: 200, outcome: 'processed', body: bodyText, ip, key: txId });
    return c.json({ success: true });
  } catch (err) {
    // Payment đã bền ở bước 3 nên không mất tiền của ai. Ghi lỗi để gán tay.
    const message = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(`UPDATE payments SET status = 'manual_review' WHERE id = ?`)
      .bind(paymentId).run();
    await logWebhook(env, { status: 200, outcome: 'error', body: bodyText, ip, key: txId, error: message });
    console.error('[sepay] lỗi khi hoàn tất đơn:', message);
    return c.json({ success: true, note: 'đã ghi nhận, cần xử lý tay' });
  }
});

/**
 * Ghép giao dịch với đơn hàng.
 *
 * Ưu tiên 1 — mã đơn trong nội dung chuyển khoản. Đây là đường chính, và là
 * lý do trang thanh toán hiện nội dung CK trong ô to kèm nút copy.
 *
 * Ưu tiên 2 (dự phòng, chỉ khi không đọc được mã) — khớp ĐÚNG số tiền với
 * DUY NHẤT MỘT đơn đang chờ trong 48h mà 4 số cuối điện thoại xuất hiện trong
 * nội dung. Đòi cả ba điều kiện vì ghép nhầm đơn tệ hơn nhiều so với để giao
 * dịch chưa khớp: chưa khớp thì admin gán tay trong một cú bấm, còn ghép nhầm
 * thì hai người cùng bị sai và có thể phát sinh hoa hồng cho nhầm CTV.
 */
async function matchOrder(
  env: Env,
  payload: SepayWebhookPayload,
  amount: number,
): Promise<{ order: OrderRow; method: 'auto_code' | 'auto_amount_phone' } | null> {
  const code = extractOrderCode(env, payload.code, payload.content, payload.description);

  if (code) {
    const order = await env.DB
      .prepare(`SELECT * FROM orders WHERE order_code = ?`)
      .bind(code)
      .first<OrderRow>();
    // Đơn hết hạn trả tiền muộn vẫn khớp — không bao giờ xoá đơn chờ.
    if (order && order.status !== 'cancelled' && order.status !== 'refunded') {
      return { order, method: 'auto_code' };
    }
  }

  const haystack = normalizeTransferContent(
    [payload.code, payload.content, payload.description].filter(Boolean).join(' '),
  );
  if (!haystack) return null;

  const candidates = await env.DB.prepare(
    `SELECT * FROM orders
     WHERE status IN ('pending','partially_paid')
       AND amount_total = ?
       AND created_at > unixepoch() - 172800
     ORDER BY created_at DESC
     LIMIT 10`,
  ).bind(amount).all<OrderRow>();

  const matched = (candidates.results ?? []).filter(
    (o) => haystack.includes(phoneLast4(o.phone_norm)),
  );

  // Đúng một ứng viên thì mới nhận. Hai ứng viên trở lên là mơ hồ → để tay.
  return matched.length === 1 ? { order: matched[0]!, method: 'auto_amount_phone' } : null;
}

async function logWebhook(
  env: Env,
  e: { status: number; outcome: string; body: string; ip: string | null; key?: string; error?: string },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO webhook_events (id, provider, event_key, http_status, outcome, error, body_text, ip, created_at)
       VALUES (?, 'sepay', ?,?,?,?,?,?,?)`,
    ).bind(uuid(), e.key ?? null, e.status, e.outcome, e.error ?? null,
      e.body.slice(0, 20000), e.ip, now()).run();
  } catch (err) {
    console.error('[sepay] không ghi được webhook_events', err);
  }
}
