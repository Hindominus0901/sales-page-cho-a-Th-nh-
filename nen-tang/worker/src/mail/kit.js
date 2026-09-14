/**
 * Kit (ten cu: ConvertKit) - danh sach nguoi nhan va chuoi email nuoi duong.
 *
 * PHAN VAI RO RANG, doc ky truoc khi sua:
 *
 *   Kit KHONG gui duoc thu giao dich. API v4 chi co subscriber / tag /
 *   sequence / broadcast. Ma OTP va link dat lai mat khau phai den trong vai
 *   giay, gui rieng cho dung mot nguoi - broadcast di qua hang doi gui hang
 *   loat, tre vai phut va tinh theo luot. Vi vay:
 *
 *     - Thu GIAO DICH (OTP, dat lai mat khau, don da thanh toan) -> mail/send.js
 *     - Thu MARKETING (chao mung, nuoi duong, ban tin) -> Kit, qua file nay
 *
 * Cach hoat dong: he thong day nguoi vao Kit kem TAG. Con gui gi, gui luc nao,
 * noi dung ra sao thi chi Thanh tu dung trong giao dien Kit - khong phai nho
 * den lap trinh vien. Ma tag lay tu app_settings nen doi tag cung khong can
 * deploy lai.
 *
 * Nguyen tac: Kit hong thi TUYET DOI khong duoc lam hong dang ky hay webhook
 * thanh toan. Moi loi o day chi ghi log va di tiep.
 */
import { readSettings } from '../settings.js';

const BASE = 'https://api.kit.com/v4';
const TIMEOUT_MS = 8000;

/** Cac tag/sequence admin chon duoc trong trang quan tri. */
export const KIT_SETTING_KEYS = [
  'kit_enabled',
  'kit_tag_lead',        // vua de lai thong tin o funnel
  'kit_tag_member',      // da xac thuc email, thanh tai khoan that
  'kit_tag_customer',    // da mua ve VIP
  'kit_sequence_lead',    // chuoi cho nguoi vua de lai thong tin o trang ban hang
  'kit_sequence_welcome', // chuoi chao mung cho thanh vien da co tai khoan
  'kit_sequence_customer', // chuoi cham soc sau khi mua
];

const newId = () => crypto.randomUUID();

/** Kit da cau hinh chua? (co kho API va chua bi tat trong trang quan tri) */
export function kitConfigured(rc) {
  return !!rc.env.KIT_API_KEY;
}

/**
 * Goi API Kit. Khong bao gio nem loi ra ngoai.
 * @returns {Promise<{ok:boolean, status:number, data:any, error?:string}>}
 */
export async function kitCall(rc, method, path, body) {
  if (!kitConfigured(rc)) {
    return { ok: false, status: 0, data: null, error: 'chua_dat_KIT_API_KEY' };
  }
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'X-Kit-Api-Key': rc.env.KIT_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.errors?.join?.('; ') || data?.error || `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: String(msg).slice(0, 300) };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = err?.name === 'TimeoutError' ? 'qua_han_8s' : String(err?.message || err);
    return { ok: false, status: 0, data: null, error: msg.slice(0, 300) };
  }
}

/** Tao hoac cap nhat nguoi nhan. Kit tra 201 khi moi, 200 khi da co. */
export function kitUpsertSubscriber(rc, { email, firstName, fields }) {
  const body = { email_address: email };
  if (firstName) body.first_name = firstName;
  if (fields && Object.keys(fields).length) body.fields = fields;
  return kitCall(rc, 'POST', '/subscribers', body);
}

/** Gan tag. Kit tu bo qua neu nguoi do da co tag nay. */
export function kitTagSubscriber(rc, tagId, email) {
  return kitCall(rc, 'POST', `/tags/${encodeURIComponent(tagId)}/subscribers`,
    { email_address: email });
}

/**
 * Go tag khoi mot nguoi.
 *
 * Dung khi ho mua VIP: go tag "Lead" di de cac broadcast moi mua VIP khong con
 * ban toi ho nua. Luu y Kit KHONG co duong go nguoi khoi mot CHUOI da vao -
 * viec do phai dat mot rule trong giao dien Kit.
 */
export function kitRemoveTag(rc, tagId, email) {
  return kitCall(rc, 'DELETE',
    `/tags/${encodeURIComponent(tagId)}/subscribers?email_address=${encodeURIComponent(email)}`);
}

/** Dua vao mot chuoi email nuoi duong. */
export function kitAddToSequence(rc, sequenceId, email) {
  return kitCall(rc, 'POST', `/sequences/${encodeURIComponent(sequenceId)}/subscribers`,
    { email_address: email });
}

/** Danh sach tag / sequence / form / custom_fields - de admin chon theo TEN. */
export function kitListResource(rc, kind) {
  const allowed = { tags: '/tags', sequences: '/sequences', forms: '/forms', fields: '/custom_fields' };
  const path = allowed[kind];
  if (!path) return Promise.resolve({ ok: false, status: 0, data: null, error: 'kind_khong_hop_le' });
  return kitCall(rc, 'GET', `${path}?per_page=500`);
}

/** Kiem tra kho API con song khong. */
export function kitPing(rc) {
  return kitCall(rc, 'GET', '/account');
}

async function log(rc, row) {
  try {
    await rc.store.run(
      `INSERT INTO kit_sync_log (id, email, action, status, error, created_at)
       VALUES (?,?,?,?,?,?)`,
      [newId(), row.email, row.action, row.status, row.error || null, new Date().toISOString()],
    );
  } catch (err) {
    console.warn('[kit] khong ghi duoc nhat ky:', err?.message || err);
  }
}

/**
 * Day mot nguoi sang Kit kem tag.
 *
 * @param {object} rc
 * @param {object} p
 * @param {string} p.email
 * @param {string} [p.name]
 * @param {string[]} p.tagKeys  khoa trong app_settings, vd ['kit_tag_lead']
 * @param {object} [p.fields]   truong tuy chon cua Kit (so dien thoai, nguon...)
 * @param {string}  [p.sequenceKey] khoa chuoi email trong app_settings
 * @param {string[]} [p.boTagKeys] tag can GO (vd go "Lead" khi da mua VIP)
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
export async function syncToKit(rc, p) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'thieu_email' };
  if (!kitConfigured(rc)) return { ok: false, skipped: true, error: 'chua_dat_KIT_API_KEY' };

  // Tai khoan Kit la tai khoan THAT cua chi Thanh, dang co hang tram nguoi
  // that. Bo test chay o may tao ra hang chuc dia chi @smoketest.local; neu de
  // chung day sang Kit thi chung nam trong chuoi, va den luc bat email len se
  // bounce hang loat -> uy tin gui thu cua ten mien bi ha, email that roi vao
  // spam. Da tung xay ra that, phai vao don tay 14 dia chi.
  //
  // Vi vay: chi moi truong THAT moi duoc day sang Kit. Muon thu o may thi dat
  // KIT_ALLOW_DEV=1 va tu chiu trach nhiem don dep.
  if (rc.cfg.environment !== 'production' && rc.env.KIT_ALLOW_DEV !== '1') {
    return { ok: false, skipped: true, error: 'bo_qua_ngoai_moi_truong_that' };
  }

  const cfg = await readSettings(rc, KIT_SETTING_KEYS);
  if (cfg.kit_enabled === false) return { ok: false, skipped: true, error: 'da_tat_trong_quan_tri' };

  const action = (p.tagKeys || []).join('+') || 'subscribe';

  const up = await kitUpsertSubscriber(rc, { email, firstName: p.name, fields: p.fields });
  if (!up.ok) {
    await log(rc, { email, action, status: 'failed', error: up.error });
    console.warn('[kit] khong them duoc nguoi nhan:', up.error);
    return { ok: false, error: up.error };
  }

  const problems = [];
  for (const key of p.tagKeys || []) {
    const tagId = cfg[key];
    if (!tagId) continue; // admin chua chon tag cho buoc nay - bo qua, khong phai loi
    const r = await kitTagSubscriber(rc, tagId, email);
    if (!r.ok) problems.push(`${key}: ${r.error}`);
  }

  // Go tag khong con dung nua. Nguoi da mua VIP ma van mang tag "Lead" thi moi
  // broadcast moi mua VIP deu ban toi ho - trong rat te.
  for (const key of p.boTagKeys || []) {
    const tagId = cfg[key];
    if (!tagId) continue;
    const r = await kitRemoveTag(rc, tagId, email);
    // 404 nghia la ho von khong co tag do - khong phai loi.
    if (!r.ok && r.status !== 404) problems.push(`go ${key}: ${r.error}`);
  }

  // Moi buoc co the co chuoi email rieng. Truoc day chi thanh vien moi vao
  // duoc chuoi; nguoi de lai thong tin o trang ban hang chi duoc gan tag roi
  // thoi - ma do moi la nhom dong nhat va can nuoi duong nhat.
  const seqId = p.sequenceKey ? cfg[p.sequenceKey] : null;
  if (seqId) {
    const r = await kitAddToSequence(rc, seqId, email);
    if (!r.ok) problems.push(`chuoi email: ${r.error}`);
  }

  const subId = up.data?.subscriber?.id || null;
  if (problems.length) {
    await log(rc, { email, action, status: 'partial', error: problems.join(' | ').slice(0, 300) });
    return { ok: false, error: problems.join(' | ') };
  }
  await log(rc, { email, action, status: 'ok' });
  return { ok: true, subscriberId: subId };
}

/**
 * Ban di, khong cho ket qua.
 *
 * Dung o moi cho tren duong di cua nguoi dung (dang ky, tra tien): ho khong
 * phai doi Kit tra loi, va Kit hong cung khong lam hong viec chinh.
 */
export function syncToKitAsync(rc, p) {
  rc.waitUntil(syncToKit(rc, p).catch((err) => {
    console.warn('[kit] loi khong bat duoc:', err?.message || err);
  }));
}
