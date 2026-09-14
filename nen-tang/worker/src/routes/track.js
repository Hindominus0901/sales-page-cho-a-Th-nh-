import { json, apiError } from '../lib/respond.js';
import { rateLimit } from '../lib/http.js';

const ALLOWED_TYPES = new Set([
  'page_view', 'cta_click', 'video_play', 'form_start', 'form_error',
  'checkout_view', 'checkout_copy', 'checkout_qr_view', 'oto_view', 'oto_decline', 'zalo_click',
]);

/** POST /api/track  Body: { type, page, meta, attribution } */
export async function track(rc) {
  const limit = await rateLimit(rc, `track:${rc.ip}`, rc.cfg.limits.trackPerMinute, 60 * 1000);
  // Do luong khong quan trong bang trai nghiem: qua nhanh thi lang le bo qua,
  // khong bao loi ra trang.
  if (!limit.allowed) return json({ ok: true, throttled: true }, 202);

  const body = rc.body || {};
  const type = String(body.type || '').slice(0, 40);
  if (!ALLOWED_TYPES.has(type)) {
    return apiError(400, 'unknown_event', 'Loại sự kiện không hợp lệ');
  }

  await rc.store.upsertSession(rc.sid, {
    ip: rc.ip, userAgent: rc.userAgent, attribution: body.attribution,
  });
  await rc.store.insertEvent({
    session_id: rc.sid,
    lead_id: Number.isInteger(body.lead_id) ? body.lead_id : null,
    type,
    page: String(body.page || '').slice(0, 60),
    meta: body.meta && typeof body.meta === 'object' ? body.meta : null,
    ip: rc.ip,
  });

  return json({ ok: true }, 202);
}
