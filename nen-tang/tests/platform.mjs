/**
 * Kiem tra tang du lieu cong dong: API entity, phan quyen, va may tinh diem.
 *
 *   node --env-file=.env tests/platform.mjs [baseUrl]
 *
 * Trong tam la PHAN QUYEN. Mot API entity tong quat ma khai bao long leo thi
 * mot thanh vien binh thuong doc duoc email va so dien thoai cua toan bo hoc
 * vien, hoac tu cong XP cho minh - nen phan lon bai o day la thu lam nhung viec
 * do va mong doi bi tu choi.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Doc ten co so du lieu tu wrangler.jsonc thay vi viet cung - doi ten o do
// ma quen sua o day thi bo test bao loi rat kho hieu.
const DB_NAME = (readFileSync('wrangler.jsonc', 'utf8')
  .match(/"database_name":\s*"([^"]+)"/) || [, 'platform'])[1];

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const PASSWORD = 'matkhau-rat-manh-123';
// Ma san pham va tien to ma don lay tu brand/brand.json - KHONG phai process.env.
// `brand:apply` ghi chung vao wrangler.jsonc chu khong vao .env, nen doc env se
// roi ve mac dinh 'SKU'/'VIP'. Hau qua that: ma don thanh 'VIPTEST22' trong khi
// he thong sinh ma tien to that, va bai "webhook nhan tien -> don paid" DO vi
// giao dich khong khop duoc voi don nao.
const BRAND_TEST = JSON.parse(
  readFileSync(new URL('../brand/brand.json', import.meta.url), 'utf8'));
const SKU_TEST = String(
  process.env.PRODUCT_SKU || BRAND_TEST.product?.sku || 'SKU').toUpperCase();
const TIEN_TO_DON_TEST = String(
  process.env.ORDER_PREFIX || BRAND_TEST.product?.orderPrefix || 'VIP').toUpperCase();

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) { passed += 1; console.log(`  OK   ${name}`); } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }
};

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

function sql(query) {
  const cmd = `npx wrangler d1 execute ${DB_NAME} --local --json --command "${query.replace(/"/g, '\\"')}"`;
  const out = chayLenhSql(cmd);
  const start = out.indexOf('[');
  return start === -1 ? [] : JSON.parse(out.slice(start))[0]?.results || [];
}

/**
 * `sql()` goi `wrangler d1 execute` trong khi `wrangler dev` dang chay, va lan
 * goi do lam dut ket noi keep-alive dang mo. Lan fetch ke tiep chet bang
 * UND_ERR_SOCKET va ca bo test dung giua chung - khong phai loi cua san pham:
 * chinh duong dan do goi lai bang curl thi 200. Thu lai dung mot lan.
 */
async function fetchLaiMotLan(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err?.cause?.code !== 'UND_ERR_SOCKET') throw err;
    return fetch(url, init);
  }
}

function newBrowser() {
  const jar = {};
  return {
    jar,
    async call(method, path, body) {
      const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (!'GET HEAD'.includes(method) && jar.pf_csrf) headers['X-CSRF-Token'] = jar.pf_csrf;
      const res = await fetchLaiMotLan(BASE + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const value = pair.slice(i + 1);
        if (value === '') delete jar[pair.slice(0, i)]; else jar[pair.slice(0, i)] = value;
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data };
    },
  };
}

/**
 * Tao mot tai khoan da xac thuc san, tra ve trinh duyet da dang nhap.
 *
 * MAC DINH tao kem mot dong `leads` trung email, vi do la hinh dang cua mot
 * hoc vien THAT: ho dien form o trang ban hang roi he thong tao tai khoan cho.
 * Khong co dong do thi cong khoa noi dung (daDangKyChuongTrinh) chan het - va
 * ca chuc bai khong lien quan gi toi cong se do cung mot luc.
 *
 * `{ lead: false }` de dung nguoi vao thang bang nut Dang nhap Google, chua
 * tung dang ky - chinh la truong hop cai cong sinh ra de chan.
 */
async function makeUser(tag, role = 'member', { lead = true } = {}) {
  const email = `${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@smoketest.local`;
  const b = newBrowser();
  await b.call('GET', '/api/apps/public/prod/public-settings/by-id/x');
  await b.call('POST', '/api/auth/register', { email, password: PASSWORD });
  sql(`UPDATE users SET email_verified=1, full_name='${tag}', role='${role}' WHERE email='${email}'`);
  if (lead) {
    // phone_e164 vua NOT NULL vua UNIQUE, nen phai sinh mot so rieng cho tung
    // tai khoan test - dung lai '' la tai khoan thu hai do ngay.
    const soGia = `+84${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900 + 100)}`;
    sql(`INSERT INTO leads (email,full_name,phone,phone_e164,status,created_at,updated_at) VALUES ('${email}','${tag}','${soGia}','${soGia}','new',datetime('now'),datetime('now'))`);
  }
  await b.call('POST', '/api/auth/login', { email, password: PASSWORD });
  const me = await b.call('GET', '/api/auth/me');
  b.id = me.data.id;
  b.email = email;
  return b;
}

(async () => {
  console.log(`Kiem tra tang du lieu cong dong tren ${BASE}\n`);

  // Quet sach TAI KHOAN test cua lan chay truoc TRUOC KHI bat dau.
  //
  // Khoi don dep o cuoi file da biet lo chuyen "lan chay truoc chet giua chung"
  // - nhung no nam o CUOI, tuc la dung cho chay khi lan do chet. Hau qua that:
  // mot lan chay do mang (miniflare "Network connection lost") de lai nguyen
  // mot bo alice/bob con song. Lan chay lai sau do goi /api/admin/doi-soat,
  // ham nay quet MOI nguoi dung, va bao lech o cai alice mo coi kia - mot bai
  // FAIL tro ve mot loi hoan toan khong phai cua lan chay hien tai, doc len
  // thi tuong so cai cua san pham co van de.
  //
  // Cung mot danh sach bang, cung thu tu (bang con truoc, users sau) nhu khoi
  // cuoi file - de day cho phep chay nhieu lan lien tiep.
  {
    const cu = "SELECT id FROM users WHERE email LIKE '%@smoketest.local'";
    for (const bang of ['point_awards', 'xp_transactions', 'coin_transactions', 'notifications',
      'post_likes', 'post_comments', 'posts', 'redemptions', 'auth_sessions', 'credentials',
      'password_resets', 'oauth_accounts', 'activities']) {
      sql(`DELETE FROM ${bang} WHERE user_id IN (${cu})`);
    }
    sql(`DELETE FROM admin_logs WHERE admin_id IN (${cu}) OR target_user_id IN (${cu})`);
    sql("DELETE FROM kit_sync_log WHERE email LIKE '%@smoketest.local'");
    sql("DELETE FROM otp_codes WHERE email LIKE '%@smoketest.local'");
    sql("DELETE FROM emails_sent WHERE to_addr LIKE '%@smoketest.local'");
    sql("DELETE FROM leads WHERE email LIKE '%@smoketest.local'");
    sql("DELETE FROM users WHERE email LIKE '%@smoketest.local'");
  }

  sql("DELETE FROM commissions WHERE affiliate_id IN (SELECT id FROM affiliates WHERE email LIKE '%@smoketest.local')");
  sql("DELETE FROM referral_clicks WHERE affiliate_id IN (SELECT id FROM affiliates WHERE email LIKE '%@smoketest.local')");
  sql("DELETE FROM affiliates WHERE email LIKE '%@smoketest.local'");
  sql("DELETE FROM leads WHERE phone_e164 = '+84988000333'");
  sql("DELETE FROM sessions WHERE id = 'phien-ma-la-bu2'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALABU8'");
  sql("DELETE FROM redemptions WHERE reward_id = 'qua-premium-kiemthu'");
  sql("DELETE FROM rewards WHERE id = 'qua-premium-kiemthu'");
  sql("DELETE FROM commissions WHERE order_code = 'VIPBU0001'");
  sql("DELETE FROM orders WHERE code = 'VIPBU0001'");
  sql("DELETE FROM leads WHERE phone_e164 = '+84988000222'");
  sql("DELETE FROM sessions WHERE id = 'phien-ma-la-bu'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALABU7'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALATEST9'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALACHUAGAN'");
  sql("DELETE FROM ref_ma_la_phien WHERE ma = 'MALACHUAGAN'");
  sql("DELETE FROM ref_ma_la_phien WHERE ma = 'MALATEST9'");
  sql("DELETE FROM orders WHERE lead_id IN (SELECT id FROM leads WHERE phone_e164 = '+84988000111')");
  sql("DELETE FROM leads WHERE phone_e164 = '+84988000111'");
  sql('DELETE FROM rate_limits');

  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  const admin = await makeUser('quantri', 'admin');
  check('tao duoc 3 tai khoan', !!alice.id && !!bob.id && !!admin.id);

  // -------------------------------------------------------------- doc du lieu
  console.log('\n1. Doc du lieu chung');
  const levels = await alice.call('GET', '/api/entities/Level?sort=level_number');
  check('doc duoc bang cap bac', Array.isArray(levels.data) && levels.data.length === 5,
    levels.data?.length);
  check('cap bac dung thu tu va co moc XP',
    levels.data?.[0]?.level_number === 1 && levels.data?.[4]?.threshold_xp === 7000,
    levels.data?.map((l) => l.threshold_xp));
  check('truong boolean tra ve dung kieu (khong phai 0/1)',
    levels.data?.[0]?.is_active === true, levels.data?.[0]?.is_active);

  const rules = await alice.call('GET', '/api/entities/PointRule?limit=50');
  check('doc duoc bang luat tinh diem', rules.data?.length >= 12, rules.data?.length);

  const settings = await alice.call('GET', '/api/entities/AppSetting?limit=50');
  check('doc duoc bang cau hinh', settings.data?.length >= 20, settings.data?.length);

  // ------------------------------------------------------------- LO DU LIEU
  console.log('\n2. Chan lo thong tin ca nhan');
  const users = await alice.call('GET', '/api/entities/User?limit=50');
  const others = (users.data || []).filter((u) => u.id !== alice.id);
  check('thanh vien doc duoc danh sach hoc vien', others.length > 0, users.data?.length);
  check('KHONG thay email cua nguoi khac',
    others.every((u) => u.email === undefined), others[0]);
  check('KHONG thay so dien thoai cua nguoi khac',
    others.every((u) => u.phone === undefined && u.phone_e164 === undefined), others[0]);
  check('van thay ten va XP de xep hang',
    others.every((u) => 'full_name' in u && 'total_xp' in u), others[0]);

  const meRow = (users.data || []).find((u) => u.id === alice.id);
  check('nhung van thay day du ho so CUA CHINH MINH', meRow?.email === alice.email, meRow?.email);

  const asAdmin = await admin.call('GET', '/api/entities/User?limit=50');
  check('admin thi thay day du', (asAdmin.data || []).every((u) => 'email' in u));

  // ------------------------------------------------------------ TU NANG QUYEN
  console.log('\n3. Chan tu nang quyen');
  const selfPromote = await alice.call('PUT', `/api/entities/User/${alice.id}`, { role: 'admin' });
  check('thanh vien KHONG tu dat minh thanh admin', selfPromote.status === 403, selfPromote.data);

  const fakeXp = await alice.call('POST', '/api/entities/XpTransaction', {
    user_id: alice.id, amount: 999999, source: 'hack',
  });
  check('KHONG tu ghi vao so cai XP', fakeXp.status === 403, fakeXp.data);

  const fakeCoin = await alice.call('POST', '/api/entities/CoinTransaction', {
    user_id: alice.id, amount: 999999, type: 'earn', source: 'hack',
  });
  check('KHONG tu ghi vao so cai xu', fakeCoin.status === 403, fakeCoin.data);

  const fakeBadge = await alice.call('POST', '/api/entities/UserBadge', {
    user_id: alice.id, badge_id: 'bd-level3',
  });
  check('KHONG tu trao huy hieu cho minh', fakeBadge.status === 403, fakeBadge.data);

  const editLevel = await alice.call('PUT', '/api/entities/Level/lvl-5', { threshold_xp: 1 });
  check('thanh vien KHONG sua duoc moc cap bac', editLevel.status === 403, editLevel.data);

  const editRule = await alice.call('PUT', '/api/entities/PointRule/pr-post', { xp: 99999 });
  check('thanh vien KHONG sua duoc luat tinh diem', editRule.status === 403, editRule.data);

  const adminEditRule = await admin.call('PUT', '/api/entities/PointRule/pr-post', { xp: 10 });
  check('admin thi sua duoc luat tinh diem', adminEditRule.status === 200, adminEditRule.data);

  // --- Loai hoat dong: admin sua duoc, hoc vien thi khong ---------------------
  //
  // Bang nay duoc Dashboard va ActivityModal doc de biet hien nhung nut nao, va
  // logActivity tu choi moi key khong co o day. Truoc day KHONG co trang quan
  // tri nao sua duoc no, nen gio them trang thi phai co bai giu cho: quyen o
  // schema la admin-only, va no khong duoc am tham noi long ra.
  const loaiCuaAlice = await alice.call('POST', '/api/entities/ActivityType', {
    name: 'Tu che', key: 'tu_che', xp_reward: 9999, coin_reward: 9999, is_active: true,
  });
  check('hoc vien KHONG tu tao duoc loai hoat dong', loaiCuaAlice.status === 403, loaiCuaAlice.data);

  const loaiMoi = await admin.call('POST', '/api/entities/ActivityType', {
    name: 'Đăng story', key: 'dang_story', description: 'Đăng một story',
    xp_reward: 7, coin_reward: 3, daily_cap: 2, is_active: true, sort_order: 9,
  });
  // POST /api/entities/... tra 201, khong phai 200 (worker/src/entities/api.js:66).
  check('admin tao duoc loai hoat dong moi', loaiMoi.status === 201 && !!loaiMoi.data?.id, loaiMoi.data);

  if (loaiMoi.data?.id) {
    const doiXp = await admin.call('PUT', `/api/entities/ActivityType/${loaiMoi.data.id}`, { xp_reward: 12 });
    check('admin doi duoc so XP cua loai do', doiXp.status === 200 && doiXp.data?.xp_reward === 12, doiXp.data);

    // Tat mot muc la no bien mat khoi app hoc vien - day chinh la cach chi Thanh
    // go mot muc xuong ma khong mat lich su cua no.
    const tat = await admin.call('PUT', `/api/entities/ActivityType/${loaiMoi.data.id}`, { is_active: false });
    check('admin tat duoc mot loai', tat.status === 200 && tat.data?.is_active === false, tat.data);

    const nopVaoMucDaTat = await alice.call('POST', '/api/functions/logActivity', {
      activity_type_key: 'dang_story', title: 'thu', evidence_link: 'https://vi.du/abc',
    });
    check('muc da tat thi KHONG nop vao duoc nua', nopVaoMucDaTat.status === 404, nopVaoMucDaTat.data);

    const xoa = await admin.call('DELETE', `/api/entities/ActivityType/${loaiMoi.data.id}`);
    check('admin xoa duoc loai hoat dong', xoa.status === 200, xoa.data);
  }

  const ghost = await alice.call('GET', '/api/entities/KhongCoThatDau');
  check('entity khong khai bao -> tu choi (mac dinh la cam)', ghost.status === 403, ghost.data);

  // Tao ban ghi cua chinh minh qua API entity: chu so huu bi ep bang nguoi goi,
  // nhung NOI DUNG phai duoc giu lai. Loi cu loc sach moi field khi tao moi va
  // sinh ra ban ghi rong - test o duoi chan viec do tai dien.
  const mineActivity = await alice.call('POST', '/api/entities/Activity', {
    activity_type_key: 'content',
    date: new Date().toISOString().slice(0, 10),
    title: 'Bài content thử nghiệm',
    description: 'Nội dung bài nộp',
    user_id: bob.id,          // co tinh gui id nguoi khac
    status: 'approved',       // co tinh tu duyet
    xp_awarded: 999,          // co tinh tu cong diem
  });
  check('tao hoat dong cua minh duoc, noi dung duoc giu lai',
    mineActivity.status === 201 && mineActivity.data.title === 'Bài content thử nghiệm',
    mineActivity.data);
  check('chu so huu bi ep ve chinh minh, khong nhan id gui len',
    mineActivity.data?.user_id === alice.id, mineActivity.data?.user_id);
  check('KHONG tu dat trang thai da duyet',
    mineActivity.data?.status === 'pending', mineActivity.data?.status);
  check('KHONG tu cong diem cho bai cua minh',
    mineActivity.data?.xp_awarded === 0, mineActivity.data?.xp_awarded);

  // ------------------------------------------------------------- MAY TINH DIEM
  console.log('\n4. May tinh diem');
  const post1 = await alice.call('POST', '/api/functions/createPost', { body: 'Bài đầu tiên của tôi' });
  check('dang bai duoc', post1.status === 200 && post1.data.post?.id, post1.data);

  let me = await alice.call('GET', '/api/auth/me');
  check('dang bai duoc cong 10 XP + 5 xu',
    me.data.total_xp === 10 && me.data.total_coin === 5,
    { xp: me.data.total_xp, coin: me.data.total_coin });

  const ledger = sql(`SELECT amount, source FROM xp_transactions WHERE user_id='${alice.id}'`);
  check('so cai co ghi dong tuong ung', ledger.length === 1 && ledger[0].amount === 10, ledger);

  // Tran 3 bai/ngay
  await alice.call('POST', '/api/functions/createPost', { body: 'Bài thứ hai' });
  await alice.call('POST', '/api/functions/createPost', { body: 'Bài thứ ba' });
  await alice.call('POST', '/api/functions/createPost', { body: 'Bài thứ tư - quá giới hạn' });
  me = await alice.call('GET', '/api/auth/me');
  check('vuot tran 3 bai/ngay thi khong cong them nua',
    me.data.total_xp === 30, { xp: me.data.total_xp });

  const awards = sql(`SELECT COUNT(*) AS n FROM point_awards WHERE user_id='${alice.id}'`);
  check('so lan cong dung bang so lan trong tran', Number(awards[0].n) === 3, awards[0]);

  // Tha tim + binh luan
  const postId = post1.data.post.id;
  const like1 = await bob.call('POST', '/api/functions/togglePostLike', { post_id: postId });
  check('tha tim duoc', like1.data?.liked === true, like1.data);
  const like2 = await bob.call('POST', '/api/functions/togglePostLike', { post_id: postId });
  check('bo tim duoc', like2.data?.liked === false, like2.data);
  const likeAgain = await bob.call('POST', '/api/functions/togglePostLike', { post_id: postId });
  check('tha tim lai duoc', likeAgain.data?.liked === true);

  const counted = sql(`SELECT like_count FROM posts WHERE id='${postId}'`);
  check('so tim dem dung, khong am va khong nhan doi',
    Number(counted[0].like_count) === 1, counted[0]);

  const comment = await bob.call('POST', '/api/functions/createComment', {
    post_id: postId, body: 'Bài viết hay quá bạn ơi',
  });
  check('binh luan duoc', comment.status === 200 && comment.data.comment?.id, comment.data);
  const bobMe = await bob.call('GET', '/api/auth/me');
  check('binh luan duoc cong 3 XP', bobMe.data.total_xp === 3, bobMe.data.total_xp);

  const notif = sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id='${alice.id}'`);
  check('chu bai nhan duoc thong bao', Number(notif[0].n) >= 1, notif[0]);

  // ------------------------------------------------------------ admin cong tay
  console.log('\n5. Admin dieu chinh diem');
  const adjust = await admin.call('POST', '/api/functions/adjustPoints', {
    target_user_id: bob.id, metric: 'xp', amount: 500, reason: 'Thưởng nỗ lực tuần này',
  });
  check('admin cong duoc XP bang tay', adjust.status === 200, adjust.data);

  const bobAfter = await bob.call('GET', '/api/auth/me');
  check('bob nhan duoc 500 XP', bobAfter.data.total_xp === 503, bobAfter.data.total_xp);

  const memberAdjust = await alice.call('POST', '/api/functions/adjustPoints', {
    target_user_id: alice.id, metric: 'xp', amount: 999999,
  });
  check('thanh vien KHONG tu dieu chinh diem', memberAdjust.status === 403, memberAdjust.data);

  const adminLog = sql("SELECT action, reason FROM admin_logs WHERE action='adjust_xp'");
  check('viec dieu chinh co ghi vao nhat ky, kem ly do',
    adminLog.length >= 1 && adminLog[0].reason.includes('Thưởng'), adminLog[0]);

  // ------------------------------------------------------------------ len cap
  console.log('\n6. Len cap');
  check('bob len cap Bac khi vuot 500 XP',
    sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id='${bob.id}' AND type='level_up'`)[0].n >= 1);

  const levelUpCoin = await bob.call('GET', '/api/auth/me');
  check('len cap duoc thuong 50 xu', levelUpCoin.data.total_coin >= 51, levelUpCoin.data.total_coin);

  // ------------------------------------------------------------- bang xep hang
  console.log('\n7. Bang xep hang');
  const board = await alice.call('POST', '/api/functions/getLeaderboard', {
    period: 'all_time', metric: 'xp',
  });
  check('lay duoc bang xep hang', board.status === 200 && board.data.ranking?.length >= 2,
    board.data?.ranking?.length);
  check('xep giam dan theo diem',
    board.data.ranking[0].score >= board.data.ranking[1].score, board.data.ranking?.slice(0, 2));
  check('bang xep hang KHONG lo email',
    board.data.ranking.every((r) => r.email === undefined), board.data.ranking?.[0]);
  check('co kem cap bac de hien huy hieu', !!board.data.ranking[0].level_name);

  const byStreak = await alice.call('POST', '/api/functions/getLeaderboard', { metric: 'streak' });
  check('xep hang theo chuoi ngay cung chay', byStreak.status === 200, byStreak.data?.metric);

  // NGUOI NGOAI BANG VAN PHAI BIET MINH O HANG MAY.
  //
  // Ban cu tim `me` trong dung nhung dong vua lay ve. Trang xin 100 dong ma lop
  // gan 500 nguoi, nen phan lon hoc vien nhan `me: null`: mo bang xep hang ra,
  // khong thay ten minh, khong biet minh dung o dau.
  //
  // `limit: 1` o day mo phong dung canh do bang mot cai bang be xiu.
  const bangHep = await alice.call('POST', '/api/functions/getLeaderboard', {
    period: 'all_time', metric: 'xp', limit: 1,
  });
  check('gioi han bao nhieu thi tra ve bay nhieu dong',
    bangHep.data?.ranking?.length === 1, bangHep.data?.ranking?.length);
  check('nguoi ngoai bang VAN nhan duoc dong cua chinh minh',
    !!bangHep.data?.me && bangHep.data.me.is_me === true, bangHep.data?.me);

  // So hang phai khop voi so nguoi thuc su dang tren - dem bang chinh cong
  // thuc ORDER BY cua bang: diem cao hon, hoac bang diem ma vao truoc.
  const toi = sql(`SELECT total_xp, created_date FROM users WHERE id = '${alice.id}'`)[0];
  const soNguoiTren = sql(`SELECT COUNT(*) AS n FROM users
     WHERE status = 'active' AND (total_xp > ${Number(toi.total_xp)}
        OR (total_xp = ${Number(toi.total_xp)} AND created_date < '${toi.created_date}'))`)[0];
  check('hang tra ve khop voi so nguoi dang tren minh',
    bangHep.data?.me?.position === Number(soNguoiTren.n) + 1,
    { tra_ve: bangHep.data?.me?.position, dem_duoc: Number(soNguoiTren.n) + 1 });
  check('diem cua dong rieng do dung bang diem that',
    bangHep.data?.me?.score === Number(toi.total_xp), bangHep.data?.me?.score);

  // ------------------------------------------------------------------- doi qua
  console.log('\n8. Doi qua');
  // DUNG ID TRA VE TU LENH TAO, dung tim theo TEN.
  //
  // Ban cu lam `rewards.data.find(r => r.name === 'Qua thu nghiem')`. Ten thi
  // lap lai qua moi lan chay, ma buoc don dep khong xoa bang rewards, nen
  // `find` co the voo phai mot dong CU da het hang tu lan truoc - va bai test
  // do vi mot ly do khong lien quan gi toi thu no dang kiem.
  const taoQua = await admin.call('POST', '/api/entities/Reward', {
    name: 'Quà thử nghiệm', coin_cost: 20, quantity: 1, min_level: 1, is_active: true,
  });
  const reward = taoQua.data;
  check('admin tao duoc phan thuong', taoQua.status === 201 && !!reward?.id, taoQua.data);

  const poor = await alice.call('POST', '/api/functions/redeemReward', { reward_id: reward.id });
  check('khong du xu -> tu choi va noi ro con thieu bao nhieu',
    poor.status === 409 && /thiếu/.test(poor.data?.error?.message || ''), poor.data);

  const rich = await bob.call('POST', '/api/functions/redeemReward', { reward_id: reward.id });
  check('du xu thi doi duoc', rich.status === 200 && rich.data.redemption?.id, rich.data);

  const bobCoins = await bob.call('GET', '/api/auth/me');
  check('xu bi tru dung 20', levelUpCoin.data.total_coin - bobCoins.data.total_coin === 20,
    { truoc: levelUpCoin.data.total_coin, sau: bobCoins.data.total_coin });

  const stock = sql(`SELECT quantity FROM rewards WHERE id='${reward.id}'`);
  check('so luong qua giam ve 0', Number(stock[0].quantity) === 0, stock[0]);

  const soldOut = await bob.call('POST', '/api/functions/redeemReward', { reward_id: reward.id });
  check('het hang -> khong doi duoc nua', soldOut.status === 409, soldOut.data);

  // Huy don -> hoan xu
  const cancel = await admin.call('POST', '/api/functions/updateRedemption', {
    redemption_id: rich.data.redemption.id, status: 'cancelled',
  });
  check('admin huy duoc don doi qua', cancel.status === 200, cancel.data);
  const refunded = await bob.call('GET', '/api/auth/me');
  check('huy thi HOAN LAI xu',
    refunded.data.total_coin === levelUpCoin.data.total_coin, refunded.data.total_coin);

  // HUY THI PHAI THU LAI LINK QUA.
  // `Redemption` giu ban sao delivery_url cua rieng no va KHONG co gatedFields,
  // nen trang "Qua cua toi" ve nut "Mo qua" mien la cot do khac rong - bat ke
  // trang thai. Truoc day: doi qua -> nhan link -> admin huy -> xu hoan, kho
  // hoan, ma nut "Mo qua" van bam duoc. Vua giu qua vua lay lai xu.
  const donDaHuy = sql(`SELECT status, delivery_url FROM redemptions WHERE id='${rich.data.redemption.id}'`);
  check('huy roi thi KHONG con link qua de bam',
    donDaHuy[0]?.status === 'cancelled' && !donDaHuy[0]?.delivery_url, donDaHuy[0]);

  // --- Qua MOC: moi nguoi mot lan -------------------------------------------
  //
  // Qua khong mua bang xu (coin_cost = 0, hoac mo bang loi moi) truoc day doi
  // duoc VO HAN: khong UNIQUE(user_id, reward_id), va redeemReward khong kiem
  // gi. Duong trao tu dong (commerce/thuong-gioi-thieu.js:70) thi da chan trung
  // tu lau - hai duong cung cap mot mon qua ma mot ben chan mot ben khong.
  const taoQuaMoc = await admin.call('POST', '/api/entities/Reward', {
    name: 'Quà mốc miễn phí', coin_cost: 0, quantity: 50, min_level: 1, is_active: true,
  });
  const quaMoc = taoQuaMoc.data;

  const mocLan1 = await alice.call('POST', '/api/functions/redeemReward', { reward_id: quaMoc.id });
  check('qua moc: lan dau nhan duoc', mocLan1.status === 200, mocLan1.data);

  const mocLan2 = await alice.call('POST', '/api/functions/redeemReward', { reward_id: quaMoc.id });
  check('qua moc: lan hai bi tu choi (moi nguoi mot lan)',
    mocLan2.status === 409 && mocLan2.data?.error?.code === 'da_doi_roi', mocLan2.data);

  const khoSauHaiLan = sql(`SELECT quantity FROM rewards WHERE id='${quaMoc.id}'`);
  check('qua moc: kho chi tru DUNG mot don vi',
    Number(khoSauHaiLan[0].quantity) === 49, khoSauHaiLan[0]);

  // --- Tru kho nguyen tu ----------------------------------------------------
  //
  // Ban cu doc quantity o dau ham roi tru bang MAX(0, quantity - 1) o cuoi, cach
  // nhau mot loi goi spendCoin. Hai nguoi bam cung luc voi quantity = 1 thi ca
  // hai deu lot: MAX(0, ...) am tham kep 1 -> 0 -> 0 va hai nguoi duoc hua cung
  // mot mon hang cuoi cung. Gio dieu kien `quantity > 0` nam trong chinh cau
  // UPDATE, va ham doc meta.changes de biet minh co gianh duoc khong.
  const taoQuaCuoi = await admin.call('POST', '/api/entities/Reward', {
    name: 'Quà cuối cùng', coin_cost: 0, quantity: 1, min_level: 1, is_active: true,
  });
  const quaCuoi = taoQuaCuoi.data;

  const [dua1, dua2] = await Promise.all([
    alice.call('POST', '/api/functions/redeemReward', { reward_id: quaCuoi.id }),
    bob.call('POST', '/api/functions/redeemReward', { reward_id: quaCuoi.id }),
  ]);
  const soThanhCong = [dua1, dua2].filter((r) => r.status === 200).length;
  check('hai nguoi gianh mon cuoi cung -> DUNG MOT nguoi duoc',
    soThanhCong === 1, { dua1: dua1.status, dua2: dua2.status });

  const khoCuoi = sql(`SELECT quantity FROM rewards WHERE id='${quaCuoi.id}'`);
  check('kho khong bao gio xuong duoi 0', Number(khoCuoi[0].quantity) === 0, khoCuoi[0]);

  // ------------------------------------------------------------------ doi soat
  console.log('\n9. Doi soat so cai');
  const recon = await admin.call('POST', '/api/functions/reconcilePoints', {});
  check('con so tong khop voi so cai (khong lech dong nao)',
    recon.status === 200 && recon.data.drift_count === 0, recon.data?.drift);

  const memberRecon = await alice.call('POST', '/api/functions/reconcilePoints', {});
  check('thanh vien khong chay duoc doi soat', memberRecon.status === 403);

  // ------------------------------------------------------------------ thong bao
  console.log('\n10. Thong bao rieng tu');
  const myNotifs = await alice.call('GET', '/api/entities/Notification');
  check('doc duoc thong bao cua minh', Array.isArray(myNotifs.data), myNotifs.data?.length);
  check('thong bao deu la cua chinh minh',
    (myNotifs.data || []).every((n) => n.user_id === alice.id));

  const otherNotifs = await alice.call('GET',
    `/api/entities/Notification?filter=${encodeURIComponent(JSON.stringify({ user_id: bob.id }))}`);
  check('KHONG doc duoc thong bao cua nguoi khac du co loc theo id ho',
    (otherNotifs.data || []).length === 0, otherNotifs.data);

  const markRead = await alice.call('POST', '/api/entities/Notification/updateMany', {
    filter: { user_id: alice.id, is_read: false }, update: { $set: { is_read: true } },
  });
  check('danh dau da doc duoc', markRead.status === 200, markRead.data);

  const markOthers = await alice.call('POST', '/api/entities/Notification/updateMany', {
    filter: { user_id: bob.id, is_read: false }, update: { $set: { is_read: true } },
  });
  check('KHONG danh dau ho nguoi khac duoc', markOthers.status === 403, markOthers.data);

  // ---------------------------------------------------- gop hai he quan tri
  console.log('');
  console.log('11. Khu vuc quan tri funnel');
  // khoan nen tang co role=admin van bi 401 - cong quan tri moi khong doc duoc
  // so lieu doanh thu. Gio mot lan dang nhap la vao duoc ca hai.
  const adminStats = await admin.call('GET', '/api/admin/stats');
  check('admin nen tang doc duoc so lieu funnel',
    adminStats.status === 200 && adminStats.data.ok, adminStats.data);

  const memberStats = await alice.call('GET', '/api/admin/stats');
  check('thanh vien thuong KHONG doc duoc so lieu funnel',
    memberStats.status === 401 || memberStats.status === 503, memberStats.status);

  const voidRoute = await admin.call('POST', '/api/admin/commissions/999999/void',
    { reason: 'thu duong dan' });
  // Hoa hong id 999999 khong co that nen 404 la DUNG. Cai can phan biet la
  // 404 vi "khong tim thay hoa hong" (route co that) hay vi "khong co duong
  // dan nay" (route quen dang ky) - nhin ma loi la ro.
  check('duong dan huy hoa hong da duoc dang ky',
    voidRoute.data?.error?.code === 'commission_not_found', voidRoute.data);

  // ------------------------------------------------- ma gioi thieu khong co that
  //
  // Cai bay that: ai do con giu link cua he thong cu va van di rai. Nguoi bam
  // vao van dang ky binh thuong nen nhin tu ngoai khong co gi sai - chi nguoi
  // gioi thieu mat luot, va truoc day he thong khong he ghi lai mot chu nao.
  const maLaThu = 'MALATEST9';
  const refLa = await alice.call('POST', '/api/ref',
    { code: maLaThu, landing_url: `https://vidu.test/?ref=${maLaThu}` });
  check('ma la KHONG duoc nhan la hop le',
    refLa.status === 200 && refLa.data?.valid === false, refLa.data);

  const dsMaLa = await admin.call('GET', '/api/admin/ref-ma-la');
  const dongMaLa = (dsMaLa.data?.items || []).find((x) => x.ma === maLaThu);
  check('ma la duoc ghi lai cho quan tri nhin thay',
    dsMaLa.status === 200 && dongMaLa && dongMaLa.so_lan >= 1, dsMaLa.data);

  const maLaCuaMember = await alice.call('GET', '/api/admin/ref-ma-la');
  check('thanh vien thuong KHONG xem duoc danh sach ma la',
    maLaCuaMember.status === 401 || maLaCuaMember.status === 503, maLaCuaMember.status);

  const ganThieu = await admin.call('POST', `/api/admin/ref-ma-la/${maLaThu}/gan`, {});
  check('gan ma la ma khong chon ai -> tu choi',
    ganThieu.status === 422, ganThieu.data);

  const ganSai = await admin.call('POST', `/api/admin/ref-ma-la/${maLaThu}/gan`,
    { code: 'KHONGCOTHAT' });
  check('gan cho mot cong tac vien khong ton tai -> 404',
    ganSai.data?.error?.code === 'affiliate_not_found', ganSai.data);

  // --------------------------------------- ai dang nhap cung phai co link moi
  //
  // Truoc day affiliate CHI duoc sinh ra o mot cho: form o trang ban hang. Nguoi
  // vao thang webapp bang Google mo tab Dai ly ra chi thay "Ban can dang ky
  // Challenge truoc" - roi ho di rai mot link cu tu he thong khac va mat sach
  // luot, khong ai biet.
  const portalMoi = await alice.call('GET', '/api/affiliate/me');
  check('thanh vien dang nhap duoc cap link gioi thieu, khong can dien form',
    portalMoi.status === 200 && !!portalMoi.data?.affiliate?.code, portalMoi.data);

  const portalLai = await alice.call('GET', '/api/affiliate/me');
  check('goi lai KHONG sinh them ma thu hai',
    portalLai.data?.affiliate?.code === portalMoi.data?.affiliate?.code,
    { lan1: portalMoi.data?.affiliate?.code, lan2: portalLai.data?.affiliate?.code });

  // ------------------------------------------- ghi nhan MUON van phai ra tien
  //
  // createCommission chi chay o dung mot khoanh khac: luc don chuyen sang paid.
  // Neu luot gioi thieu duoc ghi SAU do thi khoanh khac ay da troi qua. Don
  // VIPPXGTDE tra tien 08/09, luot ghi 09/09 -> nguoi gioi thieu mat 79.800d,
  // khong bao loi, khong ai biet.
  const MA_LA_BU = 'MALABU7';
  const SDT_BU = '+84988000222';
  sql(`DELETE FROM commissions WHERE order_code = 'VIPBU0001'`);
  sql(`DELETE FROM orders WHERE code = 'VIPBU0001'`);
  sql(`DELETE FROM leads WHERE phone_e164 = '${SDT_BU}'`);
  sql(`DELETE FROM sessions WHERE id = 'phien-ma-la-bu'`);
  sql(`DELETE FROM ref_ma_la WHERE ma = '${MA_LA_BU}'`);
  sql(`INSERT INTO sessions (id, created_at, last_seen_at, landing_url) VALUES ('phien-ma-la-bu', datetime('now'), datetime('now'), 'https://vidu.test/?ref=${MA_LA_BU}')`);
  sql(`INSERT INTO leads (session_id, full_name, email, phone, phone_e164, answers_json, created_at, updated_at) VALUES ('phien-ma-la-bu','Nguoi Duoc Bu','bu@smoketest.local','0988000222','${SDT_BU}','{}',datetime('now'),datetime('now'))`);
  const leadBu = sql(`SELECT id FROM leads WHERE phone_e164 = '${SDT_BU}'`)[0]?.id;
  sql(`INSERT INTO orders (code, lead_id, product_sku, product_name, amount, paid_amount, currency, status, transfer_content, paid_at, created_at, updated_at) VALUES ('VIPBU0001', ${leadBu}, '${SKU_TEST}', 'Ve VIP', 399000, 399000, 'VND', 'paid', 'VIPBU0001', datetime('now'), datetime('now'), datetime('now'))`);
  sql(`INSERT INTO ref_ma_la (ma, so_lan, lan_dau, lan_cuoi) VALUES ('${MA_LA_BU}', 1, datetime('now'), datetime('now'))`);

  const ganBu = await admin.call('POST', `/api/admin/ref-ma-la/${MA_LA_BU}/gan`,
    { code: portalMoi.data?.affiliate?.code });
  check('gan luot muon -> sinh bu hoa hong cho don da thanh toan',
    ganBu.data?.da_gan === 1 && ganBu.data?.hoa_hong_bu === 1, ganBu.data);

  const hoaHongBu = sql(`SELECT amount, status FROM commissions WHERE order_code = 'VIPBU0001'`);
  check('hoa hong bu dung 20% va o trang thai cho tra',
    Number(hoaHongBu[0]?.amount) === 79800 && hoaHongBu[0]?.status === 'pending', hoaHongBu[0]);

  const ganLai = await admin.call('POST', `/api/admin/ref-ma-la/${MA_LA_BU}/gan`,
    { code: portalMoi.data?.affiliate?.code });
  check('gan lai lan hai KHONG sinh hoa hong thu hai',
    (ganLai.data?.hoa_hong_bu || 0) === 0
    && sql(`SELECT COUNT(*) AS n FROM commissions WHERE order_code = 'VIPBU0001'`)[0]?.n === 1,
    ganLai.data);

  // ------------------------- link cu VAN SONG sau khi da gan cho mot nguoi
  //
  // Gan trong trang quan tri chi cuu duoc nguoi da dang ky TRUOC luc gan. Nguoi
  // gioi thieu thi van dang di rai link cua he thong cu, nen moi luot bam sau
  // do lai roi vao hu khong va thang sau admin phai vao gan bang tay lan nua.
  // Doi chieu that: ma IHMMIP56 gan luc 04:03, den 06:26 cung ngay da co them
  // mot luot bam khong duoc tinh cho ai.
  const refSauGan = await alice.call('POST', '/api/ref',
    { code: MA_LA_BU, landing_url: `https://vidu.test/?ref=${MA_LA_BU}` });
  check('ma la DA duoc gan -> luot bam sau ve thang cho nguoi nhan',
    refSauGan.data?.valid === true, refSauGan.data);

  const refChuaGan = await alice.call('POST', '/api/ref',
    { code: 'MALACHUAGAN', landing_url: 'https://vidu.test/?ref=MALACHUAGAN' });
  check('ma la CHUA gan van bi coi la khong hop le',
    refChuaGan.data?.valid === false, refChuaGan.data);

  // ------------------------------- ty le hoa hong theo TUNG SAN PHAM (0017)
  //
  // Truoc migration 0017 moi don deu an cung mot ty le (`affiliates
  // .commission_rate`, mac dinh 0.2) bat ke ban cai gi. Gio ty le nam o san
  // pham. Bai nay giu cho cho dung con so tra ra, vi day la cho tien di: dat
  // 35% ma he thong van tra 20% thi khong co gi keu len, chi thieu tien.
  //
  // Truong hop "san pham chua dat ty le -> roi ve ty le chung" da duoc bai
  // 'hoa hong bu dung 20%' o ngay tren giu cho (SKU_TEST khong dat ty le).
  const SKU_HH = 'SKUHHTEST';
  const MA_LA_HH = 'MALAHH7';
  const SDT_HH = '+84988000333';
  const donHoaHong = (sku, ma, sdt, maDonHH, tyLe, sid) => {
    sql(`DELETE FROM commissions WHERE order_code = '${maDonHH}'`);
    sql(`DELETE FROM orders WHERE code = '${maDonHH}'`);
    sql(`DELETE FROM leads WHERE phone_e164 = '${sdt}'`);
    sql(`DELETE FROM sessions WHERE id = '${sid}'`);
    sql(`DELETE FROM ref_ma_la WHERE ma = '${ma}'`);
    sql(`DELETE FROM products WHERE sku = '${sku}'`);
    const tl = tyLe === null ? 'NULL' : tyLe;
    sql(`INSERT INTO products (id, sku, name, kind, price, currency, grants_json, is_active, commission_rate, created_date, updated_date) VALUES ('${sku}-id','${sku}','Khoa thu hoa hong','course',1000000,'VND','[]',1,${tl},datetime('now'),datetime('now'))`);
    sql(`INSERT INTO sessions (id, created_at, last_seen_at, landing_url) VALUES ('${sid}', datetime('now'), datetime('now'), 'https://vidu.test/?ref=${ma}')`);
    sql(`INSERT INTO leads (session_id, full_name, email, phone, phone_e164, answers_json, created_at, updated_at) VALUES ('${sid}','Nguoi Mua Khoa','${sid}@smoketest.local','0988000333','${sdt}','{}',datetime('now'),datetime('now'))`);
    const lid = sql(`SELECT id FROM leads WHERE phone_e164 = '${sdt}'`)[0]?.id;
    sql(`INSERT INTO orders (code, lead_id, product_sku, product_name, amount, paid_amount, currency, status, transfer_content, paid_at, created_at, updated_at) VALUES ('${maDonHH}', ${lid}, '${sku}', 'Khoa thu hoa hong', 1000000, 1000000, 'VND', 'paid', '${maDonHH}', datetime('now'), datetime('now'), datetime('now'))`);
    sql(`INSERT INTO ref_ma_la (ma, so_lan, lan_dau, lan_cuoi) VALUES ('${ma}', 1, datetime('now'), datetime('now'))`);
  };

  donHoaHong(SKU_HH, MA_LA_HH, SDT_HH, 'HHSP0001', 0.35, 'phien-hoa-hong');
  const ganHH = await admin.call('POST', `/api/admin/ref-ma-la/${MA_LA_HH}/gan`,
    { code: portalMoi.data?.affiliate?.code });
  // Kiem CA loi goi, khong chi kiem ket qua cuoi: neu khong co dong nay thi mot
  // phien dang nhap het han se hien ra thanh "ty le tinh sai" - sai chan doan
  // hoan toan, va rat ton thoi gian de lan ra.
  check('gan ma la cho don co ty le rieng -> goi thanh cong',
    ganHH.status === 200 && ganHH.data?.hoa_hong_bu === 1, ganHH.data);
  const hhSanPham = sql(`SELECT amount, rate, product_sku FROM commissions WHERE order_code = 'HHSP0001'`);
  check('ty le cua SAN PHAM thang ty le chung cua nguoi gioi thieu',
    Number(hhSanPham[0]?.amount) === 350000 && Number(hhSanPham[0]?.rate) === 0.35,
    hhSanPham[0]);
  check('hoa hong ghi lai don do ban san pham nao',
    hhSanPham[0]?.product_sku === SKU_HH, hhSanPham[0]);

  // So 0 KHAC de trong: 0 la mot quyet dinh that ("san pham nay khong tra hoa
  // hong"). Neu ma coi 0 la "chua dat" thi no se am tham tra 20%.
  donHoaHong(`${SKU_HH}0`, `${MA_LA_HH}0`, '+84988000334', 'HHSP0002', 0, 'phien-hoa-hong-0');
  const ganHH0 = await admin.call('POST', `/api/admin/ref-ma-la/${MA_LA_HH}0/gan`,
    { code: portalMoi.data?.affiliate?.code });
  check('gan ma la cho don ty le 0 -> goi thanh cong',
    ganHH0.status === 200 && ganHH0.data?.hoa_hong_bu === 1, ganHH0.data);
  const hhKhong = sql(`SELECT amount, rate FROM commissions WHERE order_code = 'HHSP0002'`);
  check('ty le 0 duoc ton trong, KHONG bi coi la chua dat',
    hhKhong.length === 1 && Number(hhKhong[0]?.amount) === 0 && Number(hhKhong[0]?.rate) === 0,
    hhKhong[0]);

  for (const [ma, don, sku, sdt, sid] of [
    [MA_LA_HH, 'HHSP0001', SKU_HH, SDT_HH, 'phien-hoa-hong'],
    [`${MA_LA_HH}0`, 'HHSP0002', `${SKU_HH}0`, '+84988000334', 'phien-hoa-hong-0'],
  ]) {
    sql(`DELETE FROM commissions WHERE order_code = '${don}'`);
    sql(`DELETE FROM orders WHERE code = '${don}'`);
    sql(`DELETE FROM leads WHERE phone_e164 = '${sdt}'`);
    sql(`DELETE FROM sessions WHERE id = '${sid}'`);
    sql(`DELETE FROM ref_ma_la WHERE ma = '${ma}'`);
    sql(`DELETE FROM products WHERE sku = '${sku}'`);
  }

  // ------------------------------- qua "mo khoa bang loi moi" (ve Premium)
  //
  // Trang ban hang ban ba loai ve, trong do Premium ghi ro "mo khoa bang loi
  // moi, khong phai bang tien". Bang `rewards` truoc day chi khoa duoc theo xu
  // va cap XP - khong co cot nao dien ta duoc cau do, nen ve Premium chua tung
  // ton tai trong he thong du 28 nguoi da moi du 2 ban.
  const QUA_PREMIUM = 'qua-premium-kiemthu';
  sql(`DELETE FROM redemptions WHERE reward_id = '${QUA_PREMIUM}'`);
  sql(`DELETE FROM rewards WHERE id = '${QUA_PREMIUM}'`);
  sql(`INSERT INTO rewards (id, name, coin_cost, quantity, min_level, min_referrals, category, is_active, delivery_url, created_date, updated_date) VALUES ('${QUA_PREMIUM}','Bo qua Premium kiem thu', 0, 100, 1, 2, 'Tài liệu', 1, 'https://vidu.test/qua-premium', datetime('now'), datetime('now'))`);

  // Alice moi co 0 luot -> chua duoc doi
  const doiSom = await alice.call('POST', '/api/functions/redeemReward', { reward_id: QUA_PREMIUM });
  check('chua moi du nguoi -> KHONG doi duoc qua Premium',
    doiSom.status === 403 && doiSom.data?.error?.code === 'chua_du_luot_moi', doiSom.data);

  // Them nguoi thu HAI cho Alice -> luc gan, refreshLevel chay lai voi so luot = 2
  // -> qua Premium phai tu duoc trao ngay trong buoc do.
  const MA_LA_2 = 'MALABU8';
  const SDT_BU2 = '+84988000333';
  sql(`DELETE FROM leads WHERE phone_e164 = '${SDT_BU2}'`);
  sql(`DELETE FROM sessions WHERE id = 'phien-ma-la-bu2'`);
  sql(`DELETE FROM ref_ma_la WHERE ma = '${MA_LA_2}'`);
  sql(`INSERT INTO sessions (id, created_at, last_seen_at, landing_url) VALUES ('phien-ma-la-bu2', datetime('now'), datetime('now'), 'https://vidu.test/?ref=${MA_LA_2}')`);
  sql(`INSERT INTO leads (session_id, full_name, email, phone, phone_e164, answers_json, created_at, updated_at) VALUES ('phien-ma-la-bu2','Nguoi Thu Hai','bu2@smoketest.local','0988000333','${SDT_BU2}','{}',datetime('now'),datetime('now'))`);
  sql(`INSERT INTO ref_ma_la (ma, so_lan, lan_dau, lan_cuoi) VALUES ('${MA_LA_2}', 1, datetime('now'), datetime('now'))`);
  await admin.call('POST', `/api/admin/ref-ma-la/${MA_LA_2}/gan`,
    { code: portalMoi.data?.affiliate?.code });

  const affAlice = sql(`SELECT id FROM affiliates WHERE code = '${portalMoi.data?.affiliate?.code}'`)[0]?.id;
  const soLuotAlice = sql(`SELECT COUNT(*) AS n FROM leads WHERE referred_by = ${affAlice} AND referral_valid = 1`)[0]?.n;
  const daTrao = sql(`SELECT COUNT(*) AS n FROM redemptions WHERE reward_id = '${QUA_PREMIUM}'`)[0]?.n;
  check('moi du 2 nguoi -> qua TU DUOC TRAO, khong cho ai phai xin',
    Number(soLuotAlice) >= 2 && Number(daTrao) === 1, { so_luot: soLuotAlice, da_trao: daTrao });

  const donQua = sql(`SELECT coin_spent, status, delivery_url FROM redemptions WHERE reward_id = '${QUA_PREMIUM}'`)[0];
  check('qua trao thi KHONG tru xu va giao ngay',
    Number(donQua?.coin_spent) === 0 && donQua?.status === 'delivered'
    && !!donQua?.delivery_url, donQua);

  const bu = await admin.call('POST', '/api/admin/trao-thuong-bu', {});
  const sauKhiBu = sql(`SELECT COUNT(*) AS n FROM redemptions WHERE reward_id = '${QUA_PREMIUM}'`)[0]?.n;
  check('trao bu chay lai KHONG tao don qua thu hai',
    bu.status === 200 && Number(sauKhiBu) === 1, { bu: bu.data, con_lai: sauKhiBu });

  // ------------------------------------ khong dat don bang lead cua nguoi khac
  //
  // `lead_id` la so tu tang. Ban cu nhan thang no tu trinh duyet, nen ai cung
  // goi duoc voi lead_id = 1, 2, 3... de tao don mang ten nguoi khac - va noi
  // dung chuyen khoan tra ve co ho ten that cua ho.
  const SDT_LA = '+84988000111';
  sql(`DELETE FROM orders WHERE lead_id IN (SELECT id FROM leads WHERE phone_e164 = '${SDT_LA}')`);
  sql(`DELETE FROM leads WHERE phone_e164 = '${SDT_LA}'`);
  sql(`INSERT INTO leads (session_id, full_name, email, phone, phone_e164, answers_json, created_at, updated_at) VALUES ('phien-cua-nguoi-khac','Nguoi La Test','nguoila@smoketest.local','0988000111','${SDT_LA}','{}',datetime('now'),datetime('now'))`);
  const leadLa = sql(`SELECT id FROM leads WHERE phone_e164 = '${SDT_LA}'`)[0]?.id;

  const donTrom = await alice.call('POST', '/api/orders', { lead_id: leadLa });
  check('KHONG dat duoc don bang lead cua nguoi khac',
    !/Nguoi La Test/i.test(JSON.stringify(donTrom.data || {})), donTrom.data);
  const donCuaLeadLa = sql(`SELECT COUNT(*) AS n FROM orders WHERE lead_id = ${leadLa}`);
  check('lead cua nguoi khac khong he sinh them don nao',
    Number(donCuaLeadLa[0]?.n) === 0, donCuaLeadLa[0]);

  // ------------------------------------------- khoa bai hoc & mo quyen khi mua
  console.log('');
  console.log('12. Khoa hoc: chan o phia may chu, khong phai an nut trong React');

  const courseId = `c-test-${Date.now()}`;
  const lessonId = `l-test-${Date.now()}`;
  sql(`INSERT INTO courses (id,name,description,min_level,requires_unlock,is_active,sort_order,created_date,updated_date) VALUES ('${courseId}','Khoa kiem thu','',0,1,1,0,datetime('now'),datetime('now'))`);
  sql(`INSERT INTO lessons (id,course_id,title,video_provider,video_id,assignment_url,doc_url,xp,coin,sort_order,created_date,updated_date) VALUES ('${lessonId}','${courseId}','Bai kiem thu','wistia','bi-mat-123','https://vidu/bt','https://vidu/tl',0,0,0,datetime('now'),datetime('now'))`);

  const lessonsAsMember = await alice.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: courseId }))}`);
  const seen = (lessonsAsMember.data || [])[0];
  check('thanh vien chua mua VAN thay tieu de bai (lam muc luc)',
    seen?.title === 'Bai kiem thu', seen);
  check('thanh vien chua mua KHONG lay duoc ma video',
    seen && seen.video_id === undefined, seen?.video_id);
  check('thanh vien chua mua KHONG lay duoc link bai tap / tai lieu',
    seen && seen.assignment_url === undefined && seen.doc_url === undefined, seen);
  check('co co "locked" de giao dien biet ma hien', seen?.locked === true, seen?.locked);

  const lessonDirect = await alice.call('GET', `/api/entities/Lesson/${lessonId}`);
  check('lay thang theo id cung KHONG lo ma video',
    lessonDirect.data?.video_id === undefined, lessonDirect.data?.video_id);

  // Cap quyen -> phai thay ngay, khong can deploy hay lam gi them
  sql(`INSERT INTO entitlements (id,user_id,kind,ref,source,granted_at,created_date,updated_date) VALUES ('e-test-${Date.now()}','${alice.id}','course','${courseId}','manual',datetime('now'),datetime('now'),datetime('now'))`);
  const afterGrant = await alice.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: courseId }))}`);
  check('sau khi duoc cap quyen thi thay ma video',
    (afterGrant.data || [])[0]?.video_id === 'bi-mat-123', (afterGrant.data || [])[0]);

  const lessonAsAdmin = await admin.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: courseId }))}`);
  check('admin luon thay day du', (lessonAsAdmin.data || [])[0]?.video_id === 'bi-mat-123');

  // --- Cap bac cung la mot cong khoa ----------------------------------------
  //
  // gateByCourse coi mot khoa la mo khi  !requires_unlock VA myLevel >= min_level
  // (entities/repo.js:260-263). Nhung KHONG MOT BAI NAO tung phu ve `min_level`:
  // moi khoa trong bo test deu dat min_level = 0.
  //
  // Va da co luc hai phia lech nhau theo huong te nhat: giao dien bo qua han
  // min_level nen ve khoa nhu DA MO, con completeLesson cung chi nhin
  // requires_unlock - tuc la hoc vien bam "Da hoc xong" tren mot bai ma may chu
  // tu choi phat video, VAN duoc cong 15 XP / 5 xu, va den bai cuoi con an them
  // 200 XP / 100 xu thuong hoan thanh khoa. Diem sai con te hon khong co diem.
  const capId = `c-cap-${Date.now()}`;
  const baiCapId = `l-cap-${Date.now()}`;
  sql(`INSERT INTO courses (id,name,description,min_level,requires_unlock,is_active,sort_order,created_date,updated_date) VALUES ('${capId}','Khoa can cap 3','',3,0,1,0,datetime('now'),datetime('now'))`);
  sql(`INSERT INTO lessons (id,course_id,title,video_provider,video_id,xp,coin,sort_order,created_date,updated_date) VALUES ('${baiCapId}','${capId}','Bai can cap 3','wistia','video-cap-3',0,0,0,datetime('now'),datetime('now'))`);

  const baiChuaDuCap = await alice.call('GET', `/api/entities/Lesson/${baiCapId}`);
  check('khoa co min_level: chua du cap thi KHONG thay ma video',
    baiChuaDuCap.data?.video_id === undefined && baiChuaDuCap.data?.locked === true,
    baiChuaDuCap.data);

  const hocChuaDuCap = await alice.call('POST', '/api/functions/completeLesson', { lesson_id: baiCapId });
  check('khoa co min_level: chua du cap thi KHONG cong diem duoc',
    hocChuaDuCap.status === 403 && hocChuaDuCap.data?.error?.code === 'chua_du_cap',
    hocChuaDuCap.data);

  // Du cap roi thi phai vao duoc - chan qua tay cung sai nhu cho lot.
  const xpCu = (await alice.call('GET', '/api/auth/me')).data?.total_xp ?? 0;
  sql(`UPDATE users SET total_xp = 999999 WHERE id = '${alice.id}'`);

  const baiDuCap = await alice.call('GET', `/api/entities/Lesson/${baiCapId}`);
  check('khoa co min_level: du cap thi thay ma video',
    baiDuCap.data?.video_id === 'video-cap-3', baiDuCap.data);

  const hocDuCap = await alice.call('POST', '/api/functions/completeLesson', { lesson_id: baiCapId });
  check('khoa co min_level: du cap thi hoc duoc binh thuong',
    hocDuCap.status === 200 && hocDuCap.data?.ok === true, hocDuCap.data);

  sql(`UPDATE users SET total_xp = ${Number(xpCu) || 0} WHERE id = '${alice.id}'`);
  sql(`DELETE FROM lesson_progress WHERE lesson_id='${baiCapId}'`);
  sql(`DELETE FROM lessons WHERE id='${baiCapId}'`);
  sql(`DELETE FROM courses WHERE id='${capId}'`);

  sql(`DELETE FROM entitlements WHERE ref='${courseId}'`);
  sql(`DELETE FROM lessons WHERE id='${lessonId}'`);
  sql(`DELETE FROM courses WHERE id='${courseId}'`);


  // Tra tien xong phai TU mo quyen. Truoc day khong he co buoc nay: don chuyen
  // 'paid', sinh hoa hong, roi het - khoa hoc van khoa cho den khi admin nho mo
  // tay cho tung nguoi.
  const orderCode = `VIPTEST${Date.now()}`.slice(0, 20);
  sql(`INSERT INTO orders (code,product_sku,product_name,amount,status,transfer_content,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES ('${orderCode}','${SKU_TEST}','Ve VIP',399000,'pending','${orderCode}','Alice','${alice.email}','0912345678',datetime('now'),datetime('now'))`);

  const paidRes = await admin.call('POST', `/api/admin/orders/${orderCode}/paid`, { amount: 399000 });
  check('admin xac nhan duoc don da tra tien', paidRes.status === 200 && paidRes.data.ok, paidRes.data);

  const ents = sql(`SELECT kind, ref, source FROM entitlements WHERE user_id='${alice.id}'`);
  check('tra tien xong TU DONG duoc mo quyen',
    ents.some((e) => e.kind === 'package' && e.ref === SKU_TEST && e.source === 'order'), ents);

  // Webhook ngan hang hay ban lai. Chay lai buoc mo quyen khong duoc sinh dong thu hai.
  await admin.call('POST', `/api/admin/orders/${orderCode}/paid`, { amount: 399000 });
  const entsAgain = sql(`SELECT id FROM entitlements WHERE user_id='${alice.id}' AND ref='${SKU_TEST}'`);
  check('xac nhan lai lan hai KHONG tao quyen trung', entsAgain.length === 1, entsAgain.length);

  sql(`DELETE FROM entitlements WHERE user_id='${alice.id}'`);
  sql(`DELETE FROM commissions WHERE order_id IN (SELECT id FROM orders WHERE code='${orderCode}')`);
  sql(`DELETE FROM orders WHERE code='${orderCode}'`);

  // Duong tai anh len: truoc day chi duoc liet ke trong danh sach kiem CSRF chu
  // khong co ai xu ly -> moi lenh goi roi xuong 404 va ba cho trong app hong am tham.
  const upload = await alice.call('POST', '/api/files', {});
  check('duong tai anh da co nguoi xu ly (khong con 404)',
    upload.status !== 404, { status: upload.status, data: upload.data });
  check('chua co kho anh thi bao bang cau HOC VIEN doc duoc',
    (upload.status === 503 || upload.status === 400)
    && !/Cloudflare|Dashboard|R2/i.test(JSON.stringify(upload.data || '')),
    upload.data);

  // ------------------------------------------------------- trang Affiliate
  console.log('');
  console.log('13. Trang Affiliate cua hoc vien');

  // Ban cu tra affiliate theo COOKIE PHIEN CUA TRANG BAN HANG. Hoc vien dang
  // nhap vao app khong he co cookie do -> trang Affiliate cua ho luon 404 va
  // khong bao gio hien duoc link gioi thieu hay hoa hong.
  //
  // Va tu 10/09/2026, mo tab nay ma CHUA co link thi duoc cap luon - xem muc 11.
  const mine = await alice.call('GET', '/api/affiliate/me');
  const maCuaAlice = mine.data?.affiliate?.code;
  check('tim duoc link gioi thieu theo TAI KHOAN DANG NHAP',
    mine.status === 200 && !!maCuaAlice, mine.data);

  const hoSo = sql(`SELECT email FROM affiliates WHERE code = '${maCuaAlice}'`);
  check('link do gan dung vao email cua nguoi dang nhap',
    String(hoSo[0]?.email || '').toLowerCase() === alice.email.toLowerCase(),
    { hoSo: hoSo[0], alice: alice.email });

  // Bob cung duoc cap link cua RIENG BOB - cai phai chan la lay nham link cua
  // nguoi khac, vi token trong do mo duoc toan bo trang thong ke va hoa hong.
  const notMine = await bob.call('GET', '/api/affiliate/me');
  check('nguoi khac KHONG lay nham duoc link cua Alice',
    notMine.data?.affiliate?.code !== maCuaAlice
    && notMine.data?.links?.portal_url !== mine.data?.links?.portal_url,
    { cuaBob: notMine.data?.affiliate?.code, cuaAlice: maCuaAlice });

  // ------------------------------------------------- duong dan doc hai (XSS)
  console.log('');
  console.log('14. Chan duong dan doc hai');

  // `evidence_link` do CHINH HOC VIEN nhap roi duoc trang duyet bai cua admin
  // ve thanh the <a> bam duoc. Mot dong "javascript:..." la khi admin bam se
  // chay duoi PHIEN CUA ADMIN -> hoc vien tu nang quyen minh len.
  const doc_hai = ['javascript:fetch("/api/entities/User")', 'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//ke-gian.com/x'];
  for (const bad of doc_hai) {
    const r = await alice.call('POST', '/api/functions/logActivity', {
      activity_type_key: 'content', title: 'Thu', description: 'Thu', evidence_link: bad,
    });
    check(`chan duoc "${bad.slice(0, 26)}"`, r.status === 422, { status: r.status, data: r.data });
  }

  // Chan nham link that thi con te hon la khong chan
  const tot = await alice.call('POST', '/api/functions/logActivity', {
    activity_type_key: 'content', title: 'Thu link that', description: 'Thu',
    evidence_link: 'https://drive.google.com/file/d/abc/view',
  });
  check('link https that VAN nop duoc', tot.status === 200, { status: tot.status, data: tot.data });

  // -------------------------- diem cua hoat dong phai theo TUNG LOAI
  // Chi Thanh cau hinh moi loai mot muc khac nhau (goi khach 5 XP, dang content
  // 20, nop bai tap 50). Truoc day ma nguon de luat chung `activity_approved`
  // (20 XP) quyet dinh va chi doc muc cua loai khi luat chung KHONG khai so -
  // ma luat chung luon khai, nen moi loai deu tra 20 XP nhu nhau. Mot cuoc goi
  // duoc tra gap 4 lan muc dinh, tran 10 lan/ngay -> 200 XP/ngay.
  console.log('\nN. Diem hoat dong lay theo tung loai, khong phai mot so chung');

  const keyLoai = `thu${Date.now().toString(36).slice(-5)}`;
  sql(`INSERT INTO activity_types (id,name,key,description,icon,category,xp_reward,coin_reward,daily_cap,is_active,sort_order,created_date,updated_date) VALUES ('at-${keyLoai}','Loai kiem thu','${keyLoai}','','','test',7,3,5,1,99,datetime('now'),datetime('now'))`);

  // Thieu bang chung -> tu choi. Chi Thanh chot 11/09: co lam thi phai nop
  // bang chung, vi truoc do mot hoat dong chi la mot dong chu tu khai.
  const thieuBC = await alice.call('POST', '/api/functions/logActivity', {
    activity_type_key: keyLoai, title: 'Khai khong', description: 'x',
  });
  check('KHONG co bang chung -> tu choi',
    thieuBC.status === 422 && thieuBC.data?.error?.code === 'thieu_bang_chung', thieuBC.data);

  const nopHD = await alice.call('POST', '/api/functions/logActivity', {
    activity_type_key: keyLoai, title: 'Thu diem theo loai', description: 'x',
    evidence_link: 'https://drive.google.com/file/d/bangchung/view',
  });
  check('co bang chung -> nop duoc', nopHD.status === 200 && !!nopHD.data?.activity?.id, nopHD.data);

  const chiCoAnh = await alice.call('POST', '/api/functions/logActivity', {
    activity_type_key: keyLoai, title: 'Chi co anh', description: 'x',
    screenshot_url: '/api/files/u/anh-chup.jpg',
  });
  check('chi co ANH cung du, khong bat phai co ca hai', chiCoAnh.status === 200, chiCoAnh.data);
  sql(`DELETE FROM activities WHERE title = 'Chi co anh'`);

  const xpTruocHD = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  const duyetHD = await admin.call('POST', '/api/functions/approveActivity', {
    activity_id: nopHD.data.activity.id, action: 'approve',
  });
  check('duyet duoc', duyetHD.status === 200, duyetHD.data);
  check('cong DUNG so cua loai (7 XP / 3 xu), khong phai 20 cua luat chung',
    duyetHD.data?.awarded?.xp === 7 && duyetHD.data?.awarded?.coin === 3, duyetHD.data?.awarded);

  const xpSauHD = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  check('tong XP tang dung 7', xpSauHD === xpTruocHD + 7, { xpTruocHD, xpSauHD });

  sql(`DELETE FROM point_awards WHERE source_id = '${nopHD.data.activity.id}'`);
  sql(`DELETE FROM xp_transactions WHERE user_id = '${alice.id}' AND source = 'activity_approved'`);
  sql(`DELETE FROM coin_transactions WHERE user_id = '${alice.id}' AND source = 'activity_approved'`);
  sql(`DELETE FROM activities WHERE activity_type_key = '${keyLoai}'`);
  sql(`DELETE FROM activity_types WHERE key = '${keyLoai}'`);

  // --- Tran chung 40 XP/ngay cho TAT CA hoat dong cong lai -------------------
  //
  // Tran rieng cua tung loai khong du: moi loai tu chan minh, cong lai thi
  // khong ai chan. Voi cau hinh cu (goi 10 lan, content 3, bai tap 2) mot nguoi
  // lam du ca ba muc duoc 210 XP/ngay, trong khi di hoc duoc 10 va bai tap duoc
  // cham duoc 15 - bang xep hang do rieng muc hoat dong quyet dinh.
  console.log('\nN2. Tran chung moi ngay cho diem hoat dong');

  const keyTran = `tran${Date.now().toString(36).slice(-5)}`;
  sql(`INSERT INTO activity_types (id,name,key,description,icon,category,xp_reward,coin_reward,daily_cap,is_active,sort_order,created_date,updated_date) VALUES ('at-${keyTran}','Loai tran','${keyTran}','','','test',30,5,9,1,99,datetime('now'),datetime('now'))`);

  const nopTran = async (ten) => {
    const r = await alice.call('POST', '/api/functions/logActivity', {
      activity_type_key: keyTran, title: ten, description: 'x', date: '2026-09-12',
      evidence_link: 'https://drive.google.com/file/d/bangchung/view',
    });
    const d = await admin.call('POST', '/api/functions/approveActivity', {
      activity_id: r.data.activity.id, action: 'approve',
    });
    return d.data?.awarded?.xp;
  };

  check('hoat dong dau trong ngay: nhan du 30 XP', (await nopTran('Tran 1')) === 30);
  check('hoat dong thu hai: bi cat con 10 XP cho vua tran 40',
    (await nopTran('Tran 2')) === 10);
  check('hoat dong thu ba: het tran, khong con XP nao', (await nopTran('Tran 3')) === 0);

  // Tran tinh theo NGAY CUA HOAT DONG, khong phai ngay duyet: chi Thanh thuong
  // duyet don mot the sau vai hom. Lay ngay duyet thi ca tuan don vao mot ngay
  // va nguoi hoc bi cat oan.
  const homKhac = await alice.call('POST', '/api/functions/logActivity', {
    activity_type_key: keyTran, title: 'Ngay khac', description: 'x', date: '2026-09-13',
    evidence_link: 'https://drive.google.com/file/d/bangchung/view',
  });
  const duyetKhac = await admin.call('POST', '/api/functions/approveActivity', {
    activity_id: homKhac.data.activity.id, action: 'approve',
  });
  check('sang ngay khac thi tran mo lai, nhan du 30 XP',
    duyetKhac.data?.awarded?.xp === 30, duyetKhac.data?.awarded);

  sql(`DELETE FROM point_awards WHERE user_id = '${alice.id}' AND event_key = 'activity_approved'`);
  sql(`DELETE FROM xp_transactions WHERE user_id = '${alice.id}' AND source = 'activity_approved'`);
  sql(`DELETE FROM coin_transactions WHERE user_id = '${alice.id}' AND source = 'activity_approved'`);
  sql(`DELETE FROM activities WHERE activity_type_key = '${keyTran}'`);
  sql(`DELETE FROM activity_types WHERE key = '${keyTran}'`);

  // Duong ghi thu hai: API entity truc tiep, khong qua ham nghiep vu
  const quaEntity = await alice.call('POST', '/api/entities/Activity', {
    user_id: alice.id, activity_type_key: 'content', title: 'X', evidence_link: 'javascript:alert(1)',
  });
  check('duong API entity cung bi chan', quaEntity.status === 422 || quaEntity.status === 403,
    quaEntity.status);

  // Admin cung khong duoc phep - de sau nay khong ai phai nho field nao an toan
  const adminBad = await admin.call('POST', '/api/entities/CalendarEvent', {
    title: 'Buoi xau', starts_at: new Date().toISOString(), join_url: 'javascript:alert(1)',
  });
  check('field cua admin cung bi chan', adminBad.status === 422, adminBad.status);

  sql("DELETE FROM activities WHERE title IN ('Thu','Thu link that','X')");
  sql("DELETE FROM calendar_events WHERE title='Buoi xau'");

  // -------------------------------------------------------- lich & su kien
  console.log('');
  console.log('15. Lich & su kien');

  const evId = `ev-test-${Date.now()}`;
  const soon = new Date(Date.now() + 86400000).toISOString();
  sql(`INSERT INTO calendar_events (id,title,description,kind,starts_at,location,join_url,recording_url,capacity,min_level,requires_unlock,status,is_active,created_date,updated_date) VALUES ('${evId}','Live kiem thu','','live','${soon}','Zoom','https://vidu/phong-bi-mat','https://vidu/ban-ghi',2,0,0,'scheduled',1,datetime('now'),datetime('now'))`);

  // Duong vao phong la thu phai giu kin: lo ra la ai cung vao duoc buoi live.
  const seenBefore = (await alice.call('GET',
    `/api/entities/CalendarEvent?filter=${encodeURIComponent(JSON.stringify({ id: evId }))}`)).data?.[0];
  check('chua dang ky VAN thay buoi tren lich', seenBefore?.title === 'Live kiem thu', seenBefore);
  check('chua dang ky KHONG lay duoc duong vao phong',
    seenBefore && seenBefore.join_url === undefined, seenBefore?.join_url);
  check('chua dang ky KHONG lay duoc ban ghi lai',
    seenBefore && seenBefore.recording_url === undefined, seenBefore?.recording_url);

  const joined = await alice.call('POST', '/api/functions/joinEvent', { event_id: evId });
  check('giu duoc cho', joined.status === 200 && joined.data.joined === true, joined.data);

  const seenAfter = (await alice.call('GET',
    `/api/entities/CalendarEvent?filter=${encodeURIComponent(JSON.stringify({ id: evId }))}`)).data?.[0];
  check('dang ky xong thi thay duong vao phong',
    seenAfter?.join_url === 'https://vidu/phong-bi-mat', seenAfter?.join_url);

  const again = await alice.call('POST', '/api/functions/joinEvent', { event_id: evId });
  check('bam giu cho lan hai khong tao cho thu hai', again.data?.joined === false, again.data);
  const rowCount = sql(`SELECT COUNT(*) AS n FROM event_signups WHERE event_id='${evId}'`);
  check('database chi co dung mot dong dang ky', rowCount[0]?.n === 1, rowCount);

  // Het cho thi phai tu choi, khong duoc nhan bua
  const bob2 = await makeUser('bob2');
  await bob2.call('POST', '/api/functions/joinEvent', { event_id: evId });
  const carol = await makeUser('carol');
  const full = await carol.call('POST', '/api/functions/joinEvent', { event_id: evId });
  check('het cho thi tu choi', full.status === 409 && full.data?.error?.code === 'full', full.data);

  // Diem danh: cho duy nhat cong diem event_attended
  const xpBefore = sql(`SELECT total_xp, total_coin FROM users WHERE id='${alice.id}'`)[0];
  const mark = await admin.call('POST', '/api/functions/markEventAttendance',
    { event_id: evId, user_ids: [alice.id], present: true });
  check('admin diem danh duoc', mark.status === 200 && mark.data.ok, mark.data);
  const xpAfter = sql(`SELECT total_xp, total_coin FROM users WHERE id='${alice.id}'`)[0];
  check('diem danh xong duoc cong XP theo luat event_attended',
    xpAfter.total_xp > xpBefore.total_xp, { truoc: xpBefore, sau: xpAfter });

  // Bam diem danh hai lan la chuyen rat de xay ra khi admin lam tay.
  await admin.call('POST', '/api/functions/markEventAttendance',
    { event_id: evId, user_ids: [alice.id], present: true });
  const xpTwice = sql(`SELECT total_xp FROM users WHERE id='${alice.id}'`)[0];
  check('diem danh lan hai KHONG cong them lan nua',
    xpTwice.total_xp === xpAfter.total_xp, { lan1: xpAfter.total_xp, lan2: xpTwice.total_xp });

  const memberMark = await bob2.call('POST', '/api/functions/markEventAttendance',
    { event_id: evId, user_ids: [bob2.id], present: true });
  check('thanh vien thuong KHONG tu diem danh duoc', memberMark.status === 403, memberMark.status);

  const evWrite = await alice.call('POST', '/api/entities/CalendarEvent',
    { title: 'Buoi tu tao', starts_at: soon });
  check('thanh vien thuong KHONG tao duoc buoi', evWrite.status === 403, evWrite.status);

  const signupWrite = await alice.call('POST', '/api/entities/EventSignup',
    { event_id: evId, user_id: alice.id, status: 'attended' });
  check('KHONG tu ghi duoc dong dang ky (phai qua joinEvent)',
    signupWrite.status === 403, signupWrite.status);

  sql(`DELETE FROM point_awards WHERE event_key='event_attended'`);
  sql(`DELETE FROM event_signups WHERE event_id='${evId}'`);
  sql(`DELETE FROM calendar_events WHERE id='${evId}'`);

  // ------------------------------------------------------------- noi voi Kit
  console.log('');
  console.log('16. Kit (ConvertKit)');

  const kitStatus = await admin.call('GET', '/api/admin/kit/status');
  check('admin xem duoc trang thai Kit',
    kitStatus.status === 200 && kitStatus.data.ok, kitStatus.data);

  // Bai nay phai dung o CA HAI trang thai, vi may lap trinh vien co the co hoac
  // khong co khoa Kit. Chua co thi phai bao RO la chua cau hinh, khong duoc im
  // lang coi nhu da chay; co roi thi phai noi duoc voi Kit that.
  if (kitStatus.data?.configured) {
    check('da co khoa Kit -> ket noi duoc that',
      !kitStatus.data?.error, kitStatus.data?.error);
  } else {
    check('chua co khoa Kit -> bao ro ly do',
      /KIT_API_KEY/.test(kitStatus.data?.error || ''), kitStatus.data?.error);
  }

  check('noi ro OTP khong di qua Kit',
    /OTP/.test(kitStatus.data?.note || ''), kitStatus.data?.note);

  // Bo test tung day hang chuc dia chi @smoketest.local sang tai khoan Kit THAT
  // cua chi Thanh. Chung nam trong chuoi email, va bat len la bounce hang loat
  // -> ha uy tin gui thu cua ten mien. Da phai vao don tay 14 dia chi.
  const kitLog = sql("SELECT COUNT(*) AS n FROM kit_sync_log WHERE created_at > datetime('now','-2 minutes')");
  check('chay test KHONG duoc day du lieu sang Kit that',
    (kitLog[0]?.n ?? 0) === 0, { so_dong_vua_ghi: kitLog[0]?.n });

  const kitMember = await alice.call('GET', '/api/admin/kit/status');
  check('thanh vien thuong KHONG xem duoc trang thai Kit',
    kitMember.status === 401 || kitMember.status === 503, kitMember.status);

  const kitBackfillMember = await alice.call('POST', '/api/admin/kit/backfill', { source: 'leads' });
  check('thanh vien thuong KHONG chay duoc lenh day danh sach',
    kitBackfillMember.status === 401 || kitBackfillMember.status === 503, kitBackfillMember.status);

  // Kho API la secret cua Worker. Neu ai do cat no vao app_settings thi moi
  // thanh vien da dang nhap deu doc duoc (AppSetting.read = 'all').
  const allSettings = await alice.call('GET', '/api/entities/AppSetting');
  const leaked = (allSettings.data || []).filter(
    (r) => /api[_-]?key|secret|token/i.test(r.key) || String(r.value || '').startsWith('kit_'));
  check('KHONG co kho API nao nam trong app_settings', leaked.length === 0, leaked);

  // Kiem theo TEN khoa chu khong dem so luong: dem thi them mot cau hinh moi la
  // test do, ma khong noi duoc thieu dung cai nao.
  const kitKeys = new Set((allSettings.data || [])
    .filter((r) => r.category === 'kit').map((r) => r.key));
  const kitCanCo = ['kit_enabled',
    'kit_tag_lead', 'kit_tag_member', 'kit_tag_customer',
    'kit_sequence_lead', 'kit_sequence_welcome', 'kit_sequence_customer'];
  const kitThieu = kitCanCo.filter((k) => !kitKeys.has(k));
  check('co du cau hinh Kit cho ca ba buoc (tag + chuoi email)',
    kitThieu.length === 0, { thieu: kitThieu });

  const kitWrite = await alice.call('POST', '/api/entities/AppSetting',
    { key: 'kit_tag_lead_gia', value: '1', type: 'string', category: 'kit' });
  check('thanh vien thuong KHONG sua duoc cau hinh Kit', kitWrite.status === 403, kitWrite.status);

  // Kit hong khong duoc lam hong duong dang ky. Chua co kho API la mot dang
  // "hong" - form van phai chay binh thuong.
  const leadRes = await fetchLaiMotLan(`${BASE}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Kiem Thu Kit',
      email: 'kitcheck@smoketest.local',
      phone: `09${String(Date.now()).slice(-8)}`,
      answers_schema: 'html',
      answers: {
        q1: 'Rồi, tôi đã từng thử mô hình kinh doanh online trước đây',
        q2: 'Xây một hệ thống thu nhập lớn, quy mô dài hạn',
        q3: 'Trên 15 giờ/tuần',
        q4: ['Thiếu thời gian vì công việc/gia đình hiện tại'],
        q5: 'Đã dùng để làm việc/kinh doanh nhưng chưa có hệ thống',
        q6: ['Có người đồng hành, cố vấn trực tiếp thay vì tự mày mò'],
        q7: 'Kinh doanh tự do / chủ shop, chủ dịch vụ nhỏ',
        q8: 'Trên 70 triệu/tháng',
      },
    }),
  });
  check('Kit chua cau hinh van tao duoc lead binh thuong',
    leadRes.status === 200 || leadRes.status === 201, leadRes.status);

  const logTable = sql("SELECT name FROM sqlite_master WHERE type='table' AND name='kit_sync_log'");
  check('bang nhat ky dong bo da duoc tao', logTable.length === 1, logTable);

  const kitCols = sql("SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name='kit_subscriber_id'");
  check('users co cot kit_subscriber_id de doi soat', kitCols[0]?.n === 1, kitCols);

  // -------------------------------------------------------------- huy hieu
  // Truoc dot nay KHONG MOT AI trong he thong tung duoc trao huy hieu: bang
  // user_badges chua bao gio duoc ghi vao, du 8 huy hieu da nam san trong
  // database. Day la bo test khoa cai do lai.
  console.log('\nN. Huy hieu');

  const idHuyHieu = `hh-test-${Date.now()}`;
  sql(`INSERT INTO badges (id, name, key, icon, description, condition_type, condition_value, xp_bonus, coin_bonus, is_active, sort_order, created_date, updated_date) VALUES ('${idHuyHieu}', 'Huy hieu kiem thu', 'test_badge_${Date.now()}', '🧪', 'Chi de kiem thu', NULL, NULL, 0, 0, 1, 999, '${new Date().toISOString()}', '${new Date().toISOString()}')`);

  const traoBoiMember = await alice.call('POST', '/api/functions/grantBadge', {
    target_user_id: alice.id, badge_id: idHuyHieu,
  });
  check('thanh vien KHONG tu trao huy hieu cho minh duoc', traoBoiMember.status === 403);

  const trao = await admin.call('POST', '/api/functions/grantBadge', {
    target_user_id: alice.id, badge_id: idHuyHieu,
  });
  check('admin trao duoc huy hieu', trao.status === 200 && trao.data.ok, trao.data);

  const coHuyHieu = sql(`SELECT badge_name FROM user_badges WHERE user_id = '${alice.id}' AND badge_id = '${idHuyHieu}'`);
  check('huy hieu da vao so cua hoc vien', coHuyHieu.length === 1, coHuyHieu);

  const traoLai = await admin.call('POST', '/api/functions/grantBadge', {
    target_user_id: alice.id, badge_id: idHuyHieu,
  });
  check('trao lan hai KHONG tao ban ghi trung', traoLai.status === 409, traoLai.data);

  const baoTin = sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = '${alice.id}' AND type = 'badge'`);
  check('hoc vien duoc bao tin khi nhan huy hieu', baoTin[0]?.n >= 1, baoTin);

  const nhatKyTrao = sql(`SELECT action FROM admin_logs WHERE action = 'grant_badge' AND target_user_id = '${alice.id}'`);
  check('trao huy hieu co ghi nhat ky quan tri', nhatKyTrao.length >= 1, nhatKyTrao);

  const thuHoi = await admin.call('POST', '/api/functions/revokeBadge', {
    target_user_id: alice.id, badge_id: idHuyHieu, reason: 'kiem thu',
  });
  check('admin thu hoi duoc huy hieu', thuHoi.status === 200, thuHoi.data);
  const conLai = sql(`SELECT id FROM user_badges WHERE user_id = '${alice.id}' AND badge_id = '${idHuyHieu}'`);
  check('thu hoi thi ban ghi bien mat', conLai.length === 0, conLai);

  // -------------------------------------------------------------- thong bao hang loat
  console.log('\nN. Gui thong bao hang loat');

  const guiBoiMember = await alice.call('POST', '/api/functions/sendNotification', {
    audience: 'all', title: 'Thu gui bay',
  });
  check('thanh vien KHONG gui thong bao hang loat duoc', guiBoiMember.status === 403);

  const truocKhiGui = sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = '${alice.id}'`)[0].n;
  const gui = await admin.call('POST', '/api/functions/sendNotification', {
    audience: 'user', user_id: alice.id,
    title: 'Toi nay 20h co buoi live', body: 'Nho vao som 5 phut',
    link: '/calendar',
  });
  check('admin gui duoc thong bao', gui.status === 200 && gui.data.so_nguoi === 1, gui.data);
  const sauKhiGui = sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = '${alice.id}'`)[0].n;
  check('thong bao vao dung hop cua nguoi nhan', sauKhiGui === truocKhiGui + 1, { truocKhiGui, sauKhiGui });

  const coLink = sql(`SELECT link FROM notifications WHERE user_id = '${alice.id}' AND type = 'admin' ORDER BY created_date DESC LIMIT 1`);
  check('thong bao mang theo duong dan de bam vao', coLink[0]?.link === '/calendar', coLink);

  // Link https:// duoc GIU tu khi chi Thanh can gui link Zoom moi buoi. Truoc
  // day no bi xoa im lang: bam gui, he thong bao "da gui toi 347 nguoi", va
  // 347 nguoi nhan mot thong bao khong co nut bam nao.
  await admin.call('POST', '/api/functions/sendNotification', {
    audience: 'user', user_id: alice.id,
    title: 'Thu link Zoom', link: 'https://zoom.us/j/123456789',
  });
  const linkZoom = sql(`SELECT link FROM notifications WHERE user_id = '${alice.id}' AND title = 'Thu link Zoom'`);
  check('link https:// duoc giu de gui link Zoom',
    linkZoom[0]?.link === 'https://zoom.us/j/123456789', linkZoom);

  // Nhung lich KHONG phai https thi van bi bo: javascript: la duong chay ma
  // trong trinh duyet cua hoc vien, khong phai mot cho de di toi.
  await admin.call('POST', '/api/functions/sendNotification', {
    audience: 'user', user_id: alice.id,
    title: 'Thu chen link la', link: 'javascript:alert(1)',
  });
  const linkLa = sql(`SELECT link FROM notifications WHERE user_id = '${alice.id}' AND title = 'Thu chen link la'`);
  check('lich khong phai https bi loai bo', !linkLa[0]?.link, linkLa);

  // Duong dan "noi bo" bat dau bang // hoac /\\ thi KHONG noi bo: trinh duyet
  // doc chung la dia chi ngoai, nen mot thong bao co link "//evil.com" dan hoc
  // vien ra khoi manhthanh.net trong khi phep thu cu ("co bat dau bang / khong")
  // van cho qua. Hien chi quan tri gui duoc thong bao nen day la lop du phong,
  // nhung dung lop nay cung la dang ma canh bao react-router GHSA-wrjc-x8rr-h8h6
  // noi toi - trang ThongBao goi navigate(tin.link).
  for (const [nhan, duong] of [['hai gach cheo', '//vi-du-ngoai.test'],
    ['gach cheo nguoc', '/\\vi-du-ngoai.test']]) {
    const tieuDe = `Thu chuyen huong ${nhan}`;
    await admin.call('POST', '/api/functions/sendNotification', {
      audience: 'user', user_id: alice.id, title: tieuDe, link: duong,
    });
    const r = sql(`SELECT link FROM notifications WHERE user_id = '${alice.id}' AND title = '${tieuDe}'`);
    check(`link ${nhan} bi loai bo (khong dan ra ngoai)`, !r[0]?.link, r);
  }

  // Va duong dan noi bo THAT thi van phai di qua.
  await admin.call('POST', '/api/functions/sendNotification', {
    audience: 'user', user_id: alice.id, title: 'Thu link noi bo', link: '/challenges',
  });
  const linkTrong = sql(`SELECT link FROM notifications WHERE user_id = '${alice.id}' AND title = 'Thu link noi bo'`);
  check('link noi bo /challenges van duoc giu', linkTrong[0]?.link === '/challenges', linkTrong);

  // Thong bao danh dau popup phai duoc ghi type='popup' - do la thu duy nhat
  // lam no hien thang giua man hinh thay vi nam trong chuong.
  await admin.call('POST', '/api/functions/sendNotification', {
    audience: 'user', user_id: alice.id,
    title: 'Thu popup', link: 'https://zoom.us/j/999', popup: true,
  });
  const tinPopup = sql(`SELECT type,link FROM notifications WHERE user_id = '${alice.id}' AND title = 'Thu popup'`);
  check('thong bao popup duoc ghi dung kieu', tinPopup[0]?.type === 'popup', tinPopup);

  const nhatKyGui = sql("SELECT action FROM admin_logs WHERE action = 'send_notification'");
  check('gui thong bao co ghi nhat ky quan tri', nhatKyGui.length >= 1, nhatKyGui);

  // Chinh sach cu van phai giu: ke ca admin cung khong doc trom duoc thong bao
  // rieng cua nguoi khac qua API entity.
  const adminDocTrom = await admin.call('GET',
    `/api/entities/Notification?filter=${encodeURIComponent(JSON.stringify({ user_id: alice.id }))}`);
  check('admin VAN khong doc duoc thong bao rieng cua hoc vien',
    (adminDocTrom.data || []).length === 0, adminDocTrom.data);

  sql(`DELETE FROM user_badges WHERE badge_id = '${idHuyHieu}'`);
  sql(`DELETE FROM badges WHERE id = '${idHuyHieu}'`);

  // ---------------------------------------------- nop bai va cham bai thu thach
  // Ca duong nay TRUOC DAY KHONG CO MOT DONG TEST NAO, va do la ly do khong ai
  // phat hien ra no dut: duong cham duy nhat la nho AI (can ANTHROPIC_API_KEY),
  // khong co ham cham tay, va khong trang quan tri nao nhin thay bai nop. Nguoi
  // hoc nop xong chi thay "Dang cho cham bai..." mai mai.
  console.log('\nN. Nop bai va cham bai thu thach');

  const tNay = new Date().toISOString();
  const idTT = `tt-test-${Date.now()}`;
  const idNhiemVu = `nv-test-${Date.now()}`;
  sql(`INSERT INTO challenges (id, name, description, is_active, created_date, updated_date) VALUES ('${idTT}', 'Thu thach kiem thu', '', 1, '${tNay}', '${tNay}')`);
  sql(`INSERT INTO challenge_day_tasks (id, challenge_id, day, title, guide, xp, coin, created_date, updated_date) VALUES ('${idNhiemVu}', '${idTT}', 1, 'Ngay 1 kiem thu', 'Tieu chi cham', 50, 20, '${tNay}', '${tNay}')`);

  const thamGia = await alice.call('POST', '/api/functions/joinChallenge', { challenge_id: idTT });
  check('hoc vien tham gia duoc thu thach', thamGia.status === 200, thamGia.data);

  const chuaThamGia = await bob.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTT, day: 1, content: 'nop lau',
  });
  check('chua tham gia thi KHONG nop bai duoc', chuaThamGia.status === 403, chuaThamGia.data);

  const nop = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTT, day: 1, content: 'Bai lam cua em', link: 'https://vi-du.test/bai-lam',
  });
  check('nop bai thu thach thanh cong', nop.status === 200 && nop.data.ok, nop.data);
  const idBai = nop.data?.submission?.id;
  check('bai nop bat dau o trang thai cho cham', nop.data?.submission?.status === 'pending', nop.data?.submission);

  // Day la khang dinh quan trong nhat: PHAI cham duoc ma khong can AI.
  const chamBoiMember = await alice.call('POST', '/api/functions/reviewChallengeDay', {
    submission_id: idBai, action: 'approve',
  });
  check('hoc vien KHONG tu cham bai cua minh duoc', chamBoiMember.status === 403, chamBoiMember.data);

  const xpTruoc = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  const cham = await admin.call('POST', '/api/functions/reviewChallengeDay', {
    submission_id: idBai, action: 'approve', feedback: 'Bai tot, giu nhip nhe', score: 85,
  });
  check('admin cham TAY duoc, khong can AI', cham.status === 200 && cham.data.passed, cham.data);
  // Chi Thanh chot 11/09: NOP BAI KHONG CON CONG DIEM. Diem cua mot ngay den
  // tu diem danh. Bai duoi giu chinh chieu do - `challenge_day_tasks.xp` van
  // co gia tri nhung khong duoc tra ra nua.
  check('cham bai KHONG con cong diem',
    cham.data?.awarded?.xp === 0 && cham.data?.awarded?.coin === 0, cham.data?.awarded);
  check('diem so duoc ghi lai', cham.data?.score === 85, cham.data);

  const xpSau = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  check('XP cua hoc vien KHONG doi sau khi duyet bai', xpSau === xpTruoc, { xpTruoc, xpSau });

  const congNop = sql(`SELECT COUNT(*) AS n FROM xp_transactions WHERE source = 'challenge_day_scored' AND user_id = '${alice.id}'`);
  check('khong sinh giao dich XP nao cho bai nop', Number(congNop[0]?.n) === 0, congNop[0]);

  const baiSauCham = sql(`SELECT status, score, feedback, reviewed_by FROM challenge_submissions WHERE id = '${idBai}'`)[0];
  check('bai chuyen sang da duyet', baiSauCham?.status === 'approved', baiSauCham);
  check('nhan xet cua nguoi cham duoc luu', baiSauCham?.feedback === 'Bai tot, giu nhip nhe', baiSauCham);
  check('ghi ro nguoi cham chu khong phai ai', baiSauCham?.reviewed_by === admin.id, baiSauCham);

  const tienDo = sql(`SELECT progress FROM challenge_members WHERE challenge_id = '${idTT}' AND user_id = '${alice.id}'`)[0];
  check('tien do cua hoc vien duoc cap nhat', tienDo?.progress === 1, tienDo);

  const tinCham = sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = '${alice.id}' AND type = 'approval'`)[0];
  check('hoc vien duoc bao tin ket qua cham', tinCham?.n >= 1, tinCham);

  const nhatKyCham = sql(`SELECT action FROM admin_logs WHERE action = 'approve_challenge_day'`);
  check('cham bai co ghi nhat ky quan tri', nhatKyCham.length >= 1, nhatKyCham);

  const chamLai = await admin.call('POST', '/api/functions/reviewChallengeDay', {
    submission_id: idBai, action: 'reject', feedback: 'doi y',
  });
  check('cham lai bai da cham -> bi chan', chamLai.status === 409, chamLai.data);

  // Bai bi tu choi: khong cong diem, nhung van phai bao cho nguoi hoc biet vi sao.
  const nop2 = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTT, day: 1, content: 'Bai lam lan hai',
  });
  const idBai2 = nop2.data?.submission?.id;
  check('nop lai cung ngay thi SUA bai cu chu khong tao bai moi', idBai2 === idBai, { idBai, idBai2 });

  // NOP LAI MOT NGAY DA DUYET KHONG DUOC HA NO VE "CHO DUYET".
  //
  // Bai vua nop lai o tren la ngay 1 - ngay da duoc admin duyet cach day vai
  // dong. Ban cu luon ghi `status: 'pending'`, nen mot cu bam nham (hay mot lan
  // sua link dan sai) la mat cong nhan: `progress` dem so bai `approved` nen
  // tien do tut tu 1 ve 0, va the ngay doi mau tu xanh ve vang. Hoc vien khong
  // lam gi sai va khong co cach nao lay lai.
  const baiSauNopLai = sql(`SELECT status, content FROM challenge_submissions WHERE id = '${idBai}'`)[0];
  check('nop lai ngay DA DUYET van giu nguyen cong nhan',
    baiSauNopLai?.status === 'approved', baiSauNopLai);
  check('nop lai ngay da duyet van luu duoc noi dung moi',
    baiSauNopLai?.content === 'Bai lam lan hai', baiSauNopLai);
  check('may chu noi ro la da duyet tu truoc, de giao dien khong bao nham',
    nop2.data?.da_duyet_truoc_do === true, nop2.data);

  const tienDoSauNopLai = sql(`SELECT progress FROM challenge_members WHERE challenge_id = '${idTT}' AND user_id = '${alice.id}'`)[0];
  check('nop lai KHONG lam tut tien do', tienDoSauNopLai?.progress === 1, tienDoSauNopLai);

  // ------------------------------------------- diem danh ngay trong thu thach
  // Diem danh cua thu thach va cua trang Lich phai la MOT: cung buoi, cung ban
  // ghi co mat, cung mot lan cong diem. Hai duong rieng la co ngay mot nguoi
  // duoc cong chuyen can hai lan cho cung mot buoi.
  const idBuoiTT = `ev-tt-${Date.now()}`;
  const batDauTT = new Date(Date.now() - 2 * 60000).toISOString();   // dang trong khung gio
  sql(`INSERT INTO calendar_events (id,title,kind,starts_at,checkin_open_min,checkin_close_min,status,is_active,created_date,updated_date) VALUES ('${idBuoiTT}','Buoi ngay 1','live','${batDauTT}',0,15,'scheduled',1,datetime('now'),datetime('now'))`);
  sql(`UPDATE challenge_day_tasks SET event_id = '${idBuoiTT}' WHERE id = '${idNhiemVu}'`);

  const lich = await alice.call('POST', '/api/functions/lichThuThach', { challenge_id: idTT });
  check('lich thu thach tra ve buoi cua tung ngay',
    lich.status === 200 && lich.data?.days?.[0]?.event_id === idBuoiTT, lich.data);
  check('chua diem danh thi bao la chua', lich.data?.days?.[0]?.da_diem_danh === false, lich.data?.days?.[0]);

  const xpTruocDD = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  const dd = await alice.call('POST', '/api/functions/diemDanh', { event_id: idBuoiTT });
  check('vao thu thach roi thi diem danh duoc ma khong phai giu cho rieng',
    dd.status === 200 && dd.data?.awarded?.xp > 0, dd.data);
  const choTuTao = sql(`SELECT status FROM event_signups WHERE event_id='${idBuoiTT}' AND user_id='${alice.id}'`);
  check('he thong tu tao cho ngoi va danh dau co mat',
    choTuTao[0]?.status === 'attended', choTuTao);

  const ddLai = await alice.call('POST', '/api/functions/diemDanh', { event_id: idBuoiTT });
  const xpSauDD = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  check('bam lan hai khong cong diem lan hai',
    ddLai.data?.da_diem_danh === true && xpSauDD === xpTruocDD + dd.data.awarded.xp,
    { ddLai: ddLai.data, xpTruocDD, xpSauDD });

  const ddNgoai = await bob.call('POST', '/api/functions/diemDanh', { event_id: idBuoiTT });
  check('nguoi khong trong thu thach van phai giu cho truoc',
    ddNgoai.status === 403 && ddNgoai.data?.error?.code === 'chua_giu_cho', ddNgoai.data);

  sql(`DELETE FROM point_awards WHERE event_key = 'event_attended' AND user_id = '${alice.id}'`);
  sql(`DELETE FROM event_signups WHERE event_id = '${idBuoiTT}'`);
  sql(`DELETE FROM calendar_events WHERE id = '${idBuoiTT}'`);

  console.log('\nN. Danh so lai ngay, va loi trung ngay phai noi ro');

  // Bang co UNIQUE(challenge_id, day). Doi cho hai ngay bang cach sua tung dong
  // la khong bao gio duoc - va truoc day loi do hien ra thanh 500 "he thong dang
  // gap su co", nen chi Thanh sua di sua lai, lan nao cung that bai, va mot buoi
  // bi ghi de mat noi dung. Ba bai duoi giu cho ca hai nua: bao dung loi, va
  // danh so lai duoc that.
  const idN2 = `nv-test-2-${Date.now()}`;
  sql(`INSERT INTO challenge_day_tasks (id,challenge_id,day,title,guide,xp,coin,created_date,updated_date) VALUES ('${idN2}','${idTT}',2,'Ngay 2 kiem thu','',15,15,'${tNay}','${tNay}')`);

  const dungSo = await admin.call('PUT', `/api/entities/ChallengeDayTask/${idN2}`, { day: 1 });
  check('dat trung so ngay -> 409 noi ro, KHONG phai 500',
    dungSo.status === 409 && /đã có|trùng/i.test(dungSo.data?.error?.message || ''), dungSo.data);

  // Phai goi DUNG TEN COT va GIA TRI dang trung. D1 boc cau cua SQLite thanh
  // "D1_ERROR: UNIQUE constraint failed: ...: SQLITE_CONSTRAINT", nen cach cat
  // theo dau hai cham dau tien lay nham chu "D1_ERROR" va cau bao loi rung mat
  // phan duy nhat co ich. Luc do no van khop /da co|trung/ nen bai tren VAN
  // XANH - do la ly do phai co bai rieng nay.
  check('cau bao loi chi dung cho dang trung (day = 1)',
    /day\s*=\s*1/.test(dungSo.data?.error?.message || ''), dungSo.data?.error?.message);

  const doiCho = await admin.call('POST', '/api/functions/danhSoLaiNgay', {
    challenge_id: idTT,
    ngay: [{ id: idNhiemVu, day: 2 }, { id: idN2, day: 1 }],
  });
  const sauKhiDoi = (doiCho.data?.data || doiCho.data)?.ngay || [];
  check('doi cho hai ngay -> 200 va dung thu tu',
    doiCho.status === 200
      && sauKhiDoi.find((x) => x.id === idN2)?.day === 1
      && sauKhiDoi.find((x) => x.id === idNhiemVu)?.day === 2,
    sauKhiDoi);

  const veSo0 = await admin.call('POST', '/api/functions/danhSoLaiNgay', {
    challenge_id: idTT,
    ngay: [{ id: idNhiemVu, day: 0 }, { id: idN2, day: 1 }],
  });
  check('danh so ngay 0 duoc chap nhan', veSo0.status === 200, veSo0.data);

  const thanhVienDoi = await alice.call('POST', '/api/functions/danhSoLaiNgay', {
    challenge_id: idTT, ngay: [{ id: idN2, day: 5 }],
  });
  check('thanh vien khong danh so lai duoc', thanhVienDoi.status === 403, thanhVienDoi.data);

  sql(`DELETE FROM point_awards WHERE event_key = 'challenge_day_scored'`);
  sql(`DELETE FROM challenge_submissions WHERE challenge_id = '${idTT}'`);
  sql(`DELETE FROM challenge_members WHERE challenge_id = '${idTT}'`);
  sql(`DELETE FROM challenge_day_tasks WHERE challenge_id = '${idTT}'`);
  sql(`DELETE FROM challenges WHERE id = '${idTT}'`);

  // ---------------------------------------- ngay tinh theo LICH CHUONG TRINH
  // Luat: ca lop o cung mot ngay, tinh tu `start_date`, KHONG tinh tu ngay
  // tung nguoi bam tham gia.
  //
  // Vi sao co bai nay: ban truoc tinh tu `member.joined_at`, nen nguoi vao
  // muon vinh vien di sau va khong bao gio nop duoc ngay cuoi. Bai duoi dung
  // dung tinh huong do - THAM GIA HOM NAY, chuong trinh da chay duoc 3 ngay -
  // va doi hoi nop bu duoc ngay 2, dong thoi van bi chan o ngay 5.
  console.log('\nN. Ngay tinh theo lich chuong trinh, khong theo ngay tham gia');

  const idTTL = `ttl-${Date.now()}`;
  // Ngay phai tinh theo GIO VIET NAM, giong ngayThuThach() trong worker. May
  // chay test dat gio UTC: sau 17h UTC ben Viet Nam da sang ngay moi, va ca
  // khoi bai nay do vi lech dung mot ngay - khong lien quan gi den code dang
  // sua, chi la bai test gion theo gio chay.
  const ngayVN = (lechNgay = 0) =>
    new Date(Date.now() + 420 * 60000 + lechNgay * 86400000).toISOString().slice(0, 10);
  const batDauL = ngayVN(-2);
  sql(`INSERT INTO challenges (id,name,description,start_date,duration_days,is_active,created_date,updated_date) VALUES ('${idTTL}','Thu thach theo lich','','${batDauL}',5,1,datetime('now'),datetime('now'))`);
  for (const d of [2, 5]) {
    sql(`INSERT INTO challenge_day_tasks (id,challenge_id,day,title,guide,xp,coin,created_date,updated_date) VALUES ('nvl-${d}-${Date.now()}','${idTTL}',${d},'Ngay ${d}','',10,5,datetime('now'),datetime('now'))`);
  }

  // Vao muon: bam tham gia NGAY BAY GIO, khi chuong trinh da o ngay 3.
  await alice.call('POST', '/api/functions/joinChallenge', { challenge_id: idTTL });

  // Chi Thanh chot ngay 10/09: bai cua mot ngay CHI nop duoc trong ngay do.
  // Truoc do luat la nop bu duoc ngay da qua - bai nay giu chot chieu nguoc lai,
  // de neu ai do doi y lan nua thi phai doi o day chu khong lang le troi di.
  const nopBu = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTTL, day: 2, content: 'Nop bu ngay da qua',
  });
  check('ngay DA QUA -> khong nop bu duoc nua',
    nopBu.status === 409 && nopBu.data?.error?.code === 'ngay_da_dong', nopBu.data);
  check('loi noi ro hom nay la ngay may',
    /Ngày 3/.test(nopBu.data?.error?.message || ''), nopBu.data?.error?.message);

  const nopTruoc = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTTL, day: 5, content: 'Nop truoc ngay chua toi',
  });
  check('van chan nop truoc ngay chua toi',
    nopTruoc.status === 409 && nopTruoc.data?.error?.code === 'chua_toi_ngay', nopTruoc.data);
  check('loi noi ro chuong trinh dang o ngay may',
    /ngày 3/.test(nopTruoc.data?.error?.message || ''), nopTruoc.data?.error?.message);

  // Dung NGAY HOM NAY thi van nop binh thuong - chot chan khong duoc chat qua tay.
  sql(`INSERT INTO challenge_day_tasks (id,challenge_id,day,title,guide,xp,coin,created_date,updated_date) VALUES ('nvl-3-${Date.now()}','${idTTL}',3,'Ngay 3','',10,5,datetime('now'),datetime('now'))`);
  const nopHomNay = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTTL, day: 3, content: 'Bai cua hom nay', link: 'https://vi-du.test/bai',
  });
  check('dung NGAY HOM NAY -> nop duoc binh thuong',
    nopHomNay.status === 200 && nopHomNay.data?.ok, nopHomNay.data);

  // --- Ngay CHI CO BAI CAM NHAN, khong co bai tap -------------------------
  //
  // Co buoi chi Thanh khong ra bai tap nhung van muon moi nguoi viet cam nhan.
  // `st-ngay-chi-diem-danh` khong dien ta duoc truong hop nay: no bo CA HAI o
  // link. Nen co cai dat rieng `st-ngay-khong-bai-tap` chi bo o bai tap.
  console.log('\nN2. Ngay chi co bai cam nhan, khong co bai tap');

  // `type` PHAI la 'json', khong duoc bo trong: readSettings ep kieu theo cot
  // nay, va mac dinh la 'string' - luc do '[3]' ve tay ham goi nguyen si la mot
  // CHUOI, `Array.isArray` tra false, va cai dat im lang khong co tac dung nao.
  // Da mac dung loi nay mot lan tren ban that.
  sql(`INSERT INTO app_settings (key,value,type,created_date,updated_date) VALUES ('st-ngay-khong-bai-tap','[3]','json',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value='[3]', type='json'`);
  sql(`DELETE FROM challenge_submissions WHERE challenge_id = '${idTTL}'`);

  const chiCamNhan = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTTL, day: 3, content: 'Chi co cam nhan',
    file_url: 'https://facebook.com/groups/x/posts/1',
  });
  check('ngay khong co bai tap: chi can link cam nhan la duyet',
    chiCamNhan.status === 200 && chiCamNhan.data?.tu_duyet === true,
    { status: chiCamNhan.status, con_thieu: chiCamNhan.data?.con_thieu });

  // Va phai VAN doi bai cam nhan - neu bo luon thi cai dat nay khong khac gi
  // `st-ngay-chi-diem-danh`, va hoc vien khong phai nop gi ca.
  sql(`DELETE FROM challenge_submissions WHERE challenge_id = '${idTTL}'`);
  const thieuCamNhan = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTTL, day: 3, content: 'Khong co link nao',
  });
  check('van doi link cam nhan, khong duyet suong',
    thieuCamNhan.data?.tu_duyet === false
    && /cảm nhận/i.test((thieuCamNhan.data?.con_thieu || []).join(' ')),
    thieuCamNhan.data?.con_thieu);

  sql(`DELETE FROM app_settings WHERE key = 'st-ngay-khong-bai-tap'`);

  sql(`DELETE FROM challenge_submissions WHERE challenge_id = '${idTTL}'`);
  sql(`DELETE FROM challenge_members WHERE challenge_id = '${idTTL}'`);
  sql(`DELETE FROM challenge_day_tasks WHERE challenge_id = '${idTTL}'`);
  sql(`DELETE FROM challenges WHERE id = '${idTTL}'`);

  // ======================================================================
  // HOAN THANH THU THACH -> PHAI TRA THUONG
  //
  // Day la bai chung minh CA MOT CHUOI da song, khong phai mot ham le.
  //
  // `chotBaiThuThach` tinh "hoan thanh" bang:
  //     tongNgay = so ngay cua thu thach TRU nhung ngay trong st-ngay-chi-diem-danh
  //     done >= tongNgay  ->  completed = 1, tra reward_xp / reward_coin
  //
  // Ma khoa `st-ngay-chi-diem-danh` KHONG BAO GIO DOC DUOC tren ban that:
  // settings.js tra theo cot `key`, con moi dong nap trong 0004_seed.sql lai de
  // chuoi 'st-...' o cot `id`. Danh sach mien nop rong -> buoi Kick-Off (ngay 0,
  // khong ai nop duoc gi) van nam trong mau so -> khong ai hoan thanh noi.
  // Dung sai so ma chu thich trong chinh ham do mo ta: "262 nguoi tham gia,
  // 0 nguoi hoan thanh".
  //
  // BAI NAY CO Y KHONG TU INSERT CAI DAT. No doc dung gia tri migration 0018
  // nap san - vi bai test cu tu INSERT roi moi kiem chinh la ly do bo test xanh
  // suot trong khi ban that hong.
  console.log('\nN. Hoan thanh thu thach -> tra thuong (doc cai dat that)');

  const caiDat = sql("SELECT value FROM app_settings WHERE key = 'st-ngay-chi-diem-danh'");
  check('cai dat "ngay chi diem danh" CO TON TAI voi dung ten khoa',
    caiDat.length === 1, caiDat);
  check('va mac dinh la [0] - buoi Kick-Off',
    String(caiDat[0]?.value || '').replace(/\s/g, '') === '[0]', caiDat[0]);

  const idTTHT = `tt-ht-${Date.now()}`;
  const homNayVN = new Date(Date.now() + 420 * 60000).toISOString().slice(0, 10);
  sql(`INSERT INTO challenges (id,name,description,start_date,duration_days,is_active,reward_xp,reward_coin,created_date,updated_date) VALUES ('${idTTHT}','Thu thach tra thuong','','${homNayVN}',2,1,500,300,datetime('now'),datetime('now'))`);
  // Ngay 0 = Kick-Off (nam trong danh sach mien nop), ngay 1 = hom nay.
  sql(`INSERT INTO challenge_day_tasks (id,challenge_id,day,title,guide,xp,coin,created_date,updated_date) VALUES ('nvht-0-${Date.now()}','${idTTHT}',0,'Kick-Off','',0,0,datetime('now'),datetime('now'))`);
  sql(`INSERT INTO challenge_day_tasks (id,challenge_id,day,title,guide,xp,coin,created_date,updated_date) VALUES ('nvht-1-${Date.now()}','${idTTHT}',1,'Ngay 1','',10,5,datetime('now'),datetime('now'))`);

  const thamGiaHT = await alice.call('POST', '/api/functions/joinChallenge', { challenge_id: idTTHT });
  check('tham gia duoc thu thach tra thuong', thamGiaHT.status === 200, thamGiaHT.data);

  const xpTruocHT = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  const nopHT = await alice.call('POST', '/api/functions/submitChallengeDay', {
    challenge_id: idTTHT,
    day: 1,
    content: 'Bai ngay 1',
    link: 'https://vi-du.test/bai-tap',
    file_url: 'https://facebook.com/vi-du/cam-nhan',
  });
  check('nop du bai ngay 1 -> tu duyet', nopHT.status === 200 && nopHT.data?.tu_duyet === true, nopHT.data);

  // KHONG nop ngay 0: khong ai nop duoc buoi Kick-Off. Do chinh la diem cua bai.
  const tvHT = sql(`SELECT completed, progress FROM challenge_members WHERE challenge_id='${idTTHT}' AND user_id='${alice.id}'`);
  check('lam het nhung ngay CO THE nop -> duoc tinh la HOAN THANH',
    Number(tvHT[0]?.completed) === 1,
    { completed: tvHT[0]?.completed, progress: tvHT[0]?.progress,
      giai_thich: 'neu = 0 nghia la ngay Kick-Off van bi tinh vao mau so' });

  const xpSauHT = (await alice.call('GET', '/api/auth/me')).data.total_xp;
  check('phan thuong hoan thanh DUOC TRA that (+500 XP)',
    xpSauHT - xpTruocHT === 500, { truoc: xpTruocHT, sau: xpSauHT });

  const tinHT = sql(`SELECT COUNT(*) AS n FROM notifications WHERE user_id='${alice.id}' AND type='challenge'`);
  check('hoc vien duoc bao tin hoan thanh', Number(tinHT[0]?.n) >= 1, tinHT[0]);

  sql(`DELETE FROM point_awards WHERE source_id = 'hoanthanh-${idTTHT}'`);
  sql(`DELETE FROM challenge_submissions WHERE challenge_id = '${idTTHT}'`);
  sql(`DELETE FROM challenge_members WHERE challenge_id = '${idTTHT}'`);
  sql(`DELETE FROM challenge_day_tasks WHERE challenge_id = '${idTTHT}'`);
  sql(`DELETE FROM challenges WHERE id = '${idTTHT}'`);

  // ------------------ mua goi TRUOC, chi Thanh them khoa vao goi SAU
  // Day la tinh huong that cua 44 nguoi da mua ve VIP khi `grants_json` con
  // rong. `fulfilOrder` cap quyen theo grants_json TAI THOI DIEM tra tien, nen
  // ho chi co `package`. Neu cong chi nhin quyen `course` thi hom nao chi Thanh
  // them khoa vao goi, ho se thay khoa do trong tab VIP ma VIDEO KHONG PHAT
  // DUOC - khong mot dong loi nao hien ra.
  console.log('\nN. Them khoa vao goi SAU khi ban: nguoi da mua phai xem duoc ngay');

  const skuSau = `SAU${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const idKhoaSau = `kh-${skuSau}`;
  sql(`INSERT INTO products (id,sku,name,kind,price,currency,grants_json,is_active,created_date,updated_date) VALUES ('sp-${skuSau}','${skuSau}','Goi ban truoc','package',399000,'VND','[]',1,datetime('now'),datetime('now'))`);
  sql(`INSERT INTO courses (id,name,description,is_active,requires_unlock,min_level,sort_order,created_date,updated_date) VALUES ('${idKhoaSau}','Khoa them sau','',1,1,0,99,datetime('now'),datetime('now'))`);
  sql(`INSERT INTO lessons (id,course_id,title,video_provider,video_id,xp,coin,sort_order,created_date,updated_date) VALUES ('bai-${skuSau}','${idKhoaSau}','Bai VIP','youtube','MAVIDEOSAU',10,5,1,datetime('now'),datetime('now'))`);

  // Mua goi luc no CHUA mo khoa nao -> chi co quyen `package`, khong co `course`.
  sql(`INSERT INTO entitlements (id,user_id,kind,ref,source,granted_at,created_date,updated_date) VALUES ('ent-${skuSau}','${alice.id}','package','${skuSau}','test',datetime('now'),datetime('now'),datetime('now'))`);

  const truocKhiThem = await alice.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: idKhoaSau }))}`);
  check('khoa chua nam trong goi -> van bi che ma video',
    !(truocKhiThem.data || [])[0]?.video_id, (truocKhiThem.data || [])[0]?.video_id);

  // Chi Thanh them khoa vao goi HOM NAY, sau khi ho da tra tien tu lau.
  sql(`UPDATE products SET grants_json = '[{"kind":"course","ref":"${idKhoaSau}"}]' WHERE sku = '${skuSau}'`);

  const sauKhiThem = await alice.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: idKhoaSau }))}`);
  check('THEM KHOA VAO GOI -> nguoi da mua xem duoc ma video NGAY',
    (sauKhiThem.data || [])[0]?.video_id === 'MAVIDEOSAU', (sauKhiThem.data || [])[0]?.video_id);

  // Nguoi khong mua goi thi van bi che - cong khong duoc mo toang ra.
  const nguoiLa = await bob.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: idKhoaSau }))}`);
  check('nguoi KHONG mua goi van bi che ma video',
    !(nguoiLa.data || [])[0]?.video_id, (nguoiLa.data || [])[0]?.video_id);

  // Bo khoa khoi goi -> mat quyen ngay, khong con dinh lai.
  sql(`UPDATE products SET grants_json = '[]' WHERE sku = '${skuSau}'`);
  const sauKhiBo = await alice.call('GET',
    `/api/entities/Lesson?filter=${encodeURIComponent(JSON.stringify({ course_id: idKhoaSau }))}`);
  check('BO KHOA KHOI GOI -> mat quyen ngay',
    !(sauKhiBo.data || [])[0]?.video_id, (sauKhiBo.data || [])[0]?.video_id);

  // Xem duoc video ma khong danh dau hoc xong duoc thi cung nhu khong: bai
  // duoi giu cho `completeLesson` dung CUNG mot luat voi cong che video.
  sql(`UPDATE products SET grants_json = '[{"kind":"course","ref":"${idKhoaSau}"}]' WHERE sku = '${skuSau}'`);
  const hocXong = await alice.call('POST', '/api/functions/completeLesson', { lesson_id: `bai-${skuSau}` });
  check('mo qua goi -> danh dau HOC XONG duoc, khong bi tu choi',
    hocXong.status === 200 && hocXong.data?.ok, hocXong.data);

  const nguoiLaHoc = await bob.call('POST', '/api/functions/completeLesson', { lesson_id: `bai-${skuSau}` });
  check('nguoi KHONG mua goi van khong danh dau hoc xong duoc',
    nguoiLaHoc.status === 403, nguoiLaHoc.status);

  // --------------- link ban ghi + tai lieu cua KHOA cung phai bi che
  // Bang `courses` doc CONG KHAI (danh sach khoa phai hien ten va anh cho moi
  // nguoi). Neu hai cot nay khong che thi mot lenh GET /api/entities/Course la
  // lay duoc ban ghi buoi hoc cua khoa VIP ma khong tra dong nao - y het lo
  // hong cua `products.delivery_url`.
  const BAN_GHI = 'https://vi-du.zoom.us/rec/share/ban-ghi-bi-mat';
  sql(`UPDATE courses SET recording_url = '${BAN_GHI}', doc_url = 'https://vi-du.notion.site/tai-lieu' WHERE id = '${idKhoaSau}'`);

  const laXemKhoa = await bob.call('GET',
    `/api/entities/Course?filter=${encodeURIComponent(JSON.stringify({ id: idKhoaSau }))}`);
  const khoaNguoiLa = (laXemKhoa.data || [])[0];
  check('nguoi CHUA mo khoa van thay TEN khoa (de con biet ma mua)',
    khoaNguoiLa?.name === 'Khoa them sau', khoaNguoiLa?.name);
  check('nguoi CHUA mo khoa KHONG lay duoc link ban ghi',
    !khoaNguoiLa?.recording_url, khoaNguoiLa?.recording_url);
  check('nguoi CHUA mo khoa KHONG lay duoc link tai lieu',
    !khoaNguoiLa?.doc_url, khoaNguoiLa?.doc_url);

  const daMoXemKhoa = await alice.call('GET',
    `/api/entities/Course?filter=${encodeURIComponent(JSON.stringify({ id: idKhoaSau }))}`);
  const khoaNguoiMua = (daMoXemKhoa.data || [])[0];
  check('nguoi DA mo khoa thay link ban ghi',
    khoaNguoiMua?.recording_url === BAN_GHI, khoaNguoiMua?.recording_url);
  check('nguoi DA mo khoa thay link tai lieu',
    khoaNguoiMua?.doc_url === 'https://vi-du.notion.site/tai-lieu', khoaNguoiMua?.doc_url);

  sql(`DELETE FROM lesson_progress WHERE lesson_id = 'bai-${skuSau}'`);
  sql(`DELETE FROM point_awards WHERE source_id = 'bai-${skuSau}'`);
  sql(`DELETE FROM entitlements WHERE id = 'ent-${skuSau}'`);
  sql(`DELETE FROM lessons WHERE course_id = '${idKhoaSau}'`);
  sql(`DELETE FROM courses WHERE id = '${idKhoaSau}'`);
  sql(`DELETE FROM products WHERE sku = '${skuSau}'`);

  // ------------------------------------- link tai lieu cua san pham phai kin
  // Bang `products` doc CONG KHAI - gian hang phai hien ten, gia, anh cho moi
  // nguoi. Nhung `delivery_url` la thu nguoi ta TRA TIEN de co. Khong che thi
  // mot lenh GET /api/entities/Product la lay duoc link Notion cua ca gian
  // hang ma khong tra dong nao, va khong co dau vet gi de ai do phat hien ra.
  console.log('\nN. Link tai lieu cua san pham chi nguoi da mua moi thay');

  const skuG = `GATE${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const LINK_KIN = 'https://vi-du.notion.site/tai-lieu-bi-mat';
  sql(`INSERT INTO products (id,sku,name,kind,price,currency,grants_json,is_active,delivery_url,delivery_note,zalo_group_url,created_date,updated_date) VALUES ('sp-${skuG}','${skuG}','San pham co cong','package',199000,'VND','[]',1,'${LINK_KIN}','Mat khau la 1234','https://zalo.me/g/nhomrieng',datetime('now'),datetime('now'))`);

  const chuaMuaXem = await bob.call('GET',
    `/api/entities/Product?filter=${encodeURIComponent(JSON.stringify({ sku: skuG }))}`);
  const spChuaMua = (chuaMuaXem.data || [])[0];
  check('nguoi CHUA mua van thay ten va gia (de con mua)',
    spChuaMua?.name === 'San pham co cong' && spChuaMua?.price === 199000, spChuaMua);
  check('nguoi CHUA mua KHONG lay duoc link tai lieu', !spChuaMua?.delivery_url, spChuaMua?.delivery_url);
  check('nguoi CHUA mua KHONG lay duoc loi nhan sau khi mua',
    !spChuaMua?.delivery_note, spChuaMua?.delivery_note);
  check('nhom Zalo VAN thay duoc truoc khi tra tien (de gui bill)',
    spChuaMua?.zalo_group_url === 'https://zalo.me/g/nhomrieng', spChuaMua?.zalo_group_url);

  sql(`INSERT INTO entitlements (id,user_id,kind,ref,source,granted_at,created_date,updated_date) VALUES ('ent-${skuG}','${alice.id}','package','${skuG}','test',datetime('now'),datetime('now'),datetime('now'))`);
  const daMuaXem = await alice.call('GET',
    `/api/entities/Product?filter=${encodeURIComponent(JSON.stringify({ sku: skuG }))}`);
  const spDaMua = (daMuaXem.data || [])[0];
  check('nguoi DA mua thay link tai lieu', spDaMua?.delivery_url === LINK_KIN, spDaMua?.delivery_url);
  check('nguoi DA mua thay loi nhan', spDaMua?.delivery_note === 'Mat khau la 1234', spDaMua?.delivery_note);

  sql(`DELETE FROM entitlements WHERE id = 'ent-${skuG}'`);
  sql(`DELETE FROM products WHERE sku = '${skuG}'`);

  console.log('\nN. Cong khoa noi dung (mac dinh TAT)');

  // Chi Thanh chot bo cong: ai vao duoc bang duong nao cung hoc duoc. Bai nay
  // giu cho chinh quyet dinh do - neu mai nay ai do bat lai cong ma khong co y,
  // bai nay do va noi ro dieu gi vua doi.
  const khach = await makeUser('khachla', 'member', { lead: false });
  const meKhach = await khach.call('GET', '/api/auth/me');
  check('nguoi chua dien form van duoc coi la da mo',
    meKhach.data?.da_dang_ky === true, meKhach.data?.da_dang_ky);

  const vaoTT = await khach.call('POST', '/api/functions/joinChallenge', { challenge_id: idTT });
  check('nguoi chua dien form van vao duoc thu thach',
    vaoTT.data?.error?.code !== 'chua_dang_ky', vaoTT.data);

  const doiQua = await khach.call('POST', '/api/functions/redeemReward', { reward_id: 'bat-ky' });
  check('nguoi chua dien form khong bi cong chan khi doi qua',
    doiQua.data?.error?.code !== 'chua_dang_ky', doiQua.data);

  sql(`DELETE FROM challenge_members WHERE user_id = '${khach.id}'`);

  console.log('\nN. Gian hang: hoa hong va luat khong ghi de nguoi gioi thieu');

  // Cai kho nhat cua gian hang: he hoa hong noi voi nhau qua `leads`, con nguoi
  // mua trong app la `users`. Ba bai duoi giu cho ba chot quan trong nhat.
  const soGT = `+849${String(Date.now()).slice(-8)}`;
  sql(`INSERT INTO affiliates (code,token,full_name,email,phone,status,commission_rate,unlocked_level,created_at,updated_at) VALUES ('NGUOIGT1','tok-gt-${Date.now()}','Nguoi Gioi Thieu','gt${Date.now()}@smoketest.local','${soGT}','active',0.2,1,datetime('now'),datetime('now'))`);

  // bob duoc makeUser tao kem lead, va lead do CHUA co nguoi gioi thieu.
  const cb1 = await bob.call('POST', '/api/functions/chuanBiDatHang', { ref_code: 'NGUOIGT1' });
  check('chuan bi dat hang tra ve lead_id', !!cb1.data?.lead_id, cb1.data);
  check('ma gioi thieu duoc ghi nhan', cb1.data?.gioi_thieu?.ok === true, cb1.data?.gioi_thieu);

  // Lan hai voi mot ma KHAC: phai bi tu choi, khong duoc ghi de.
  sql(`INSERT INTO affiliates (code,token,full_name,email,phone,status,commission_rate,unlocked_level,created_at,updated_at) VALUES ('NGUOIGT2','tok-gt2-${Date.now()}','Nguoi Thu Hai','gt2${Date.now()}@smoketest.local','+8490${String(Date.now()).slice(-7)}','active',0.2,1,datetime('now'),datetime('now'))`);
  const cb2 = await bob.call('POST', '/api/functions/chuanBiDatHang', { ref_code: 'NGUOIGT2' });
  check('ma thu hai KHONG ghi de nguoi gioi thieu dau tien',
    cb2.data?.gioi_thieu?.ok === false, cb2.data?.gioi_thieu);

  const aiGT = sql(`SELECT a.code FROM leads l JOIN affiliates a ON a.id = l.referred_by WHERE l.id = ${cb1.data?.lead_id}`);
  check('nguoi gioi thieu van la nguoi dau tien', aiGT[0]?.code === 'NGUOIGT1', aiGT);

  // ------------------------------------------- email nguoi mua o buoc dat hang
  // `orders.customer_email` KHONG chi de gui thu: `findBuyer` dung no dau tien
  // de biet mo quyen cho tai khoan nao. Nen mot email go nham co the mo san
  // pham cho NGUOI KHAC, con nguoi tra tien khong nhan duoc gi. Ba bai duoi giu
  // cho o email khong tro thanh cai loi do.
  const emailSai = await alice.call('POST', '/api/functions/chuanBiDatHang', { email: 'khong-phai-email' });
  check('email sai dinh dang -> tu choi', emailSai.status === 422, emailSai.data);

  const emailNguoiKhac = await alice.call('POST', '/api/functions/chuanBiDatHang', { email: bob.email });
  check('email cua TAI KHOAN KHAC -> tu choi, khong mo quyen nham nguoi',
    emailNguoiKhac.status === 409
    && emailNguoiKhac.data?.error?.code === 'email_cua_nguoi_khac', emailNguoiKhac.data);

  const emailMinh = await alice.call('POST', '/api/functions/chuanBiDatHang', { email: alice.email });
  check('email cua chinh minh -> nhan binh thuong', emailMinh.status === 200, emailMinh.data);

  // Ma khong ton tai -> noi ro, khong lam hong viec dat hang.
  const cbSai = await alice.call('POST', '/api/functions/chuanBiDatHang', { ref_code: 'KHONGCOMA' });
  check('ma gioi thieu sai -> van tra lead_id, chi bao ma sai',
    !!cbSai.data?.lead_id && cbSai.data?.gioi_thieu?.ok === false, cbSai.data);

  // Ban san pham khong co trong bang products -> tu choi, KHONG roi ve gia ve
  // chinh. Ban nham gia la loi khong ai phat hien den khi doi soat cuoi thang.
  const donLa = await bob.call('POST', '/api/orders', {
    lead_id: cb1.data?.lead_id, product_sku: 'SKU-KHONG-TON-TAI',
  });
  check('sku khong co trong products -> tu choi',
    donLa.status === 404 && donLa.data?.error?.code === 'san_pham_khong_ban', donLa.data);

  // ------------------------------- doi gia thi QR phai doi theo, khong bam gia cu
  // Chi Thanh ha gia mot san pham tu 1.000.000d xuong 999.000d. Nguoi dang co
  // don cho van nhan lai DUNG DON CU - va QR trong don cu da dong bang tu luc
  // tao, nen ho nhin thay gia moi tren the san pham roi quet ma QR ghi gia cu.
  //
  // Don cu PHAI de nguyen: neu ho da chuyen tien theo no thi webhook con phai
  // khop duoc. Gia lech thi la don MOI.
  const skuGia = `GIA${Date.now().toString(36).toUpperCase().slice(-6)}`;
  sql(`INSERT INTO products (id,sku,name,kind,price,currency,grants_json,is_active,created_date,updated_date) VALUES ('sp-${skuGia}','${skuGia}','San pham doi gia','course',1000000,'VND','[]',1,datetime('now'),datetime('now'))`);

  // Kem so dien thoai, y het form Cua hang: tai khoan chua noi voi mot `lead`
  // thi `chuanBiDatHang` doi so de tao lead - do la cai chot cho 55 hoc vien
  // vao thang bang Google ma chua tung dien form.
  const cbGia = await khach.call('POST', '/api/functions/chuanBiDatHang', {
    phone: `09${String(Date.now()).slice(-8)}`,
  });
  check('chuan bi dat hang cho nguoi mua', !!cbGia.data?.lead_id, cbGia.data);
  const leadGia = cbGia.data?.lead_id;
  const donCu = await khach.call('POST', '/api/orders', { lead_id: leadGia, product_sku: skuGia });
  check('don dau tien lay gia luc do', donCu.data?.order?.amount === 1000000, donCu.data?.order?.amount);

  const lai = await khach.call('POST', '/api/orders', { lead_id: leadGia, product_sku: skuGia });
  check('gia chua doi -> dung lai dung don cu, khong tao trung',
    lai.data?.order?.code === donCu.data?.order?.code,
    { cu: donCu.data?.order?.code, lai: lai.data?.order?.code });

  sql(`UPDATE products SET price = 999000 WHERE sku = '${skuGia}'`);
  const donMoi = await khach.call('POST', '/api/orders', { lead_id: leadGia, product_sku: skuGia });
  check('ha gia -> don MOI, khong dung lai don cu',
    donMoi.data?.order?.code !== donCu.data?.order?.code,
    { cu: donCu.data?.order?.code, moi: donMoi.data?.order?.code });
  check('don moi mang DUNG gia moi', donMoi.data?.order?.amount === 999000, donMoi.data?.order?.amount);
  check('so tien trong QR di theo gia moi',
    Number(donMoi.data?.order?.transfer?.amount) === 999000
    && /999/.test(donMoi.data?.order?.transfer?.amount_text || ''),
    donMoi.data?.order?.transfer);

  const cuVanCon = sql(`SELECT amount FROM orders WHERE code = '${donCu.data?.order?.code}'`);
  check('don cu GIU NGUYEN gia cu (lo ai da chuyen tien theo no)',
    Number(cuVanCon[0]?.amount) === 1000000, cuVanCon[0]);

  sql(`DELETE FROM orders WHERE product_sku = '${skuGia}'`);
  sql(`DELETE FROM products WHERE sku = '${skuGia}'`);

  sql("DELETE FROM affiliates WHERE code IN ('NGUOIGT1','NGUOIGT2')");
  console.log('\nN. Thu bao da nhan thanh toan');

  // Truoc day buoc nay khong gui gi ca: khach chuyen 399k xong hop thu im lang
  // tuyet doi. Bai nay giu cho la thu do - no duoc gui KIEU BAN ROI QUEN
  // (rc.waitUntil) nen rat de bien mat trong mot lan don dep ma khong ai thay.
  const maDon = `${TIEN_TO_DON_TEST}TEST22`;
  const tkNhan = process.env.BANK_ACCOUNT || '';
  // Don TRUOC chu khong chi don sau: mot lan chay truoc chet giua chung de lai
  // dong nay, va `code` la UNIQUE - tu do tro di moi lan chay deu chet ngay o
  // cau INSERT, bao "Command failed" ma khong noi vi sao.
  sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDon}')`);
  sql(`DELETE FROM bank_txns WHERE matched_order = '${maDon}'`);
  sql(`DELETE FROM orders WHERE code = '${maDon}'`);

  // MOT DONG: chayLenhSql day cau lenh qua shell cua Windows, cau nhieu dong bi
  // cat vun -> "Command failed" ma khong noi vi sao. Cac cau khac trong file
  // nay cung mot dong, khong phai ngau nhien.
  sql(`INSERT INTO orders (code,product_sku,product_name,amount,currency,status,transfer_content,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES ('${maDon}','${SKU_TEST}','Test',399000,'VND','pending','${maDon}','Alice Test','${alice.email}','',datetime('now'),datetime('now'))`);

  // Do HIEU SO quanh dung cu goi webhook, khong dem tong.
  //
  // Bai nay tung khang dinh `thu.length === 1`. Con so do chi dung khi duong
  // xac nhan TAY khong gui thu - ma do chinh la lo hong duoc va o commit nay:
  // bai "admin xac nhan duoc don da tra tien" o tren cung dia chi alice gio
  // sinh mot buc thu that, nen tong thanh 2 va bai nay do vi mot ly do khong
  // lien quan gi toi thu no dang kiem.
  const thuTruocHook = sql(`SELECT COUNT(*) AS n FROM emails_sent WHERE to_addr='${alice.email}' AND template='order_paid'`);

  const hook = await fetchLaiMotLan(`${BASE}/api/webhooks/bank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Apikey ${process.env.BANK_WEBHOOK_SECRET || ''}`,
    },
    body: JSON.stringify({
      id: `tx-mail-${Date.now()}`, transferType: 'in', transferAmount: 399000,
      accountNumber: tkNhan, content: `CT DEN:X ${maDon} ALICE TEST`,
      gateway: 'NganHangGiaLap', transactionDate: new Date().toISOString(),
    }),
  });
  const hookData = await hook.json().catch(() => ({}));
  check('webhook nhan tien -> don paid',
    hook.status === 200 && hookData?.results?.[0]?.status === 'paid', hookData);

  // rc.waitUntil chay sau khi phan hoi da tra ve, nen phai cho mot nhip.
  await new Promise((r) => { setTimeout(r, 1500); });
  const thuSauHook = sql(`SELECT COUNT(*) AS n FROM emails_sent WHERE to_addr='${alice.email}' AND template='order_paid'`);
  check('co gui thu bao da nhan thanh toan',
    Number(thuSauHook[0].n) === Number(thuTruocHook[0].n) + 1,
    { truoc: Number(thuTruocHook[0].n), sau: Number(thuSauHook[0].n) });

  sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDon}')`);
  sql(`DELETE FROM bank_txns WHERE matched_order = '${maDon}'`);
  sql(`DELETE FROM events WHERE meta_json LIKE '%${maDon}%'`);
  sql(`DELETE FROM orders WHERE code = '${maDon}'`);

  // --- XAC NHAN TAY CUNG PHAI GUI THU -----------------------------------------
  //
  // Duong webhook (vua kiem o tren) gui thu bien nhan kem link dat mat khau.
  // Duong xac nhan TAY thi khong - no mo quyen, sinh hoa hong, roi dung.
  //
  // Va vi BANK_WEBHOOK_SECRET chua duoc nap tren ban that, webhook tu choi moi
  // cu goi, nen MOI don that deu di qua duong tay: khach chuyen tien, admin bam
  // xac nhan, khach khong nhan duoc gi - khong bien nhan, khong link vao lop.
  // Chu thich trong Revenue.jsx con khang dinh duong nay "chay dung luong y het
  // webhook", nen khong ai di kiem lai.
  const maDonTay = `${TIEN_TO_DON_TEST}TEST23`;
  sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonTay}')`);
  sql(`DELETE FROM orders WHERE code = '${maDonTay}'`);

  // --- TIEN PHAI VAO DUNG TAI KHOAN --------------------------------------------
  //
  // Mot tai khoan SePay thuong noi NHIEU tai khoan ngan hang. Truoc day webhook
  // doc `accountNumber` roi luu vao bank_txns ma khong bao gio so sanh voi
  // BANK_ACCOUNT - tien vao bat ky tai khoan nao cung xac nhan don, tuc la giao
  // khoa hoc va tra hoa hong cho mot khoan tien khong he ve tui chu he thong.
  if (tkNhan) {
    const maDonSaiTk = `${TIEN_TO_DON_TEST}TEST24`;
    sql(`DELETE FROM bank_txns WHERE matched_order = '${maDonSaiTk}'`);
    sql(`DELETE FROM orders WHERE code = '${maDonSaiTk}'`);
    sql(`INSERT INTO orders (code,product_sku,product_name,amount,currency,status,transfer_content,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES ('${maDonSaiTk}','${SKU_TEST}','Test',399000,'VND','pending','${maDonSaiTk}','Alice Test','${alice.email}','',datetime('now'),datetime('now'))`);

    const hookSaiTk = await fetchLaiMotLan(`${BASE}/api/webhooks/bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${process.env.BANK_WEBHOOK_SECRET || ''}`,
      },
      body: JSON.stringify({
        id: `tx-saitk-${Date.now()}`, transferType: 'in', transferAmount: 399000,
        accountNumber: '9999999999', content: `CT DEN:X ${maDonSaiTk} ALICE TEST`,
        gateway: 'NganHangGiaLap', transactionDate: new Date().toISOString(),
      }),
    });
    const dlSaiTk = await hookSaiTk.json().catch(() => ({}));
    check('tien vao SAI tai khoan -> KHONG xac nhan don',
      dlSaiTk?.results?.[0]?.status === 'wrong_account', dlSaiTk);

    const donSaiTk = sql(`SELECT status FROM orders WHERE code='${maDonSaiTk}'`);
    check('don do van nam o trang thai cho, khong bi danh dau da tra',
      donSaiTk[0]?.status === 'pending', donSaiTk[0]);

    // Van phai GHI LAI giao dich do - khong duoc vut di. Admin can nhin thay no
    // de biet co tien that da vao dau do ma khong khop tai khoan.
    const ghiSaiTk = sql(`SELECT status FROM bank_txns WHERE matched_order='${maDonSaiTk}'`);
    check('giao dich sai tai khoan van duoc ghi lai de doi soat',
      ghiSaiTk[0]?.status === 'wrong_account', ghiSaiTk[0]);

    sql(`DELETE FROM bank_txns WHERE matched_order = '${maDonSaiTk}'`);
    sql(`DELETE FROM orders WHERE code = '${maDonSaiTk}'`);
  }

  // --- CHUYEN THUA: don van paid, nhung phai BAO, va hoa hong KHONG an theo ---
  //
  // webhook chi chan chuyen THIEU (duoi 98%), khong chan chuyen THUA. Khach go
  // nham mot so 0 thi dai ly duoc 20% cua con so nham. Trang chinh sach cua
  // chinh he thong liet ke "chuyen khoan trung hoac chuyen thua" la truong hop
  // DUOC HOAN TIEN - tuc la tien thua se tra lai khach, nhung hoa hong da tra
  // tren phan thua thi khong doi ve duoc.
  {
    const maDonThua = `${TIEN_TO_DON_TEST}TEST25`;
    const GIA = 399000;
    const CHUYEN = GIA * 10;                      // go nham mot so 0
    sql(`DELETE FROM commissions WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonThua}')`);
    sql(`DELETE FROM bank_txns WHERE matched_order = '${maDonThua}'`);
    sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonThua}')`);
    sql(`DELETE FROM orders WHERE code = '${maDonThua}'`);
    sql(`INSERT INTO orders (code,lead_id,product_sku,product_name,amount,currency,status,transfer_content,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES ('${maDonThua}',NULL,'${SKU_TEST}','Test',${GIA},'VND','pending','${maDonThua}','Alice Test','${alice.email}','',datetime('now'),datetime('now'))`);

    const hookThua = await fetchLaiMotLan(`${BASE}/api/webhooks/bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${process.env.BANK_WEBHOOK_SECRET || ''}`,
      },
      body: JSON.stringify({
        id: `tx-thua-${Date.now()}`, transferType: 'in', transferAmount: CHUYEN,
        accountNumber: tkNhan, content: `CT DEN:X ${maDonThua} ALICE TEST`,
        gateway: 'NganHangGiaLap', transactionDate: new Date().toISOString(),
      }),
    });
    const dlThua = await hookThua.json().catch(() => ({}));
    check('chuyen thua -> don VAN duoc xac nhan (khach da tra that)',
      dlThua?.results?.[0]?.status === 'paid', dlThua);

    const ghiThua = sql(`SELECT status FROM bank_txns WHERE matched_order='${maDonThua}'`);
    check('chuyen thua duoc danh dau rieng de admin biet ma hoan lai',
      ghiThua[0]?.status === 'overpaid', ghiThua[0]);

    // BAI QUAN TRONG NHAT CUA KHOI NAY: hoa hong KHONG duoc an theo tien thua.
    //
    // Dung mot lead + mot dai ly rieng de con so doan truoc duoc, khong phu
    // thuoc vao nhung gi cac bai truoc da lam.
    const soRieng = `+8490${String(Date.now()).slice(-7)}`;
    sql(`DELETE FROM leads WHERE phone_e164='${soRieng}'`);
    sql(`INSERT INTO leads (full_name,email,phone,phone_e164,created_at,updated_at) VALUES ('Nguoi Duoc Gioi Thieu','nguoi-${Date.now()}@smoketest.local','0901234567','${soRieng}',datetime('now'),datetime('now'))`);
    const leadMoi = sql(`SELECT id FROM leads WHERE phone_e164='${soRieng}'`)[0];

    const soDaiLy = `+8491${String(Date.now()).slice(-7)}`;
    sql(`DELETE FROM leads WHERE phone_e164='${soDaiLy}'`);
    sql(`INSERT INTO leads (full_name,email,phone,phone_e164,created_at,updated_at) VALUES ('Dai Ly Test','dai-ly-${Date.now()}@smoketest.local','0911234567','${soDaiLy}',datetime('now'),datetime('now'))`);
    const leadDaiLy = sql(`SELECT id FROM leads WHERE phone_e164='${soDaiLy}'`)[0];

    const maDaiLy = `TESTTHUA${String(Date.now()).slice(-4)}`;
    sql(`INSERT INTO affiliates (lead_id,code,token,full_name,email,phone,status,commission_rate,created_at,updated_at) VALUES (${leadDaiLy.id},'${maDaiLy}','tk${Date.now()}','Dai Ly Test','dai-ly@smoketest.local','0911234567','active',0.2,datetime('now'),datetime('now'))`);
    const daiLy = sql(`SELECT id FROM affiliates WHERE code='${maDaiLy}'`)[0];
    sql(`UPDATE leads SET referred_by=${daiLy.id}, referral_valid=1 WHERE id=${leadMoi.id}`);

    const maDonHH = `${TIEN_TO_DON_TEST}TEST26`;
    sql(`DELETE FROM commissions WHERE order_code='${maDonHH}'`);
    sql(`DELETE FROM bank_txns WHERE matched_order='${maDonHH}'`);
    sql(`DELETE FROM orders WHERE code='${maDonHH}'`);
    sql(`INSERT INTO orders (code,lead_id,product_sku,product_name,amount,currency,status,transfer_content,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES ('${maDonHH}',${leadMoi.id},'${SKU_TEST}','Test',${GIA},'VND','pending','${maDonHH}','Nguoi Duoc Gioi Thieu','','',datetime('now'),datetime('now'))`);

    const hookHH = await fetchLaiMotLan(`${BASE}/api/webhooks/bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Apikey ${process.env.BANK_WEBHOOK_SECRET || ''}`,
      },
      body: JSON.stringify({
        id: `tx-hh-${Date.now()}`, transferType: 'in', transferAmount: CHUYEN,
        accountNumber: tkNhan, content: `CT DEN:X ${maDonHH} NGUOI DUOC GIOI THIEU`,
        gateway: 'NganHangGiaLap', transactionDate: new Date().toISOString(),
      }),
    });
    const dlHH = await hookHH.json().catch(() => ({}));
    check('don cua nguoi duoc gioi thieu -> paid du chuyen thua',
      dlHH?.results?.[0]?.status === 'paid', dlHH);

    const hh = sql(`SELECT amount, order_amount FROM commissions WHERE order_code='${maDonHH}'`);
    check('hoa hong tinh tren GIA NIEM YET, khong tren so tien chuyen thua',
      Number(hh[0]?.amount) === Math.round(GIA * 0.2),
      { hoa_hong: Number(hh[0]?.amount), dung_phai_la: Math.round(GIA * 0.2),
        neu_an_theo_tien_thua: Math.round(CHUYEN * 0.2) });

    sql(`DELETE FROM commissions WHERE order_code='${maDonHH}'`);
    sql(`DELETE FROM bank_txns WHERE matched_order='${maDonHH}'`);
    sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonHH}')`);
    sql(`DELETE FROM events WHERE meta_json LIKE '%${maDonHH}%'`);
    sql(`DELETE FROM orders WHERE code='${maDonHH}'`);
    sql(`DELETE FROM affiliates WHERE code='${maDaiLy}'`);
    sql(`DELETE FROM leads WHERE id IN (${leadMoi.id}, ${leadDaiLy.id})`);

    sql(`DELETE FROM commissions WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonThua}')`);
    sql(`DELETE FROM bank_txns WHERE matched_order = '${maDonThua}'`);
    sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonThua}')`);
    sql(`DELETE FROM events WHERE meta_json LIKE '%${maDonThua}%'`);
    sql(`DELETE FROM orders WHERE code = '${maDonThua}'`);
  }
  sql(`INSERT INTO orders (code,product_sku,product_name,amount,currency,status,transfer_content,customer_name,customer_email,customer_phone,created_at,updated_at) VALUES ('${maDonTay}','${SKU_TEST}','Test',399000,'VND','pending','${maDonTay}','Alice Test','${alice.email}','',datetime('now'),datetime('now'))`);

  const thuTruoc = sql(`SELECT COUNT(*) AS n FROM emails_sent WHERE to_addr='${alice.email}' AND template='order_paid'`);
  const xacNhanTay = await admin.call('POST', `/api/admin/orders/${maDonTay}/paid`, {});
  check('admin xac nhan tay -> don chuyen paid',
    xacNhanTay.status === 200 && xacNhanTay.data?.changed === true
      && xacNhanTay.data?.order?.status === 'paid', xacNhanTay.data);

  const thuSau = sql(`SELECT COUNT(*) AS n FROM emails_sent WHERE to_addr='${alice.email}' AND template='order_paid'`);
  check('xac nhan tay CUNG gui thu bien nhan cho khach',
    Number(thuSau[0].n) === Number(thuTruoc[0].n) + 1,
    { truoc: Number(thuTruoc[0].n), sau: Number(thuSau[0].n) });

  // Va phai noi THAT ve viec gui duoc hay khong. O may chay test khong co
  // RESEND_API_KEY nen thu KHONG di duoc - may chu phai noi dung the, khong
  // duoc bao thanh cong.
  //
  // Ban cu cua guiThuDaThanhToan vut ket qua sendMail di va luon tra { ok:true },
  // nen bai duoi day se DO neu ai do lam lai dieu do: giao dien se bao voi chi
  // Thanh rang khach da nhan duoc link vao lop trong khi khong buc thu nao roi
  // khoi may chu.
  check('may chu noi THAT ve viec thu co gui duoc khong',
    xacNhanTay.data?.thu_da_gui === false
      && xacNhanTay.data?.thu_ly_do === 'chua_cau_hinh_email', xacNhanTay.data);

  sql(`DELETE FROM entitlements WHERE order_id IN (SELECT id FROM orders WHERE code='${maDonTay}')`);
  sql(`DELETE FROM orders WHERE code = '${maDonTay}'`);

  // ============================================================================
  // N. DUONG KHAI THAC DA DONG
  //
  // Nhung bai duoi day KHONG kiem mot tinh nang nao ca - chung kiem rang mot
  // duong TAN CONG cu the khong con di duoc. Bo test cu da xanh trong khi ca
  // tam lo hong nay dang mo, vi no chi di duong hop le. Moi bai o day ung voi
  // mot lo hong that, mo ta o commit "Va tam lo hong tim duoc khi ra soat".
  // ============================================================================
  console.log('\nN. Duong khai thac da dong');

  // --- 1. Chiem tai khoan bang so dien thoai ---------------------------------
  // /api/tra-cuu + /vao-lop co y la hai yeu to. Neu /tra-cuu phat ma don cua
  // don DA TRA TIEN thi hai yeu to sap thanh mot: biet so dien thoai la vao
  // duoc tai khoan.
  {
    const sdtMua = `+849${String(Date.now()).slice(-8)}`;
    const maDonThu = `GCKT${String(Date.now()).slice(-4)}`;
    sql(`INSERT INTO leads (email,full_name,phone,phone_e164,status,created_at,updated_at)
         VALUES ('khaithac@smoketest.local','Khai Thac','${sdtMua}','${sdtMua}','new',datetime('now'),datetime('now'))`);
    const leadId = sql(`SELECT id FROM leads WHERE phone_e164='${sdtMua}'`)[0].id;
    sql(`INSERT INTO orders (code,lead_id,product_sku,product_name,amount,transfer_content,status,created_at,updated_at,paid_at)
         VALUES ('${maDonThu}',${leadId},'GC21','Kiem thu',2000000,'${maDonThu}','paid',datetime('now'),datetime('now'),datetime('now'))`);

    const traCuu = await fetchLaiMotLan(`${BASE}/api/tra-cuu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: sdtMua }),
    });
    const kq = await traCuu.json().catch(() => ({}));
    const donTraVe = (kq.orders || []);
    check('tra cuu theo so dien thoai KHONG phat ma don da thanh toan',
      donTraVe.length > 0 && donTraVe.every((o) => !o.code), donTraVe);
    check('van cho biet don da thanh toan (de nguoi that con dung duoc)',
      donTraVe.some((o) => o.status === 'paid'), donTraVe);

    sql(`DELETE FROM orders WHERE code='${maDonThu}'`);
    sql(`DELETE FROM leads WHERE id=${leadId}`);
  }

  // --- 2. Farm XP/xu bang cach xoa dong dang ky ------------------------------
  // Khoa chong trung phai la NGUOI + BUOI, khong phai id dong dang ky (xoa
  // duoc). Va chu so huu khong duoc xoa dong dang ky nua.
  {
    const evFarm = `ev-farm-${Date.now()}`;
    // Dung dung mau cua muc 15: `checkin_open_min`/`checkin_close_min` la hai cot
    // quyet dinh cua so diem danh con mo hay khong.
    const batDauFarm = new Date(Date.now() - 2 * 60000).toISOString();
    sql(`INSERT INTO calendar_events (id,title,kind,starts_at,checkin_open_min,checkin_close_min,status,is_active,created_date,updated_date)
         VALUES ('${evFarm}','Buoi kiem thu farm','live','${batDauFarm}',0,15,'scheduled',1,datetime('now'),datetime('now'))`);

    // joinEvent -> diemDanh chinh la hai mat cua vong khai thac; phai di dung
    // duong do thi bai kiem moi co nghia.
    await alice.call('POST', '/api/functions/joinEvent', { event_id: evFarm });
    const lan1 = await alice.call('POST', '/api/functions/diemDanh', { event_id: evFarm });
    check('diem danh lan dau cong duoc diem', lan1.status === 200 && lan1.data?.awarded?.xp > 0, lan1.data);
    const xpSau1 = sql(`SELECT total_xp FROM users WHERE id='${alice.id}'`)[0].total_xp;

    // Dung chinh duong khai thac: xoa dong dang ky roi dang ky lai.
    const signup = sql(`SELECT id FROM event_signups WHERE event_id='${evFarm}' AND user_id='${alice.id}'`)[0];
    check('co dong dang ky de thu xoa', !!signup, signup);
    if (signup) {
      const xoa = await alice.call('DELETE', `/api/entities/EventSignup/${signup.id}`);
      check('hoc vien KHONG xoa duoc dong diem danh cua minh',
        xoa.status === 403 || xoa.status === 401, xoa.status);
      // Va du co xoa duoc bang tay thi diem cung khong duoc cong lan hai.
      sql(`DELETE FROM event_signups WHERE id='${signup.id}'`);
    }
    await alice.call('POST', '/api/functions/joinEvent', { event_id: evFarm });
    await alice.call('POST', '/api/functions/diemDanh', { event_id: evFarm });
    const xpSau2 = sql(`SELECT total_xp FROM users WHERE id='${alice.id}'`)[0].total_xp;
    check('diem danh vong hai KHONG cong them diem',
      xpSau2 === xpSau1, { lan1: xpSau1, lan2: xpSau2, awarded: lan1.data?.awarded });

    sql(`DELETE FROM event_signups WHERE event_id='${evFarm}'`);
    sql(`DELETE FROM calendar_events WHERE id='${evFarm}'`);
  }

  // --- 3. Lo link giao qua ---------------------------------------------------
  {
    const idQua = `qua-che-${Date.now()}`;
    sql(`INSERT INTO rewards (id,name,coin_cost,quantity,is_active,delivery_url,delivery_note,created_date,updated_date)
         VALUES ('${idQua}','Qua so kiem thu',10,5,1,'https://notion.so/bi-mat','Ghi chu bi mat',datetime('now'),datetime('now'))`);

    const dsQua = await alice.call('GET', '/api/entities/Reward');
    const quaThay = (dsQua.data || []).find((r) => r.id === idQua);
    check('nguoi CHUA doi qua van thay ten va gia (de con doi)',
      !!quaThay && quaThay.name === 'Qua so kiem thu', quaThay);
    check('nguoi CHUA doi qua KHONG thay link giao qua',
      !quaThay?.delivery_url && !quaThay?.delivery_note, quaThay);

    sql(`DELETE FROM rewards WHERE id='${idQua}'`);
  }

  // --- 4. Lo noi dung thu thach tra phi --------------------------------------
  {
    const idTT = `tt-che-${Date.now()}`;
    const idNgay = `ngay-che-${Date.now()}`;
    sql(`INSERT INTO challenges (id,name,duration_days,is_active,requires_unlock,created_date,updated_date)
         VALUES ('${idTT}','Thu thach kiem thu che',3,1,1,datetime('now'),datetime('now'))`);
    sql(`INSERT INTO challenge_day_tasks (id,challenge_id,day,title,video_url,assignment_url,doc_url,created_date,updated_date)
         VALUES ('${idNgay}','${idTT}',1,'Ngay 1','https://vimeo.com/bi-mat','https://docs.google.com/bai-tap','https://docs.google.com/tai-lieu',datetime('now'),datetime('now'))`);

    const dsNgay = await alice.call('GET', '/api/entities/ChallengeDayTask');
    const ngayThay = (dsNgay.data || []).find((t) => t.id === idNgay);
    check('nguoi CHUA tham gia van thay ten nhiem vu (de con biet ma vao)',
      !!ngayThay && ngayThay.title === 'Ngay 1', ngayThay);
    check('nguoi CHUA tham gia KHONG thay video va bai tap',
      !ngayThay?.video_url && !ngayThay?.assignment_url && !ngayThay?.doc_url, ngayThay);

    sql(`DELETE FROM challenge_day_tasks WHERE id='${idNgay}'`);
    sql(`DELETE FROM challenges WHERE id='${idTT}'`);
  }

  // --- 5. Vuot cong bang API entity -----------------------------------------
  {
    const tuTao = await alice.call('POST', '/api/entities/ChallengeMember', {
      challenge_id: 'bia-dat', progress: 999, completed: true,
    });
    check('KHONG tu tao duoc ChallengeMember (phai qua joinChallenge)',
      tuTao.status === 403, { status: tuTao.status, data: tuTao.data });
  }

  // --- 6. Chiem cong dai ly bang so dien thoai ho so -------------------------
  // `users.phone` ai cung tu dat duoc qua PATCH /me va khong he duoc xac minh.
  {
    const sdtDaiLy = `0988${String(Date.now()).slice(-6)}`;
    sql(`INSERT INTO affiliates (code,token,full_name,email,phone,status,created_at,updated_at)
         VALUES ('KTHU1','token-kiem-thu-rat-dai','Dai Ly That','daily@smoketest.local','${sdtDaiLy}','active',datetime('now'),datetime('now'))`);

    await alice.call('PATCH', '/api/auth/me', { phone: sdtDaiLy });
    const cong = await alice.call('GET', '/api/affiliate/me');
    const loBiMat = JSON.stringify(cong.data || {}).includes('token-kiem-thu-rat-dai');
    check('dat so dien thoai cua dai ly KHONG chiem duoc cong cua ho',
      !loBiMat, { status: cong.status });

    await alice.call('PATCH', '/api/auth/me', { phone: '' });
    sql("DELETE FROM affiliates WHERE code='KTHU1'");
  }

  // ------------------------------------------------------------------ don dep
  sql("DELETE FROM kit_sync_log WHERE email LIKE '%@smoketest.local'");
  sql("DELETE FROM leads WHERE email LIKE '%@smoketest.local'");
  const testUsers = "SELECT id FROM users WHERE email LIKE '%@smoketest.local'";
  for (const table of ['point_awards', 'xp_transactions', 'coin_transactions', 'notifications',
    'post_likes', 'post_comments', 'posts', 'redemptions', 'auth_sessions', 'credentials',
    // Dien form o trang ban hang gio tao san tai khoan + mot link dat mat khau;
    // khong don o day thi khoa ngoai chan lenh xoa users ben duoi.
    'password_resets', 'oauth_accounts',
    'activities']) {
    sql(`DELETE FROM ${table} WHERE user_id IN (${testUsers})`);
  }
  // Bang nhat ky admin dung cot admin_id/target_user_id chu khong phai user_id.
  sql(`DELETE FROM admin_logs WHERE admin_id IN (${testUsers}) OR target_user_id IN (${testUsers})`);
  sql("DELETE FROM rewards WHERE name='Quà thử nghiệm'");
  sql("DELETE FROM otp_codes WHERE email LIKE '%@smoketest.local'");
  sql("DELETE FROM emails_sent WHERE to_addr LIKE '%@smoketest.local'");
  // Xoa BANG CON truoc. Bon bang nay co khoa ngoai tro toi users; neu mot lan
  // chay truoc do chet giua chung (mat mang, bam Ctrl+C, hai bo test dam nhau)
  // thi chung con lai ban ghi mo coi, va tu do TRO DI moi lan chay deu chet o
  // dong duoi voi "FOREIGN KEY constraint failed" - nghe nhu loi cua lan chay
  // hien tai, that ra la rac cua lan truoc.
  const cuaTest = "SELECT id FROM users WHERE email LIKE '%@smoketest.local'";
  for (const bang of ['auth_sessions', 'credentials', 'oauth_accounts', 'password_resets']) {
    sql(`DELETE FROM ${bang} WHERE user_id IN (${cuaTest})`);
  }
  sql("DELETE FROM users WHERE email LIKE '%@smoketest.local'");
  sql("DELETE FROM commissions WHERE affiliate_id IN (SELECT id FROM affiliates WHERE email LIKE '%@smoketest.local')");
  sql("DELETE FROM referral_clicks WHERE affiliate_id IN (SELECT id FROM affiliates WHERE email LIKE '%@smoketest.local')");
  sql("DELETE FROM affiliates WHERE email LIKE '%@smoketest.local'");
  sql("DELETE FROM leads WHERE phone_e164 = '+84988000333'");
  sql("DELETE FROM sessions WHERE id = 'phien-ma-la-bu2'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALABU8'");
  sql("DELETE FROM redemptions WHERE reward_id = 'qua-premium-kiemthu'");
  sql("DELETE FROM rewards WHERE id = 'qua-premium-kiemthu'");
  sql("DELETE FROM commissions WHERE order_code = 'VIPBU0001'");
  sql("DELETE FROM orders WHERE code = 'VIPBU0001'");
  sql("DELETE FROM leads WHERE phone_e164 = '+84988000222'");
  sql("DELETE FROM sessions WHERE id = 'phien-ma-la-bu'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALABU7'");
  sql("DELETE FROM ref_ma_la WHERE ma = 'MALATEST9'");
  sql("DELETE FROM ref_ma_la_phien WHERE ma = 'MALATEST9'");
  sql("DELETE FROM orders WHERE lead_id IN (SELECT id FROM leads WHERE phone_e164 = '+84988000111')");
  sql("DELETE FROM leads WHERE phone_e164 = '+84988000111'");
  sql('DELETE FROM rate_limits');
  console.log('\n  (da don du lieu test)');

  console.log(`\nKet qua: ${passed} dat, ${failed} loi`);
  process.exit(failed ? 1 : 0);
})();
