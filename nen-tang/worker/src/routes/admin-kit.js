/**
 * Quan tri phan noi voi Kit (ConvertKit).
 *
 * Muc dich: chi Thanh tu chon duoc tag va chuoi email trong giao dien quan tri
 * - chon theo TEN lay thang tu tai khoan Kit, khong phai go tay ma so - roi tu
 * do khong can nho den lap trinh vien nua.
 *
 * Quyen: moi duong trong file nay da di qua requireAdmin o admin.js.
 */
import { json, apiError } from '../lib/respond.js';
import { readSettings } from '../settings.js';
import {
  KIT_SETTING_KEYS, kitConfigured, kitPing, kitListResource, syncToKit,
} from '../mail/kit.js';

/** GET /api/admin/kit/status */
export async function kitStatus(rc) {
  const settings = await readSettings(rc, KIT_SETTING_KEYS);
  const configured = kitConfigured(rc);

  let account = null;
  let error = null;
  if (configured) {
    const ping = await kitPing(rc);
    if (ping.ok) account = ping.data?.account || ping.data || null;
    else error = ping.error;
  } else {
    error = 'Chưa đặt KIT_API_KEY. Chạy: npx wrangler secret put KIT_API_KEY';
  }

  const recent = await rc.store.all(
    'SELECT email, action, status, error, created_at FROM kit_sync_log ORDER BY created_at DESC LIMIT 30',
  ).catch(() => []);

  const tally = await rc.store.all(
    `SELECT status, COUNT(*) AS n FROM kit_sync_log
      WHERE created_at > datetime('now','-7 days') GROUP BY status`,
  ).catch(() => []);

  return json({
    ok: true,
    configured,
    account,
    error,
    settings,
    recent,
    last7days: Object.fromEntries(tally.map((r) => [r.status, r.n])),
    // Noi ro de nguoi doc trang quan tri khong ky vong nham.
    note: 'Kit lo danh sách và chuỗi email nuôi dưỡng. Mã OTP và link đặt lại '
      + 'mật khẩu KHÔNG đi qua Kit — những thư đó phải tới trong vài giây nên '
      + 'gửi bằng nhà cung cấp thư giao dịch riêng.',
  });
}

/** GET /api/admin/kit/lists — tag va sequence de admin chon theo ten */
export async function kitLists(rc) {
  if (!kitConfigured(rc)) {
    return apiError(400, 'kit_chua_cau_hinh',
      'Chưa đặt KIT_API_KEY nên không lấy được danh sách tag.');
  }
  const [tags, sequences, fields] = await Promise.all([
    kitListResource(rc, 'tags'),
    kitListResource(rc, 'sequences'),
    kitListResource(rc, 'fields'),
  ]);

  const pick = (res, key) => (res.ok ? (res.data?.[key] || []) : []);
  const firstError = [tags, sequences, fields].find((r) => !r.ok)?.error || null;

  return json({
    ok: true,
    error: firstError,
    tags: pick(tags, 'tags').map((t) => ({ id: t.id, name: t.name })),
    sequences: pick(sequences, 'sequences').map((s) => ({ id: s.id, name: s.name })),
    fields: pick(fields, 'custom_fields').map((f) => ({ key: f.key, label: f.label })),
  });
}

/** POST /api/admin/kit/test  { email } */
export async function kitTest(rc) {
  const email = String(rc.body?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return apiError(400, 'email_khong_hop_le', 'Email không hợp lệ.');
  }
  const res = await syncToKit(rc, {
    email,
    name: 'Kiểm thử',
    tagKeys: [],
    fields: { nguon: 'kiem-thu-quan-tri' },
  });
  await rc.store.audit('kit.test', email, { ok: res.ok }, rc.ip);
  return json({ ok: res.ok, error: res.error || null, skipped: !!res.skipped });
}

/**
 * POST /api/admin/kit/backfill  { source: 'leads'|'users', after?: string, limit?: number }
 *
 * Day nhung nguoi DA CO tu truoc sang Kit. Lam theo tung dot nho va tra ve moc
 * de goi tiep: mot lan goi khong the day het vai nghin nguoi, va Kit cung gioi
 * han so lan goi.
 */
export async function kitBackfill(rc) {
  if (!kitConfigured(rc)) {
    return apiError(400, 'kit_chua_cau_hinh', 'Chưa đặt KIT_API_KEY.');
  }
  const source = rc.body?.source === 'users' ? 'users' : 'leads';
  const limit = Math.min(Math.max(Number(rc.body?.limit) || 25, 1), 50);
  const after = String(rc.body?.after || '');

  const rows = source === 'users'
    ? await rc.store.all(
      `SELECT id, email, full_name FROM users
        WHERE email IS NOT NULL AND email <> '' AND kit_subscriber_id IS NULL AND id > ?
        ORDER BY id LIMIT ?`, [after, limit])
    : await rc.store.all(
      `SELECT id, email, full_name FROM leads
        WHERE email IS NOT NULL AND email <> '' AND kit_subscriber_id IS NULL AND id > ?
        ORDER BY id LIMIT ?`, [Number(after) || 0, limit]);

  const tagKey = source === 'users' ? 'kit_tag_member' : 'kit_tag_lead';
  let done = 0;
  let failed = 0;
  let cursor = after;

  for (const row of rows) {
    cursor = String(row.id);
    /* eslint-disable no-await-in-loop */
    const res = await syncToKit(rc, {
      email: row.email, name: row.full_name, tagKeys: [tagKey],
    });
    if (res.ok) {
      done += 1;
      // Danh dau da day sang de lan chay sau khong lam lai tu dau.
      await rc.store.run(
        `UPDATE ${source} SET kit_subscriber_id = ? WHERE id = ?`,
        [res.subscriberId || 0, row.id]).catch(() => {});
    } else {
      failed += 1;
    }
    /* eslint-enable no-await-in-loop */
  }

  const left = source === 'users'
    ? await rc.store.get(
      "SELECT COUNT(*) AS n FROM users WHERE email IS NOT NULL AND email <> '' AND kit_subscriber_id IS NULL")
    : await rc.store.get(
      "SELECT COUNT(*) AS n FROM leads WHERE email IS NOT NULL AND email <> '' AND kit_subscriber_id IS NULL");

  await rc.store.audit('kit.backfill', source, { done, failed }, rc.ip);
  return json({
    ok: true, source, done, failed, cursor, remaining: left?.n ?? 0, finished: rows.length < limit,
  });
}
