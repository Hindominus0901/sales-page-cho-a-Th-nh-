/**
 * Bien mot lead vua dien form thanh tai khoan vao duoc webapp.
 *
 * Bai toan: nguoi ta dien form o trang ban hang xong la XONG - ho khong biet
 * ben trong con mot nen tang hoc tap, va cung khong co duong nao vao vi ho chua
 * bao gio dat mat khau. Truoc day ho chi nhan email nuoi duong tu Kit, con tai
 * khoan thi khong ai tao.
 *
 * Cach lam: tao san tai khoan (chua co mat khau), roi gui MOT link dat mat khau
 * han 7 ngay. Bam vao la dat mat khau, xong la o trong webapp luon. Ai thich
 * nhanh hon thi bam "Dang nhap bang Google" - duong Google noi theo email nen
 * ra dung tai khoan nay.
 *
 * Vi sao 7 ngay chu khong phai 60 phut nhu link quen mat khau: day khong phai
 * thao tac nguoi dung vua yeu cau va dang ngoi cho: day la thu ho nhan duoc ma
 * khong doi. Rat nhieu nguoi mo email sau vai ngay. Link het han truoc khi ho
 * kip bam nghia la mat luon nguoi do - trong khi rui ro thap hon han: token
 * chi dat duoc mat khau cho tai khoan chua he co du lieu gi.
 *
 * Nguyen tac: MOI LOI O DAY DEU KHONG DUOC LAM HONG VIEC GHI LEAD. Lead la thu
 * chi Thanh tra tien quang cao de co; email chi la thu tot neu gui duoc.
 */
import { randomToken, sha256Hex } from '../lib/crypto.js';
import { sendMail } from '../mail/resend.js';
import { renderMail } from '../mail/templates.js';

const NGAY = 7;
const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/**
 * @param {object} rc
 * @param {object} lead ban ghi lead vua tao
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function inviteLeadToApp(rc, lead) {
  try {
    const email = String(lead.email || '').trim().toLowerCase();
    if (!email) return { ok: false, reason: 'khong_co_email' };

    // Da co tai khoan roi thi thoi. Gui link dat mat khau cho nguoi dang dung
    // binh thuong la vua lam ho hoang vua tao mot duong chiem tai khoan mien
    // phi cho bat ky ai biet email cua ho.
    const daCo = await rc.store.get('SELECT id FROM users WHERE email = ?', [email]);
    if (daCo) return { ok: false, reason: 'da_co_tai_khoan' };

    const t = nowIso();
    const userId = newId();
    const token = randomToken();
    const hetHan = new Date(Date.now() + NGAY * 24 * 60 * 60 * 1000).toISOString();

    // Mot batch: khong bao gio co tai khoan mo coi khong kem token, hoac nguoc lai.
    await rc.store.batch([
      rc.store.prepare(
        `INSERT INTO users (id, email, email_verified, full_name, phone_e164, role, status,
           source, legacy_lead_id, created_date, updated_date)
         VALUES (?,?,0,?,?, 'member','active','funnel',?,?,?)`,
        [userId, email, lead.full_name || '', lead.phone_e164 || '', lead.id, t, t]),
      rc.store.prepare(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at)
         VALUES (?,?,?,?,?,?)`,
        [newId(), userId, await sha256Hex(token), hetHan, rc.ip, t]),
    ]);

    // Link gioi thieu cua chinh ho, kem luon trong buc thu nay. Truoc day no chi
    // hien o trang cam on: ai dong tab do la mat dau, va khong buc thu nao noi
    // cho ho biet minh CO mot link. Nguoi khong biet minh co link thi khong bao
    // gio chia se - ca chuong trinh gioi thieu chet vi mot chi tiet nho nhu vay.
    //
    // Loi o day chi lam mat cai khoi gioi thieu, khong duoc lam mat ca buc thu:
    // duong vao webapp quan trong hon.
    let refUrl = '';
    let refCode = '';
    try {
      const aff = await rc.affiliates?.getByLead(lead.id);
      if (aff && aff.status === 'active') {
        refUrl = rc.affiliates.links(aff, rc.origin).share_url;
        refCode = aff.code;
      }
    } catch (err) {
      console.error('[invite] khong lay duoc link gioi thieu', err?.stack || err);
    }

    // moi=1 chi de trang doi chu tu "Dat lai mat khau" thanh "Tao mat khau" -
    // khong mang y nghia bao mat nao, may chu khong doc tham so nay.
    // Funnel va webapp dung chung mot ten mien nen rc.origin la dung cho.
    const url = `${rc.origin}/reset-password?token=${token}&moi=1`;
    await sendMail(rc, {
      to: email,
      template: 'invite_app',
      ...renderMail('invite_app', {
        url,
        name: lead.full_name || '',
        days: NGAY,
        refUrl,
        refCode,
        refRate: Math.round((rc.cfg.affiliate?.rate || 0) * 100),
        brand: rc.cfg.brand,
        coGoogle: !!(rc.env.GOOGLE_CLIENT_ID && rc.env.GOOGLE_CLIENT_SECRET),
      }),
    });
    return { ok: true };
  } catch (err) {
    console.error('[invite] khong moi duoc lead vao webapp', err?.stack || err);
    return { ok: false, reason: 'loi' };
  }
}

/**
 * Gui thu bao "da nhan tien" ngay khi ngan hang bao ve.
 *
 * VI SAO CAN: truoc day khong co la thu nao o buoc nay. Khach chuyen 399k xong
 * hop thu im lang tuyet doi - khong biet he thong da nhan chua, khong biet vao
 * lop bang duong nao - nen ho nhan Zalo hoi, viec dang le tu tra loi duoc.
 *
 * CO KEM LINK DAT MAT KHAU HAY KHONG la mot quyet dinh bao mat, khong phai tien
 * ich: chi kem khi tai khoan CHUA co mat khau va CHUA tung dang nhap Google.
 * Gui link dat lai mat khau cho nguoi dang dung binh thuong la mo mot duong
 * chiem tai khoan cho bat ky ai doc duoc hop thu do.
 *
 * Loi o day KHONG duoc lam hong viec ghi nhan thanh toan - tien da ve roi.
 */
export async function guiThuDaThanhToan(rc, order, userId) {
  try {
    const u = await rc.store.get(
      'SELECT id, email, full_name FROM users WHERE id = ?', [userId]);
    const email = String(u?.email || order.customer_email || '').trim().toLowerCase();
    if (!email) return { ok: false, reason: 'khong_co_email' };

    const goc = rc.cfg.appHost ? `https://${rc.cfg.appHost}` : rc.origin;
    let url = '';
    if (u?.id) {
      const [mk, gg] = await Promise.all([
        rc.store.get('SELECT 1 x FROM credentials WHERE user_id = ?', [u.id]),
        rc.store.get('SELECT 1 x FROM oauth_accounts WHERE user_id = ?', [u.id]),
      ]);
      if (!mk && !gg) {
        const token = randomToken();
        const t = nowIso();
        await rc.store.run(
          `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at)
           VALUES (?,?,?,?,?,?)`,
          [newId(), u.id, await sha256Hex(token),
            new Date(Date.now() + NGAY * 24 * 60 * 60 * 1000).toISOString(), rc.ip, t]);
        url = `${goc}/reset-password?token=${token}&moi=1`;
      }
    }

    const soTien = `${Number(order.paid_amount || order.amount || 0).toLocaleString('vi-VN')}đ`;
    await sendMail(rc, {
      to: email,
      template: 'order_paid',
      ...renderMail('order_paid', {
        name: u?.full_name || order.customer_name || '',
        code: order.code,
        amount: soTien,
        url,
        appUrl: `${goc}/login`,
        brand: rc.cfg.brand,
        coGoogle: !!(rc.env.GOOGLE_CLIENT_ID && rc.env.GOOGLE_CLIENT_SECRET),
      }),
    });
    return { ok: true };
  } catch (err) {
    console.error('[invite] khong gui duoc thu da thanh toan', err?.stack || err);
    return { ok: false, reason: 'loi' };
  }
}

/**
 * Gui LAI thu moi vao lop cho mot tai khoan da ton tai.
 *
 * Vi sao can: 87 buc thu dau tien that bai voi ly do "You have reached your
 * daily email sending quota" - han muc gui trong ngay cua Resend. Khong co gi
 * thu lai, nen 87 nguoi co san tai khoan ma khong he biet, va khong co duong
 * nao vao. Ho khong lam gi sai, chi la dang ky nham ngay dong.
 *
 * Moi lan goi tao mot token MOI han 7 ngay - token cu co the da het han. Khong
 * dung lai token cu vi ta chi luu ban bam, khong luu ban goc.
 */
export async function guiLaiThuMoi(rc, user) {
  try {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return { ok: false, reason: 'khong_co_email' };

    const t = nowIso();
    const token = randomToken();
    const hetHan = new Date(Date.now() + NGAY * 24 * 60 * 60 * 1000).toISOString();
    await rc.store.run(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at)
       VALUES (?,?,?,?,?,?)`,
      [newId(), user.id, await sha256Hex(token), hetHan, rc.ip, t]);

    let refUrl = '';
    let refCode = '';
    try {
      const aff = user.legacy_lead_id ? await rc.affiliates?.getByLead(user.legacy_lead_id) : null;
      if (aff && aff.status === 'active') {
        refUrl = rc.affiliates.links(aff, rc.origin).share_url;
        refCode = aff.code;
      }
    } catch { /* thieu link gioi thieu khong duoc chan buc thu */ }

    const url = `${rc.origin}/reset-password?token=${token}&moi=1`;
    const ket = await sendMail(rc, {
      to: email,
      template: 'invite_app',
      ...renderMail('invite_app', {
        url,
        name: user.full_name || '',
        days: NGAY,
        refUrl,
        refCode,
        refRate: Math.round((rc.cfg.affiliate?.rate || 0) * 100),
        brand: rc.cfg.brand,
        coGoogle: !!(rc.env.GOOGLE_CLIENT_ID && rc.env.GOOGLE_CLIENT_SECRET),
      }),
    });
    return { ok: !!ket?.ok, reason: ket?.error || null };
  } catch (err) {
    console.error('[invite] gui lai that bai', err?.stack || err);
    return { ok: false, reason: 'loi' };
  }
}
