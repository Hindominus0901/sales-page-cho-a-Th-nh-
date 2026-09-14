/**
 * Gui email qua Resend.
 *
 * Ghi vao bang emails_sent TRUOC khi goi API, voi mot khoa chong trung. Nho vay
 * khi co su co van tra loi duoc cau hoi "khach co nhan duoc ma khong?", va lan
 * gui lai cung mot khoa se khong bao gio gui hai lan.
 *
 * Cloudflare Queues (goi tra phi) se dam nhan viec thu lai o giai doan sau.
 * Hien tai gui thang trong request cho cac mail QUAN TRONG (ma OTP, dat lai mat
 * khau) - de nguoi dung biet ngay neu that bai - va qua ctx.waitUntil cho mail
 * khong quan trong.
 */
const API = 'https://api.resend.com/emails';

const newId = () => crypto.randomUUID();

/**
 * @param {object} rc      boi canh request
 * @param {object} mail    { to, subject, html, text, template, idempotencyKey }
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
export async function sendMail(rc, mail) {
  const { to, subject, html, text, template } = mail;
  const key = mail.idempotencyKey || newId();
  // MAIL_FROM sinh tu brand/brand.json. Ban cu du phong ve
  // mot dia chi cua thuong hieu khac - dia chi do CHI gui duoc cho chinh chu
  // tai khoan Resend, moi nguoi khac bi tu choi 403; nen ai quen dat bien nay
  // se thay "da gui" trong log ma khong hoc vien nao nhan duoc thu, va con mang
  // ten mot thuong hieu khong phai cua ho.
  const from = rc.env.MAIL_FROM;
  if (!from) {
    console.error('[mail] chua dat MAIL_FROM - khong gui gi ca');
    return { ok: false, skipped: true, error: 'chua_dat_MAIL_FROM' };
  }
  const now = new Date().toISOString();

  // Khoa chong trung la UNIQUE -> chen that bai nghia la da gui roi.
  try {
    await rc.store.run(
      `INSERT INTO emails_sent (id, to_addr, template, idempotency_key, status, created_at)
       VALUES (?,?,?,?,'queued',?)`,
      [newId(), to, template, key, now],
    );
  } catch (err) {
    if (/unique|duplicate/i.test(err?.message || '')) return { ok: true, skipped: true };
    throw err;
  }

  if (!rc.env.RESEND_API_KEY) {
    // Chua cau hinh: ghi ra log de con chay duoc o may. KHONG bao gio in noi
    // dung mail ra log tren moi truong that.
    if (rc.cfg.environment !== 'production') {
      console.log(`[mail] (chua co RESEND_API_KEY) ${template} -> ${to}\n${text || ''}`);
    }
    await rc.store.run("UPDATE emails_sent SET status='failed', error=? WHERE idempotency_key=?",
      ['chua dat RESEND_API_KEY', key]);
    return { ok: false, error: 'chua_cau_hinh_email' };
  }

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${rc.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      await rc.store.run("UPDATE emails_sent SET status='failed', error=? WHERE idempotency_key=?",
        [String(data?.message || res.status).slice(0, 300), key]);
      console.warn('[mail] Resend tu choi', res.status, data?.message);
      return { ok: false, error: 'gui_that_bai' };
    }

    await rc.store.run(
      "UPDATE emails_sent SET status='sent', provider_id=?, sent_at=? WHERE idempotency_key=?",
      [data?.id || null, new Date().toISOString(), key]);
    return { ok: true };
  } catch (err) {
    await rc.store.run("UPDATE emails_sent SET status='failed', error=? WHERE idempotency_key=?",
      [String(err?.message || err).slice(0, 300), key]);
    console.warn('[mail] loi khi goi Resend:', err?.message || err);
    return { ok: false, error: 'gui_that_bai' };
  }
}
