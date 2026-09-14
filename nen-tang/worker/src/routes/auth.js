/**
 * Dang ky / dang nhap / quen mat khau.
 *
 * Nhung rui ro da tinh den, va cach xu ly:
 *
 * - DO XEM EMAIL NAO DA CO TAI KHOAN: moi cau tra loi o buoc dang ky va quen
 *   mat khau deu giong het nhau du email co ton tai hay khong. Chi khi nguoi
 *   dung nhap DUNG mat khau (tuc da chung minh la chu tai khoan) he thong moi
 *   noi them thong tin.
 * - DO MAT KHAU: gioi han theo ca IP lan email; khi email khong ton tai van bam
 *   mot mat khau gia de thoi gian phan hoi khong khac nhau.
 * - DO MA OTP: ma 6 so, toi da 5 lan thu, het han 10 phut, dung mot lan.
 * - LAM TRAN HOP THU / DOT TIEN GUI MAIL: gioi han so mail moi email va moi IP.
 * - CHIEM PHIEN: cookie HttpOnly + Secure + SameSite, gia tri ngau nhien va
 *   database chi luu ban bam. Doi mat khau la dang xuat het thiet bi khac.
 * - TU NANG QUYEN: PATCH /me chi nhan dung 4 truong ho so; role/status/diem
 *   deu bi bo qua.
 * - CHUYEN HUONG MO: returnTo bat buoc la duong dan cung ten mien.
 */
import { json, apiError } from '../lib/respond.js';
import { rateLimit, setCookie } from '../lib/http.js';
import { validateEmail, validateName, validatePhone, clean } from '../lib/validate.js';
import {
  hashPassword, verifyPassword, hashOtp, newOtpCode, randomToken, sha256Hex,
} from '../lib/crypto.js';
import {
  createSession, revokeSession, revokeAllSessions, sessionCookieName, SESSION_MAX_AGE, CSRF_COOKIE,
} from '../auth/session.js';
import { loadUser, requireUser, selfUser } from '../auth/guard.js';
import { daDangKyChuongTrinh } from '../functions/index.js';
import { sendMail } from '../mail/resend.js';
import { syncToKitAsync } from '../mail/kit.js';
import { renderMail } from '../mail/templates.js';
import { startFlow, completeFlow, isConfigured } from '../auth/google.js';

const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const RESET_MINUTES = 30;
const HOUR = 60 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** Cau tra loi giong nhau cho moi truong hop - khong lo email nao da ton tai. */
const VAGUE_OK = { ok: true, message: 'Nếu email hợp lệ, chúng tôi đã gửi hướng dẫn tới hộp thư đó.' };

/**
 * Mat khau: du dai va khong qua don gian. Chan luon chuoi cuc dai vi bam mat
 * khau ton CPU - de nguoi ta gui 1MB mat khau la mot kieu lam nghen he thong.
 */
function validatePassword(raw) {
  const password = String(raw ?? '');
  if (password.length < 8) return { error: 'Mật khẩu cần ít nhất 8 ký tự' };
  if (password.length > 200) return { error: 'Mật khẩu quá dài' };
  if (/^\d+$/.test(password)) return { error: 'Mật khẩu không nên chỉ gồm chữ số' };
  return { value: password };
}

/** Duong dan cung ten mien - chan mo chuyen huong sang trang khac. */
const safePath = (value, fallback = '/') => {
  const raw = String(value || '');
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(raw) ? raw : fallback;
};

const setSessionCookie = (rc, token) =>
  setCookie(rc, sessionCookieName(rc), token, { maxAge: SESSION_MAX_AGE, sameSite: 'Lax' });

/** Doi ma CSRF moi lan quyen thay doi. */
const rotateCsrf = (rc) => {
  const token = randomToken();
  setCookie(rc, CSRF_COOKIE, token, { httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
};

const getUserByEmail = (rc, email) =>
  rc.store.get('SELECT * FROM users WHERE email = ?', [email]);

/**
 * Noi tai khoan vua tao voi ban ghi lead cu cung email.
 *
 * Vi sao can: nguoi ta dien form o trang ban hang truoc (thanh mot dong trong
 * bang `leads`, mang theo nguoi gioi thieu, diem, phan khuc), roi vai ngay sau
 * moi tao tai khoan. Neu khong noi lai thi day la HAI NGUOI khac nhau trong
 * mat he thong: trang Dai ly doc `user.legacy_lead_id` de biet thanh vien nay
 * co phai cong tac vien khong, va khong noi thi nhanh do khong bao gio chay.
 *
 * Lay lead SOM NHAT vi cung mot email co the dien form nhieu lan - dong dau
 * tien moi la dong mang thong tin nguoi gioi thieu that.
 *
 * Loi o day khong duoc lam hong viec dang ky: noi duoc thi tot, khong noi duoc
 * thi thoi. Cot `legacy_lead_id` la UNIQUE nen neu lead da bi tai khoan khac
 * nhan roi, UPDATE se nem loi rang buoc - nuot lai.
 */
async function bridgeLead(rc, userId, email) {
  try {
    const lead = await rc.store.get(
      'SELECT id, phone_e164, full_name FROM leads WHERE lower(email) = lower(?) ORDER BY id ASC LIMIT 1',
      [email]);
    if (!lead) return;
    await rc.store.run(
      `UPDATE users SET legacy_lead_id = ?,
         phone_e164 = COALESCE(NULLIF(phone_e164, ''), ?),
         full_name  = COALESCE(NULLIF(full_name, ''), ?)
       WHERE id = ? AND legacy_lead_id IS NULL`,
      [lead.id, lead.phone_e164 || '', lead.full_name || '', userId]);
  } catch (err) {
    console.warn('khong noi duoc lead vao tai khoan', email, err?.message);
  }
}

// --- dang ky ----------------------------------------------------------------
async function issueOtp(rc, email) {
  const code = newOtpCode();
  const pepper = rc.env.OTP_PEPPER || rc.cfg.sessionSecret || 'khong-co-pepper';
  const expires = new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString();

  // Ma cu cua email nay het gia tri ngay khi cap ma moi.
  await rc.store.run(
    "UPDATE otp_codes SET consumed_at = ? WHERE email = ? AND purpose = 'register' AND consumed_at IS NULL",
    [nowIso(), email]);
  await rc.store.run(
    `INSERT INTO otp_codes (id, email, purpose, code_hash, expires_at, ip, created_at)
     VALUES (?,?,'register',?,?,?,?)`,
    [newId(), email, await hashOtp(code, pepper), expires, rc.ip, nowIso()]);

  const mail = renderMail('otp_register', { code, minutes: OTP_MINUTES, brand: rc.cfg.brand });
  return sendMail(rc, { to: email, template: 'otp_register', ...mail });
}

/** POST /api/auth/register  { email, password } */
export async function register(rc) {
  // Chan theo IP de rong tay: o Viet Nam ca mot van phong hay ca lop hoc
  // thuong dung chung mot IP nha mang, siet qua se chan oan nguoi that.
  // Lop chan thuc su la gioi han theo tung email ben duoi.
  const byIp = await rateLimit(rc, `register:${rc.ip}`, 30, HOUR);
  if (!byIp.allowed) {
    return apiError(429, 'rate_limited', 'Bạn thử quá nhiều lần. Vui lòng đợi ít phút.',
      { retry_after: byIp.retryAfter });
  }

  const email = validateEmail(rc.body?.email);
  if (email.error) return apiError(422, 'validation_failed', email.error);
  const password = validatePassword(rc.body?.password);
  if (password.error) return apiError(422, 'validation_failed', password.error);

  const byEmail = await rateLimit(rc, `register-mail:${email.value}`, 5, HOUR);
  if (!byEmail.allowed) return json(VAGUE_OK);

  const existing = await getUserByEmail(rc, email.value);

  if (existing && existing.email_verified) {
    // Email da co chu that: khong ghi de mat khau, khong gui gi ca, va tra ve
    // dung cau tra loi nhu moi truong hop khac.
    //
    // Co y KHONG bao cho chu that biet "co nguoi thu dang ky bang email cua
    // ban": lam vay la bien form dang ky thanh cong cu gui mail lam phien nguoi
    // khac. Ai quen mat khau thi dung chuc nang "Quen mat khau".
    return json(VAGUE_OK);
  }

  const hash = await hashPassword(password.value);

  if (existing) {
    // Da dang ky nhung chua xac thuc: cho dat lai mat khau va gui ma moi.
    await rc.store.run('UPDATE credentials SET password_hash = ?, updated_at = ? WHERE user_id = ?',
      [hash, nowIso(), existing.id]);
  } else {
    const id = newId();
    const t = nowIso();
    await rc.store.batch([
      rc.store.prepare(
        `INSERT INTO users (id, email, email_verified, full_name, role, status, source,
           created_date, updated_date) VALUES (?,?,0,'','member','active','signup',?,?)`,
        [id, email.value, t, t]),
      rc.store.prepare(
        'INSERT INTO credentials (user_id, password_hash, updated_at) VALUES (?,?,?)',
        [id, hash, t]),
    ]);
    await bridgeLead(rc, id, email.value);
  }

  const sent = await issueOtp(rc, email.value);
  // Chua cau hinh nha cung cap email la loi CAU HINH cua he thong, khong phai
  // chuyen rieng cua email nay - noi ra khong lo gi ca. Truoc day nuot im: nguoi
  // dung thay "kiem tra hop thu" roi doi mai mot buc thu khong bao gio den, va
  // tai khoan ket o trang thai chua xac thuc, khong co duong nao di tiep.
  // Tren may lap trinh vien, sendMail() in ma ra console de con lam viec duoc -
  // chi moi truong that moi coi day la loi.
  if (rc.cfg.environment === 'production' && sent && sent.error === 'chua_cau_hinh_email') {
    return apiError(503, 'email_chua_cau_hinh',
      'Hệ thống gửi email chưa được cấu hình nên chưa gửi được mã xác nhận. '
      + 'Vui lòng báo quản trị viên.');
  }
  return json(VAGUE_OK);
}

/** POST /api/auth/resend-otp  { email } */
export async function resendOtp(rc) {
  const email = validateEmail(rc.body?.email);
  if (email.error) return json(VAGUE_OK);

  const limit = await rateLimit(rc, `otp-send:${email.value}`, 5, HOUR);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Bạn yêu cầu mã quá nhiều lần. Vui lòng đợi ít phút.',
      { retry_after: limit.retryAfter });
  }

  const user = await getUserByEmail(rc, email.value);
  if (user && !user.email_verified) await issueOtp(rc, email.value);
  return json(VAGUE_OK);
}

/** POST /api/auth/verify-otp  { email, otp_code } */
export async function verifyOtp(rc) {
  const limit = await rateLimit(rc, `otp-verify:${rc.ip}`, 20, HOUR);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Bạn thử quá nhiều lần. Vui lòng đợi ít phút.');
  }

  const email = validateEmail(rc.body?.email);
  const code = String(rc.body?.otp_code || '').trim();
  if (email.error || !/^\d{6}$/.test(code)) {
    return apiError(400, 'invalid_otp', 'Mã xác nhận không hợp lệ.');
  }

  const row = await rc.store.get(
    `SELECT * FROM otp_codes WHERE email = ? AND purpose = 'register' AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`, [email.value]);

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return apiError(400, 'invalid_otp', 'Mã đã hết hạn. Bấm "Gửi lại mã" để nhận mã mới.');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await rc.store.run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', [nowIso(), row.id]);
    return apiError(429, 'too_many_attempts', 'Sai quá nhiều lần. Hãy yêu cầu mã mới.');
  }

  const pepper = rc.env.OTP_PEPPER || rc.cfg.sessionSecret || 'khong-co-pepper';
  if (row.code_hash !== await hashOtp(code, pepper)) {
    await rc.store.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return apiError(400, 'invalid_otp',
      left > 0 ? `Mã không đúng. Còn ${left} lần thử.` : 'Mã không đúng. Hãy yêu cầu mã mới.');
  }

  const user = await getUserByEmail(rc, email.value);
  if (!user) return apiError(400, 'invalid_otp', 'Mã xác nhận không hợp lệ.');

  await rc.store.batch([
    rc.store.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', [nowIso(), row.id]),
    rc.store.prepare('UPDATE users SET email_verified = 1, updated_date = ? WHERE id = ?',
      [nowIso(), user.id]),
  ]);

  const { token } = await createSession(rc, user.id);
  setSessionCookie(rc, token);
  rotateCsrf(rc);

  rc.waitUntil(sendMail(rc, {
    to: user.email,
    template: 'welcome',
    idempotencyKey: `welcome:${user.id}`,
    ...renderMail('welcome', { appUrl: `${rc.origin}/`, brand: rc.cfg.brand }),
  }).catch(() => {}));

  // Len danh sach Kit va vao chuoi chao mung. Thu tren la thu giao dich (phai
  // den ngay), chuoi duoi la nuoi duong (chi Thanh tu soan trong Kit).
  syncToKitAsync(rc, {
    email: user.email,
    name: user.full_name,
    tagKeys: ['kit_tag_member'],
    sequenceKey: 'kit_sequence_welcome',
  });

  // access_token: null - phien nam trong cookie HttpOnly, khong co token nao
  // de trinh duyet giu. Van tra key nay vi Register.jsx doc no.
  return json({ ok: true, access_token: null, user: selfUser({ ...user, email_verified: 1 }) });
}

// --- dang nhap --------------------------------------------------------------
/** POST /api/auth/login  { email, password } */
export async function login(rc) {
  // Nhu tren: chan theo IP rong, chan theo email chat - do moi la thu ngan
  // duoc viec do mat khau cua mot tai khoan cu the.
  const byIp = await rateLimit(rc, `login-ip:${rc.ip}`, 40, 15 * 60 * 1000);
  if (!byIp.allowed) {
    return apiError(429, 'too_many_attempts', 'Sai quá nhiều lần. Thử lại sau ít phút.',
      { retry_after: byIp.retryAfter });
  }

  const email = validateEmail(rc.body?.email);
  const password = String(rc.body?.password || '');
  const WRONG = () => apiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
  if (email.error || !password) return WRONG();

  const byEmail = await rateLimit(rc, `login-mail:${email.value}`, 8, 15 * 60 * 1000);
  if (!byEmail.allowed) {
    return apiError(429, 'too_many_attempts', 'Sai quá nhiều lần. Thử lại sau ít phút.');
  }

  const user = await getUserByEmail(rc, email.value);
  const cred = user
    ? await rc.store.get('SELECT password_hash FROM credentials WHERE user_id = ?', [user.id])
    : null;

  if (!cred) {
    // Van bam mot lan de thoi gian tra loi khong khac voi truong hop co tai
    // khoan - neu khong, do thoi gian phan hoi la biet email nao ton tai.
    await verifyPassword(password, 'pbkdf2:sha256:210000:00:00');
    return WRONG();
  }
  if (!(await verifyPassword(password, cred.password_hash))) return WRONG();

  // Tu day tro di nguoi goi da chung minh la chu tai khoan, noi ro duoc.
  if (user.status !== 'active') {
    return apiError(403, 'account_locked',
      user.status === 'banned' ? 'Tài khoản đã bị khoá vĩnh viễn.' : 'Tài khoản đang tạm khoá.');
  }
  if (!user.email_verified) {
    await issueOtp(rc, user.email);
    return apiError(403, 'email_not_verified',
      'Email chưa được xác thực. Chúng tôi vừa gửi lại mã xác nhận, kiểm tra hộp thư nhé.');
  }

  // Phien cu (neu co) bi huy truoc khi cap phien moi - chong tan cong "cai san
  // phien" nguoi khac roi doi nan nhan dang nhap vao chinh phien do.
  await revokeSession(rc);
  const { token } = await createSession(rc, user.id);
  setSessionCookie(rc, token);
  rotateCsrf(rc);

  return json({ ok: true, access_token: null, user: selfUser(user) });
}

/** POST /api/auth/logout */
export async function logout(rc) {
  await revokeSession(rc);
  setCookie(rc, sessionCookieName(rc), '', { maxAge: 0 });
  rotateCsrf(rc);
  return json({ ok: true });
}

// --- quen mat khau ----------------------------------------------------------
/** POST /api/auth/reset-request  { email } */
export async function resetRequest(rc) {
  const byIp = await rateLimit(rc, `reset-ip:${rc.ip}`, 20, HOUR);
  if (!byIp.allowed) return json(VAGUE_OK);

  const email = validateEmail(rc.body?.email);
  if (email.error) return json(VAGUE_OK);

  const byEmail = await rateLimit(rc, `reset-mail:${email.value}`, 3, HOUR);
  if (!byEmail.allowed) return json(VAGUE_OK);

  // Kiem cau hinh TRUOC khi tra loi mo ho: chua co nha cung cap email thi khong
  // ai dat lai duoc mat khau, va cau "da gui, kiem tra hop thu" la sai su that.
  // Noi ra khong lo gi vi day la trang thai chung cua he thong.
  if (rc.cfg.environment === 'production' && !rc.env.RESEND_API_KEY) {
    return apiError(503, 'email_chua_cau_hinh',
      'Hệ thống gửi email chưa được cấu hình nên chưa gửi được link đặt lại mật khẩu. '
      + 'Vui lòng báo quản trị viên.');
  }

  const user = await getUserByEmail(rc, email.value);
  if (user && user.status === 'active') {
    const token = randomToken();
    await rc.store.run(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, ip, created_at)
       VALUES (?,?,?,?,?,?)`,
      [newId(), user.id, await sha256Hex(token),
        new Date(Date.now() + RESET_MINUTES * 60 * 1000).toISOString(), rc.ip, nowIso()]);

    const url = `${rc.origin}/reset-password?token=${token}`;
    await sendMail(rc, {
      to: user.email,
      template: 'password_reset',
      ...renderMail('password_reset', { url, minutes: RESET_MINUTES, brand: rc.cfg.brand }),
    });
  }

  // Luon cung mot cau tra loi, du email co ton tai hay khong.
  return json(VAGUE_OK);
}

/** POST /api/auth/reset  { reset_token, new_password } */
export async function resetPassword(rc) {
  const limit = await rateLimit(rc, `reset-use:${rc.ip}`, 10, HOUR);
  if (!limit.allowed) return apiError(429, 'rate_limited', 'Bạn thử quá nhiều lần.');

  const token = String(rc.body?.reset_token || '');
  const password = validatePassword(rc.body?.new_password);
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return apiError(400, 'invalid_token', 'Link đặt lại đã hết hạn hoặc không hợp lệ.');
  }
  if (password.error) return apiError(422, 'validation_failed', password.error);

  const row = await rc.store.get(
    'SELECT * FROM password_resets WHERE token_hash = ?', [await sha256Hex(token)]);
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return apiError(400, 'invalid_token', 'Link đặt lại đã hết hạn hoặc không hợp lệ.');
  }

  const hash = await hashPassword(password.value);
  const t = nowIso();
  await rc.store.batch([
    rc.store.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?', [t, row.id]),
    rc.store.prepare(
      `INSERT INTO credentials (user_id, password_hash, updated_at) VALUES (?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash,
       updated_at = excluded.updated_at`,
      [row.user_id, hash, t]),
    // Dat lai mat khau cung xac thuc luon email - vi ho vua chung minh doc duoc
    // hop thu do.
    rc.store.prepare('UPDATE users SET email_verified = 1, updated_date = ? WHERE id = ?',
      [t, row.user_id]),
  ]);

  // Doi mat khau = dang xuat moi thiet bi. Neu tai khoan bi chiem, day la cach
  // chu that day ke kia ra.
  await revokeAllSessions(rc, row.user_id);
  setCookie(rc, sessionCookieName(rc), '', { maxAge: 0 });

  return json({ ok: true });
}

// --- ho so ------------------------------------------------------------------
/** GET /api/auth/me */
export async function me(rc) {
  const denied = await requireUser(rc);
  if (denied) return denied;

  // Co phai hoc vien cua chuong trinh khong. Giao dien dung co nay de noi ro
  // "ban chua dang ky, dien form o trang chinh" thay vi de nguoi ta bam vao
  // Lop hoc / Thu thach / Doi qua roi an mot loi 403 kho hieu.
  const daDangKy = await daDangKyChuongTrinh(rc);
  return json({ ...selfUser(rc.user), da_dang_ky: daDangKy });
}

/**
 * PATCH /api/auth/me
 * CHI nhan 4 truong ho so. role/status/total_xp/total_coin/email deu bi bo qua -
 * neu khong, ai cung tu dat minh thanh admin duoc.
 */
export async function updateMe(rc) {
  const denied = await requireUser(rc);
  if (denied) return denied;

  const body = rc.body || {};
  const patch = {};

  if (body.full_name !== undefined) {
    const name = validateName(body.full_name);
    if (name.error) return apiError(422, 'validation_failed', name.error);
    patch.full_name = name.value;
  }
  if (body.bio !== undefined) patch.bio = clean(body.bio, 500);
  if (body.phone !== undefined) {
    const raw = String(body.phone || '').trim();
    if (!raw) patch.phone = '';
    else {
      const phone = validatePhone(raw);
      if (phone.error) return apiError(422, 'validation_failed', phone.error);
      patch.phone = phone.value.phone;
    }
  }
  if (body.avatar_url !== undefined) {
    const url = String(body.avatar_url || '').trim();
    // Chi nhan file da tai len he thong nay, hoac anh https tu ben ngoai.
    // Chan javascript: va data: - hai kieu dan ma doc vao trang qua anh dai dien.
    //
    // PHAI co ca '/api/files/': do la duong dan THAT ma POST /api/files tra ve
    // (worker/src/routes/files.js). Truoc day o day chi nhan '/files/' nen tai
    // anh len xong bam Luu la nhan 422 "Duong dan anh khong hop le" - tuc la
    // chuc nang doi anh dai dien chua bao gio dung duoc bang duong tai len,
    // chi dan link ngoai moi luu duoc.
    const okUrl = url === ''
      || url.startsWith('/api/files/')
      || url.startsWith('/files/')
      || /^https:\/\/[\w.-]+\//.test(url);
    if (!okUrl) return apiError(422, 'validation_failed', 'Đường dẫn ảnh không hợp lệ');
    patch.avatar_url = url.slice(0, 500);
  }

  if (!Object.keys(patch).length) return json(selfUser(rc.user));

  const cols = Object.keys(patch);
  await rc.store.run(
    `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_date = ? WHERE id = ?`,
    [...cols.map((c) => patch[c]), nowIso(), rc.user.id]);

  const fresh = await rc.store.get('SELECT * FROM users WHERE id = ?', [rc.user.id]);
  return json(selfUser(fresh));
}

// --- dang nhap bang Google --------------------------------------------------
const redirectTo = (url) => new Response(null, { status: 302, headers: { Location: url } });

/** GET /api/auth/google/start?returnTo=/duong-dan */
export async function googleStart(rc) {
  if (!isConfigured(rc)) {
    return apiError(503, 'google_not_configured',
      'Chưa bật đăng nhập Google. Cần đặt GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET.');
  }
  const limit = await rateLimit(rc, `oauth:${rc.ip}`, 20, HOUR);
  if (!limit.allowed) return apiError(429, 'rate_limited', 'Bạn thử quá nhiều lần.');

  const url = await startFlow(rc, safePath(rc.url.searchParams.get('returnTo')));
  return redirectTo(url);
}

/**
 * GET /api/auth/google/callback
 * Loi khong tra ve JSON ma chuyen ve trang dang nhap kem thong bao - vi day la
 * mot lan chuyen trang that trong trinh duyet, khong phai loi goi API.
 */
// Cau chu cho tung ly do tu choi, viet theo huong "lam gi tiep" chu khong phai
// "hong cho nao". Truong hop hay gap nhat o Viet Nam la mo link trong trinh
// duyet cua Zalo/Facebook: no chan cookie phien nen buoc quay ve luon truot.
const LOI_GOOGLE = {
  trinh_duyet_chan: 'Trình duyệt đang chặn phiên đăng nhập. Nếu bạn mở link trong Zalo hoặc '
    + 'Facebook, hãy bấm "Mở bằng trình duyệt" (Chrome/Safari) rồi đăng nhập lại.',
  thieu_tham_so: 'Trình duyệt đang chặn phiên đăng nhập. Nếu bạn mở link trong Zalo hoặc '
    + 'Facebook, hãy bấm "Mở bằng trình duyệt" (Chrome/Safari) rồi đăng nhập lại.',
  het_han: 'Phiên đăng nhập đã quá 10 phút. Bấm "Đăng nhập bằng Google" lại một lần nữa.',
  email_chua_xac_thuc: 'Email Google này chưa được xác thực. Hãy dùng email khác, '
    + 'hoặc đăng nhập bằng mật khẩu.',
};

export async function googleCallback(rc) {
  const fail = (message) =>
    redirectTo(`${rc.origin}/login?error=${encodeURIComponent(message)}`);

  if (!isConfigured(rc)) return fail('Chưa bật đăng nhập Google');

  let claims;
  let returnTo = '/';
  try {
    const result = await completeFlow(rc);
    claims = result.claims;
    returnTo = safePath(result.returnTo);
  } catch (err) {
    console.warn('[google] tu choi dang nhap:', err?.ma || '', err?.message || err);
    // Sau ly do khac han nhau tung do ve CUNG MOT cau "vui long thu lai". Nguoi
    // dung khong biet phai lam gi, va nguoi ho tro khong biet sua o dau - chi
    // Thanh bao "vao bi loi" va khong ai lan ra duoc them mot chu nao.
    //
    // Chi noi nhung dieu AN TOAN: viec can lam tiep theo. Khong tiet lo state,
    // nonce hay ly do ky thuat - nhung thu do chi giup nguoi do choi.
    return fail(LOI_GOOGLE[err?.ma] || 'Đăng nhập Google không thành công. Vui lòng thử lại.');
  }

  const email = String(claims.email).toLowerCase();
  const t = nowIso();

  const linked = await rc.store.get(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
    ['google', claims.sub]);

  let userId = linked?.user_id;

  if (!userId) {
    const existing = await getUserByEmail(rc, email);
    if (existing) {
      // Noi vao tai khoan san co. An toan vi Google da xac nhan nguoi nay doc
      // duoc hop thu do (da kiem email_verified o buoc truoc).
      userId = existing.id;
      await rc.store.run(
        'UPDATE users SET email_verified = 1, updated_date = ? WHERE id = ?', [t, existing.id]);
    } else {
      userId = newId();
      await rc.store.run(
        `INSERT INTO users (id, email, email_verified, full_name, avatar_url, role, status,
           source, created_date, updated_date)
         VALUES (?,?,1,?,?, 'member','active','google',?,?)`,
        [userId, email, clean(claims.name || '', 120),
          String(claims.picture || '').slice(0, 500), t, t]);
    }
    // Ca hai nhanh: tai khoan moi lan tai khoan cu chua tung duoc noi.
    await bridgeLead(rc, userId, email);
    await rc.store.run(
      `INSERT INTO oauth_accounts (provider, provider_user_id, user_id, email, created_at)
       VALUES ('google',?,?,?,?)`,
      [claims.sub, userId, email, t]);
  }

  const user = await rc.store.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user || user.status !== 'active') return fail('Tài khoản đang bị khoá.');

  // Lay ten va anh tu Google khi ho so con TRONG - o moi lan dang nhap, khong
  // chi lan tao tai khoan.
  //
  // Truoc day `claims.picture` chi duoc luu trong cau INSERT o tren, nen ai
  // dang ky bang email roi moi noi Google (nhanh `existing`) thi khong bao gio
  // co anh. Ma anh dai dien gio la bat buoc de hoan tat ho so - de nguyen se
  // bat ho tu tai anh len du Google da co san.
  //
  // Chi dien vao cho trong, KHONG ghi de: ai da tu doi anh roi thi do la lua
  // chon cua ho, Google khong duoc quyen doi lai.
  const buSung = {};
  if (!user.full_name && claims.name) buSung.full_name = clean(claims.name, 120);
  if (!user.avatar_url && claims.picture) buSung.avatar_url = String(claims.picture).slice(0, 500);
  if (Object.keys(buSung).length) {
    const cot = Object.keys(buSung);
    await rc.store.run(
      `UPDATE users SET ${cot.map((c) => `${c} = ?`).join(', ')}, updated_date = ? WHERE id = ?`,
      [...cot.map((c) => buSung[c]), t, userId]);
    Object.assign(user, buSung);
  }

  // Vao bang Google thi cung la thanh vien that - len danh sach Kit nhu OTP.
  syncToKitAsync(rc, {
    email: user.email,
    name: user.full_name,
    tagKeys: ['kit_tag_member'],
    sequenceKey: 'kit_sequence_welcome',
  });

  await revokeSession(rc);
  const { token } = await createSession(rc, user.id);
  setSessionCookie(rc, token);
  rotateCsrf(rc);

  return redirectTo(`${rc.origin}${returnTo}`);
}

export { safePath, loadUser };
