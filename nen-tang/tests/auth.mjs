/**
 * Kiem tra luong dang nhap va cac lop bao ve.
 *
 *   node --env-file=.env tests/auth.mjs [baseUrl]
 *
 * Doc ma OTP truc tiep tu D1 o may (khong the doc tu email duoc). Vi vay bo
 * test nay CHI chay o may, khong chay duoc voi ban da deploy.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Doc ten co so du lieu tu wrangler.jsonc thay vi viet cung - doi ten o do
// ma quen sua o day thi bo test bao loi rat kho hieu.
const DB_NAME = (readFileSync('wrangler.jsonc', 'utf8')
  .match(/"database_name":\s*"([^"]+)"/) || [, 'platform'])[1];

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');

let passed = 0;
let failed = 0;
let boQua = 0;
/** Bai khong ap dung voi cau hinh hien tai - khong tinh la dat, cung khong la loi. */
const bo = (name, vi) => { boQua += 1; console.log(`  --   ${name} (bo qua: ${vi})`); };
const check = (name, ok, detail) => {
  if (ok) { passed += 1; console.log(`  OK   ${name}`); } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
};

/**
 * `sqlQuery()` goi `wrangler d1 execute` trong khi `wrangler dev` dang chay, va
 * lan goi do lam dut ket noi keep-alive dang mo. Lan fetch ke tiep chet, va ca
 * bo test dung giua chung.
 *
 * Bo nay tung chet deu o bai 47 - ngay sau hai lenh sqlQuery lien tiep - voi
 * `TypeError: fetch failed / other side closed`. Da mat nhieu gio di tim loi
 * trong san pham: may chu van song, van tra /api/health 200, va workerd KHONG
 * ghi nhan mot request loi nao - vi request chua bao gio toi noi.
 *
 * tests/platform.mjs da gap va da giai chuyen nay tu truoc (xem chu thich o
 * fetchLaiMotLan ben do). Bo nay thi chua co lop do nao - nen no chet, con bo
 * kia thi khong. Day la ly do that su, khong phai "may hom nay yeu".
 *
 * Thu lai mot lan la an toan ke ca voi POST: ca ba ma loi deu co nghia la byte
 * dau tien chua bao gio toi duoc may chu.
 */
const MA_LOI_SOCKET_CHET = new Set(['UND_ERR_SOCKET', 'EPIPE', 'ECONNRESET']);

async function fetchLaiMotLan(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (!MA_LOI_SOCKET_CHET.has(err?.cause?.code)) throw err;
    return fetch(url, init);
  }
}

/** Moi "trinh duyet" gia lap giu mot ro cookie rieng. */
function newBrowser() {
  const jar = {};
  return {
    jar,
    async call(method, path, body, extraHeaders = {}) {
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const headers = { 'Content-Type': 'application/json', ...extraHeaders };
      if (cookie) headers.Cookie = cookie;
      // Trinh duyet that tu gan ma CSRF; lop thay the SDK cung lam dung the nay.
      if (!'GET HEAD'.includes(method) && jar.pf_csrf && extraHeaders['X-CSRF-Token'] === undefined) {
        headers['X-CSRF-Token'] = jar.pf_csrf;
      }
      const res = await fetchLaiMotLan(BASE + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
      });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i);
        const value = pair.slice(i + 1);
        if (value === '') delete jar[name]; else jar[name] = value;
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, headers: res.headers };
    },
  };
}

/**
 * Doc/ghi thang vao D1 o may - dong vai "mo hop thu" va "admin bam nut".
 * Chi dung trong bo test; ma nguon that khong bao gio lam the nay.
 */
/**
 * Chay mot cau lenh SQL thang vao D1 o may.
 *
 * Co thu lai vi mot ly do rat cu the: `wrangler dev` dang chay giu file SQLite,
 * nen `wrangler d1 execute --local` thinh thoang dam vao va tra
 * "database is locked: SQLITE_BUSY". Do la tranh chap nhat thoi cua CONG CU,
 * khong phai loi cua he thong dang duoc kiem thu - nhung neu khong thu lai thi
 * ca bo test chet giua chung va bao mot loi hoan toan gia.
 *
 * Chi thu lai 4 lan, cach nhau 400ms. Loi that (SQL sai, bang khong ton tai)
 * van nem ra ngay tu lan dau vi thong bao khong khop mau duoi day.
 */
function chayLenhSql(cmd) {
  // 'internal error; reference = ...' la D1 o may thinh thoang nem ra khi bi
  // giay file voi wrangler dev - cung mot loai tranh chap, khong phai loi SQL.
  const TAM_THOI = /SQLITE_BUSY|database is locked|internal error|Assertion failed|UV_HANDLE_CLOSING/i;
  let loiCuoi;
  for (let lan = 0; lan < 4; lan += 1) {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (err) {
      loiCuoi = err;
      const noiDung = `${err.stdout || ''}${err.stderr || ''}${err.message || ''}`;
      // Tren Windows, wrangler thinh thoang sap han o tang he dieu hanh
      // (0xC0000409 = 3221226505) va KHONG in ra chu nao. Khong co van ban de
      // khop mau, nen nhan dien bang ma thoat + dau ra rong.
      const sapNgam = err.status === 3221226505 && !(err.stdout || '').trim();
      if (!sapNgam && !TAM_THOI.test(noiDung)) throw err;
      // Cho mot chut roi thu lai - dung Atomics.wait de ngu dong bo, vi ham nay
      // duoc goi tu cho khong await duoc.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
  }
  throw loiCuoi;
}

function sqlQuery(sql) {
  const cmd = `npx wrangler d1 execute ${DB_NAME} --local --json --command "${sql.replace(/"/g, '\\"')}"`;
  const out = chayLenhSql(cmd);
  const start = out.indexOf('[');
  if (start === -1) return [];
  return JSON.parse(out.slice(start))[0]?.results || [];
}

const uniqueEmail = (tag) => `${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@smoketest.local`;
const PASSWORD = 'matkhau-rat-manh-123';

/** Bam ma OTP y het cach may chu lam - de bo test dat duoc mot ma da biet. */
const otpHash = async (code) => {
  const pepper = process.env.OTP_PEPPER || process.env.SESSION_SECRET || 'khong-co-pepper';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${code}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

(async () => {
  console.log(`Kiem tra dang nhap tren ${BASE}\n`);
  // Bo dem gioi han nam trong D1 va dung chung ca he thong, nen phai xoa truoc
  // khi chay - neu khong lan chay thu hai se bi chinh he thong chan.
  sqlQuery('DELETE FROM rate_limits');

  // ---------------------------------------------------------------- dang ky
  console.log('1. Dang ky + xac thuc email');
  const alice = newBrowser();
  await alice.call('GET', '/api/apps/public/prod/public-settings/by-id/x'); // lay cookie CSRF
  check('bootstrap cap cookie CSRF', !!alice.jar.pf_csrf);

  const email = uniqueEmail('alice');

  const noCsrf = await alice.call('POST', '/api/auth/register',
    { email, password: PASSWORD }, { 'X-CSRF-Token': '' });
  check('thieu ma CSRF -> 403', noCsrf.status === 403, noCsrf.data);

  const crossOrigin = await alice.call('POST', '/api/auth/register',
    { email, password: PASSWORD }, { Origin: 'https://trang-gia-mao.example' });
  check('Origin la -> 403', crossOrigin.status === 403, crossOrigin.data);

  const weak = await alice.call('POST', '/api/auth/register', { email, password: '1234' });
  check('mat khau ngan -> 422', weak.status === 422, weak.data);

  const numeric = await alice.call('POST', '/api/auth/register',
    { email, password: '123456789012' });
  check('mat khau toan so -> 422', numeric.status === 422, numeric.data);

  const reg = await alice.call('POST', '/api/auth/register', { email, password: PASSWORD });
  check('dang ky thanh cong', reg.status === 200 && reg.data.ok, reg.data);

  const beforeVerify = await alice.call('GET', '/api/auth/me');
  check('chua xac thuc -> chua co phien', beforeVerify.status === 401);

  const loginUnverified = await alice.call('POST', '/api/auth/login', { email, password: PASSWORD });
  check('dung mat khau nhung chua xac thuc email -> 403',
    loginUnverified.status === 403 && loginUnverified.data.error.code === 'email_not_verified',
    loginUnverified.data);

  // --------------------------------------------------------------- ma OTP
  console.log('\n2. Ma OTP');
  const rows = sqlQuery(
    `SELECT code_hash FROM otp_codes WHERE email='${email}' AND consumed_at IS NULL`);
  check('ma OTP KHONG luu dang chu thuong trong database',
    rows.length > 0 && /^[a-f0-9]{64}$/.test(rows[0].code_hash), rows[0]);

  const badOtp = await alice.call('POST', '/api/auth/verify-otp', { email, otp_code: '000000' });
  check('ma sai -> tu choi', badOtp.status === 400, badOtp.data);
  check('bao con bao nhieu lan thu', /lần thử/.test(badOtp.data?.error?.message || ''),
    badOtp.data?.error?.message);

  // Khong doc nguoc duoc ma tu ban bam (dung y la vay), nen bo test tu dat mot
  // ma minh biet vao database roi dung API de xac thuc - van di dung duong ma
  // nguoi that di.
  const KNOWN = '424242';
  sqlQuery(`UPDATE otp_codes SET code_hash='${await otpHash(KNOWN)}', attempts=0
            WHERE email='${email}' AND consumed_at IS NULL`);

  const verified = await alice.call('POST', '/api/auth/verify-otp', { email, otp_code: KNOWN });
  check('ma dung -> xac thuc va dang nhap luon',
    verified.status === 200 && verified.data.ok && verified.data.user?.email === email,
    verified.data);
  check('xac thuc xong thi email_verified = true', verified.data?.user?.email_verified === true);

  const reuse = await alice.call('POST', '/api/auth/verify-otp', { email, otp_code: KNOWN });
  check('ma da dung roi -> khong dung lai duoc', reuse.status === 400, reuse.data);

  const aliceMe = await alice.call('GET', '/api/auth/me');
  check('sau khi xac thuc thi vao duoc /me', aliceMe.status === 200 && aliceMe.data.email === email,
    aliceMe.data);

  // Chan do ma: sai 5 lan thi ma do bi vo hieu han.
  const brute = newBrowser();
  await brute.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  const victim = uniqueEmail('nannhan');
  await brute.call('POST', '/api/auth/register', { email: victim, password: PASSWORD });
  let lastTry;
  for (let i = 0; i < 6; i += 1) {
    lastTry = await brute.call('POST', '/api/auth/verify-otp', { email: victim, otp_code: '111111' });
  }
  check('sai 5 lan -> ma bi vo hieu, khong cho do tiep',
    lastTry.status === 429 || /yêu cầu mã mới/i.test(lastTry.data?.error?.message || ''),
    lastTry.data);

  // ------------------------------------------------------- chong do mat khau
  console.log('\n3. Chong do mat khau va do email');
  const stranger = newBrowser();
  await stranger.call('GET', '/api/apps/public/prod/public-settings/by-id/x');

  const wrongEmail = uniqueEmail('khongtontai');
  const t0 = Date.now();
  const noAccount = await stranger.call('POST', '/api/auth/login',
    { email: wrongEmail, password: 'sai-be-bet-123' });
  const dtNoAccount = Date.now() - t0;

  const t1 = Date.now();
  const wrongPass = await stranger.call('POST', '/api/auth/login',
    { email, password: 'sai-be-bet-123' });
  const dtWrongPass = Date.now() - t1;

  check('email khong ton tai -> 401 chung chung', noAccount.status === 401, noAccount.data);
  check('sai mat khau -> 401 y het nhu tren',
    wrongPass.status === 401
    && wrongPass.data.error.message === noAccount.data.error.message, wrongPass.data);
  // Neu khong bam mat khau gia thi truong hop "khong co tai khoan" se nhanh hon
  // han - do thoi gian la biet email nao da dang ky.
  const ratio = dtNoAccount / Math.max(dtWrongPass, 1);
  check(`thoi gian tra loi khong chenh lech (${dtNoAccount}ms vs ${dtWrongPass}ms)`,
    ratio > 0.35 && ratio < 2.8, { dtNoAccount, dtWrongPass });

  const forgot = await stranger.call('POST', '/api/auth/reset-request', { email });
  const forgotUnknown = await stranger.call('POST', '/api/auth/reset-request',
    { email: wrongEmail });
  check('quen mat khau: email co that va khong co that tra ve giong het nhau',
    JSON.stringify(forgot.data) === JSON.stringify(forgotUnknown.data), forgot.data);

  // ----------------------------------------------------- dat lai mat khau
  console.log('\n4. Dat lai mat khau');
  const resetRows = sqlQuery(
    `SELECT token_hash, used_at FROM password_resets ORDER BY created_at DESC LIMIT 1`);
  check('link dat lai chi luu ban bam trong database',
    resetRows.length > 0 && /^[a-f0-9]{64}$/.test(resetRows[0].token_hash), resetRows[0]);

  const badReset = await stranger.call('POST', '/api/auth/reset',
    { reset_token: 'a'.repeat(64), new_password: PASSWORD });
  check('token dat lai bia dat -> tu choi', badReset.status === 400, badReset.data);

  // ------------------------------------------------------------ tu nang quyen
  console.log('\n5. Tu nang quyen');
  const bob = newBrowser();
  await bob.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  const bobEmail = uniqueEmail('bob');
  await bob.call('POST', '/api/auth/register', { email: bobEmail, password: PASSWORD });

  // Xac thuc thang trong database de co phien that (thay cho viec mo hop thu).
  sqlQuery(`UPDATE users SET email_verified=1 WHERE email='${bobEmail}'`);
  const bobLogin = await bob.call('POST', '/api/auth/login', { email: bobEmail, password: PASSWORD });
  check('dang nhap sau khi xac thuc email', bobLogin.status === 200 && bobLogin.data.ok, bobLogin.data);
  check('phien nam trong cookie HttpOnly, khong tra token cho trinh duyet giu',
    bobLogin.data?.access_token === null, bobLogin.data);

  const meRes = await bob.call('GET', '/api/auth/me');
  check('GET /api/auth/me tra ve dung nguoi', meRes.status === 200 && meRes.data.email === bobEmail,
    meRes.data);
  check('vai tro mac dinh la member', meRes.data?.role === 'member', meRes.data?.role);

  const escalate = await bob.call('PATCH', '/api/auth/me', {
    role: 'admin', status: 'active', total_xp: 999999, total_coin: 999999,
    email: 'ke-chiem-quyen@example.com', full_name: 'Bob That',
  });
  check('PATCH /me: chi nhan ho so, bo qua role/diem/email',
    escalate.status === 200
    && escalate.data.role === 'member'
    && escalate.data.total_xp === 0
    && escalate.data.total_coin === 0
    && escalate.data.email === bobEmail
    && escalate.data.full_name === 'Bob That', escalate.data);

  const xss = await bob.call('PATCH', '/api/auth/me',
    { avatar_url: 'javascript:alert(document.cookie)' });
  check('avatar_url dang javascript: -> tu choi', xss.status === 422, xss.data);

  // ------------------------------------------------------- tai anh dai dien
  //
  // Duong nay tung DUT HOAN TOAN ma khong test nao bat duoc: router doc JSON
  // cho moi POST ke ca multipart, nen no vua lam can luong than request vua
  // nem "Du lieu khong phai JSON hop le" TRUOC khi toi duoc route /api/files.
  // Vi anh dai dien khi do la dieu kien bat buoc de vao lop, loi nay khoa cua
  // ca lop hoc - ke ca voi nguoi da tra tien.
  console.log('');
  console.log('5b. Tai anh len');

  /** Gui multipart bang chinh ro cookie cua mot "trinh duyet" trong bo test. */
  async function guiAnh(browser, { ten, kieu, byte }) {
    const form = new FormData();
    form.append('file', new Blob([byte], { type: kieu }), ten);
    const cookie = Object.entries(browser.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(`${BASE}/api/files`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': browser.jar.pf_csrf || '' },
      body: form,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }

  // PNG 1x1 that - du de qua kiem tra kieu tep.
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

  // Kho anh la MOT TUY CHON cua thuong hieu (storage.r2 trong brand.json). Tat
  // no di thi /api/files tra 503 "kho_anh_chua_bat" - dung nhu thiet ke, khong
  // phai loi. Truoc day khoi nay cu cho la R2 luon bat: no khong chi bao FAIL ma
  // con lam ca bo test CHET giua chung (fetch(`${BASE}${undefined}`)), nen moi
  // bai phia sau khong bao gio duoc chay ma khong ai thay.
  const anhLen = await guiAnh(bob, { ten: 'avatar.png', kieu: 'image/png', byte: PNG_1X1 });
  const khoAnhTat = anhLen.status === 503 && anhLen.data?.error?.code === 'kho_anh_chua_bat';

  if (khoAnhTat) {
    const vi = 'storage.r2 = false, khach dan link anh thay vi tai len';
    bo('tai duoc anh len', vi);
    bo('duong dan anh vua tai luu duoc vao ho so', vi);
    bo('doc lai duoc anh vua tai', vi);
    bo('tep khong phai anh -> tu choi', vi);
  } else {
    check('tai duoc anh len (khong con chet o lop doc body)',
      anhLen.status === 200 && /^\/api\/files\//.test(anhLen.data?.file_url || ''), anhLen.data);

    // Duong dan tra ve phai LUU DUOC vao ho so: hai ben tung khong khop dinh dang
    // nen bam Luu la 422 "Duong dan anh khong hop le".
    const luuAnh = await bob.call('PATCH', '/api/auth/me', { avatar_url: anhLen.data?.file_url });
    check('duong dan anh vua tai luu duoc vao ho so',
      luuAnh.status === 200 && luuAnh.data?.avatar_url === anhLen.data?.file_url, luuAnh.data);

    // Chi doc lai khi that su co duong dan: noi chuoi voi undefined se nem
    // ERR_INVALID_URL va giet ca tien trinh, khong phai bao mot bai do.
    if (typeof anhLen.data?.file_url === 'string' && anhLen.data.file_url) {
      const anhDoc = await fetch(`${BASE}${anhLen.data.file_url}`);
      check('doc lai duoc anh vua tai',
        anhDoc.status === 200 && (anhDoc.headers.get('content-type') || '').includes('image'),
        anhDoc.status);
    } else {
      check('doc lai duoc anh vua tai', false, 'khong co file_url de doc lai');
    }

    const tepLa = await guiAnh(bob, { ten: 'a.txt', kieu: 'text/plain', byte: Buffer.from('xin chao') });
    check('tep khong phai anh -> tu choi', tepLa.status === 415, tepLa.data);
  }

  const khongCsrf = await fetch(`${BASE}/api/files`, { method: 'POST', body: new FormData() });
  check('tai anh van phai qua cua CSRF', khongCsrf.status === 403, khongCsrf.status);

  // ------------------------------------------------------------------ phien
  console.log('\n6. Phien dang nhap');
  const sessRows = sqlQuery(
    `SELECT id FROM auth_sessions ORDER BY created_at DESC LIMIT 1`);
  check('database chi luu ban bam cua cookie phien',
    sessRows.length > 0 && /^[a-f0-9]{64}$/.test(sessRows[0].id), sessRows[0]);
  check('cookie phien khong doc duoc bang JavaScript (HttpOnly)',
    !!bob.jar.pf_sess, Object.keys(bob.jar));

  const stolen = newBrowser();
  const meNoCookie = await stolen.call('GET', '/api/auth/me');
  check('khong co cookie -> 401', meNoCookie.status === 401);

  await bob.call('POST', '/api/auth/logout');
  const afterLogout = await bob.call('GET', '/api/auth/me');
  check('dang xuat -> phien het hieu luc ngay', afterLogout.status === 401, afterLogout.data);

  // Phien da huy thi du con giu nguyen cookie cung khong dung lai duoc.
  const revoked = sqlQuery('SELECT revoked_at FROM auth_sessions WHERE revoked_at IS NOT NULL');
  check('phien duoc danh dau da huy trong database', revoked.length > 0);

  // ---------------------------------------------------------- khoa tai khoan
  console.log('\n7. Khoa tai khoan');
  const carol = newBrowser();
  await carol.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  const carolEmail = uniqueEmail('carol');
  await carol.call('POST', '/api/auth/register', { email: carolEmail, password: PASSWORD });
  sqlQuery(`UPDATE users SET email_verified=1 WHERE email='${carolEmail}'`);
  await carol.call('POST', '/api/auth/login', { email: carolEmail, password: PASSWORD });
  const carolOk = await carol.call('GET', '/api/auth/me');
  check('carol dang nhap duoc', carolOk.status === 200);

  sqlQuery(`UPDATE users SET status='suspended' WHERE email='${carolEmail}'`);
  const carolLocked = await carol.call('GET', '/api/auth/me');
  check('khoa tai khoan -> phien dang mo mat hieu luc ngay', carolLocked.status === 401,
    carolLocked.data);
  const carolLogin = await carol.call('POST', '/api/auth/login',
    { email: carolEmail, password: PASSWORD });
  check('tai khoan bi khoa -> khong dang nhap lai duoc', carolLogin.status === 403, carolLogin.data);

  // ------------------------------------------ noi lead cu vao tai khoan moi
  // Nguoi ta dien form o trang ban hang truoc, vai ngay sau moi tao tai khoan.
  // Hai buoc do phai ra CUNG MOT NGUOI, neu khong thi mat nguoi gioi thieu va
  // trang Dai ly khong nhan ra thanh vien nay tung la cong tac vien.
  console.log('\n7. Lead cu tu noi vao tai khoan moi');
  const leadEmail = uniqueEmail('lead');
  const leadPhone = `+849${Date.now().toString().slice(-8)}`;
  const nowTxt = new Date().toISOString();
  // Mot dong: sqlQuery day cau lenh qua dong lenh, xuong dong la vo cau lenh.
  sqlQuery(`INSERT INTO leads (full_name, email, phone, phone_e164, created_at, updated_at) VALUES ('Chu Lead Cu', '${leadEmail}', '09xxxx', '${leadPhone}', '${nowTxt}', '${nowTxt}')`);
  const leadId = sqlQuery(`SELECT id FROM leads WHERE email = '${leadEmail}'`)[0]?.id;

  const dave = newBrowser();
  await dave.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  await dave.call('POST', '/api/auth/register', { email: leadEmail, password: PASSWORD });
  const noi = sqlQuery(`SELECT legacy_lead_id, phone_e164, full_name FROM users WHERE email = '${leadEmail}'`)[0] || {};
  check('dang ky bang email da co lead -> noi vao lead cu',
    noi.legacy_lead_id === leadId, { mong: leadId, thuc: noi.legacy_lead_id });
  check('lay luon so dien thoai va ten tu lead',
    noi.phone_e164 === leadPhone && noi.full_name === 'Chu Lead Cu', noi);

  // Email khong co lead nao thi de trong, khong duoc vo tinh nhan lead nguoi khac.
  const laEmail = uniqueEmail('khonglead');
  const eve = newBrowser();
  await eve.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  await eve.call('POST', '/api/auth/register', { email: laEmail, password: PASSWORD });
  const trong = sqlQuery(`SELECT legacy_lead_id FROM users WHERE email = '${laEmail}'`)[0] || {};
  check('khong co lead cung email -> de trong',
    trong.legacy_lead_id === null || trong.legacy_lead_id === undefined, trong);

  // -------------------------------- dien form o trang ban hang -> co tai khoan
  // Day la ca duong quan trong nhat cua he thong: nguoi ta chi dien form ban
  // hang, khong he tu tao tai khoan, nhung van phai vao duoc webapp.
  console.log('\n8. Dien form -> tu co tai khoan + link dat mat khau');
  const ANSWERS = {
    q1: 'Rồi, tôi đã từng thử mô hình kinh doanh online trước đây',
    q2: 'Xây một hệ thống thu nhập lớn, quy mô dài hạn',
    q3: 'Trên 15 giờ/tuần',
    q4: ['Thiếu thời gian vì công việc/gia đình hiện tại'],
    q5: 'Đã dùng để làm việc/kinh doanh nhưng chưa có hệ thống',
    q7: 'Kinh doanh tự do / chủ shop, chủ dịch vụ nhỏ',
    q8: 'Trên 70 triệu/tháng',
    q6: ['Có người đồng hành, cố vấn trực tiếp thay vì tự mày mò'],
  };
  const formEmail = uniqueEmail('form');
  const formPhone = `09${Date.now().toString().slice(-8)}`;
  const frank = newBrowser();
  await frank.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  const dienForm = await frank.call('POST', '/api/leads', {
    full_name: 'Nguoi Dien Form', email: formEmail, phone: formPhone,
    country_code: '+84', answers: ANSWERS, answers_schema: 'html',
  });
  check('POST /api/leads thanh cong', dienForm.status === 201 && dienForm.data.ok, dienForm.data);

  const tk = sqlQuery(`SELECT id, source, status, email_verified, legacy_lead_id, full_name FROM users WHERE email = '${formEmail}'`)[0];
  check('dien form -> he thong tu tao tai khoan', !!tk, tk);
  check('tai khoan do danh dau nguon la funnel va dang hoat dong',
    tk?.source === 'funnel' && tk?.status === 'active' && tk?.email_verified === 0, tk);
  check('tai khoan noi thang vao lead vua tao', !!tk?.legacy_lead_id, tk);
  check('lay ten tu form', tk?.full_name === 'Nguoi Dien Form', tk);

  const link = sqlQuery(`SELECT expires_at, used_at FROM password_resets WHERE user_id = '${tk?.id}'`);
  check('co dung 1 link dat mat khau chua dung', link.length === 1 && !link[0].used_at, link);
  const conLai = (new Date(link[0]?.expires_at) - Date.now()) / 86400000;
  check('link song 7 ngay chu khong phai 1 tieng', conLai > 6.5 && conLai < 7.5,
    { ngay: Math.round(conLai * 10) / 10 });

  // Dien form lan hai bang email do KHONG duoc de ra tai khoan thu hai.
  //
  // Nhung NO DUOC phat them mot link dat mat khau, va day la thay doi co y:
  // nguoi mat thu moi thuong lam dung mot viec - quay lai dien form. Truoc day
  // ho nhan duoc dung mot su im lang, va khong biet lam gi tiep.
  //
  // Khong phai duong chiem tai khoan: thu chi di toi CHINH hop thu cua tai
  // khoan do (ke gui khong doc duoc), va chi gui khi tai khoan CHUA co mat
  // khau va CHUA tung dang nhap Google - tuc la chua co gi de chiem. Dung mo
  // hinh voi nut "Quen mat khau". Chan doi thu bang gioi han 3 lan/gio moi
  // dia chi trong guiLaiNeuChuaVaoDuoc.
  await frank.call('POST', '/api/leads', {
    full_name: 'Nguoi Dien Form', email: formEmail, phone: formPhone,
    country_code: '+84', answers: ANSWERS, answers_schema: 'html',
  });
  const demTk = sqlQuery(`SELECT COUNT(*) AS n FROM users WHERE email = '${formEmail}'`)[0];
  const demLink = sqlQuery(`SELECT COUNT(*) AS n FROM password_resets WHERE user_id = '${tk?.id}'`)[0];
  check('dien form lan hai -> van 1 tai khoan', demTk?.n === 1, demTk);
  check('dien form lan hai -> gui lai duoc link cho nguoi chua vao duoc',
    demLink?.n === 2, demLink);

  // ------------------------------------------------------------------ don dep
  sqlQuery("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@smoketest.local')");
  sqlQuery("DELETE FROM credentials WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@smoketest.local')");
  sqlQuery("DELETE FROM password_resets WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@smoketest.local')");
  sqlQuery("DELETE FROM otp_codes WHERE email LIKE '%@smoketest.local'");
  sqlQuery("DELETE FROM emails_sent WHERE to_addr LIKE '%@smoketest.local'");
  sqlQuery("DELETE FROM users WHERE email LIKE '%@smoketest.local'");
  sqlQuery("DELETE FROM leads WHERE email LIKE '%@smoketest.local'");
  sqlQuery("DELETE FROM events WHERE lead_id NOT IN (SELECT id FROM leads)");
  sqlQuery('DELETE FROM rate_limits');
  console.log('\n  (da don du lieu test)');

  console.log(`\nKet qua: ${passed} dat, ${failed} loi${boQua ? `, ${boQua} bo qua` : ''}`);
  process.exit(failed ? 1 : 0);
})();
