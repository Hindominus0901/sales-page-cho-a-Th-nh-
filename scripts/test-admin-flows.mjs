/**
 * Kiểm chứng API quản trị và portal cộng tác viên.
 *
 *   npm run dev                       (cửa sổ khác)
 *   node scripts/create-admin.mjs --email admin@test.vn
 *   node scripts/test-admin-flows.mjs --email admin@test.vn --password <mật khẩu vừa in>
 */

import { openLocalD1 } from './lib/local-d1.mjs';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const EMAIL = arg('email');
const PASSWORD = arg('password');
if (!EMAIL || !PASSWORD) { console.error('Cần --email và --password'); process.exit(1); }

const db = openLocalD1();

let failures = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`   ${pass ? '✓' : '✗'} ${label.padEnd(50)} ${JSON.stringify(actual)}${pass ? '' : ` (mong đợi ${JSON.stringify(expected)})`}`);
};

/** Giữ cookie giữa các request như trình duyệt. */
function makeClient() {
  const jar = new Map();
  let csrf = null;
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const store = (res) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '') jar.delete(name); else jar.set(name, value);
    }
  };
  return {
    setCsrf: (t) => { csrf = t; },
    async req(method, path, body) {
      const headers = { cookie: cookieHeader(), 'cf-connecting-ip': '10.9.9.9' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (csrf) headers['x-csrf-token'] = csrf;
      const res = await fetch(BASE + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      store(res);
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
      return { status: res.status, body: json };
    },
    get(p) { return this.req('GET', p); },
    post(p, b) { return this.req('POST', p, b ?? {}); },
    patch(p, b) { return this.req('PATCH', p, b ?? {}); },
  };
}

console.log(`\nKiểm chứng trang quản trị và portal CTV — ${BASE}\n`);

// ---------------------------------------------------------------- đăng nhập
console.log('Đăng nhập quản trị');
const admin = makeClient();
ok('sai mật khẩu bị từ chối', (await admin.post('/api/admin/login', { email: EMAIL, password: 'sai' })).status, 401);
ok('chưa đăng nhập thì /me trả 401', (await admin.get('/api/admin/me')).status, 401);
const login = await admin.post('/api/admin/login', { email: EMAIL, password: PASSWORD });
ok('đăng nhập đúng', login.status, 200);

/**
 * Đăng nhập ĐÚNG phải xoá bộ đếm lần sai. Nếu tính cả lần đúng thì người dùng
 * thật đăng nhập vài lần trong ngày sẽ bị khoá oan — lỗi này đã từng xảy ra.
 */
const relogin = makeClient();
for (let i = 0; i < 4; i++) await relogin.post('/api/admin/login', { email: EMAIL, password: PASSWORD });
ok('đăng nhập đúng nhiều lần KHÔNG bị khoá',
  (await relogin.post('/api/admin/login', { email: EMAIL, password: PASSWORD })).status, 200);
const me = await admin.get('/api/admin/me');
ok('phiên có hiệu lực', me.body.ok, true);
if (!me.body.ok) {
  console.error('\nKhông đăng nhập được nên dừng sớm. Nếu là 429 thì bộ đếm khoá còn '
    + 'trong KV từ lần chạy trước — xoá .wrangler/state/v3/kv rồi khởi động lại dev.');
  process.exit(1);
}
ok('quyền là owner', me.body.user.role, 'owner');
ok('có token CSRF', typeof me.body.csrfToken, 'string');
console.log('');

// ---------------------------------------------------------------- CSRF
console.log('Bảo vệ CSRF');
const noCsrf = await admin.post('/api/admin/leads/rescore');
ok('thao tác ghi KHÔNG có token CSRF bị chặn', noCsrf.status, 403);
admin.setCsrf(me.body.csrfToken);
ok('có token CSRF thì cho qua', (await admin.post('/api/admin/leads/rescore')).status, 200);
console.log('');

// ---------------------------------------------------------------- dashboard
console.log('Bảng điều khiển');
const stats = await admin.get('/api/admin/stats');
ok('trả về được', stats.body.ok, true);
ok('có mục việc cần xử lý tay', typeof stats.body.todo.unmatched_payments, 'number');
ok('có tổng số lead', typeof stats.body.totals.leads, 'number');
ok('có số chỗ còn lại', typeof stats.body.totals.seatsLeft, 'number');
console.log('');

// ---------------------------------------------------------------- lead
console.log('Danh sách lead');
const leads = await admin.get('/api/admin/leads');
ok('trả về được', leads.body.ok, true);
const anyLead = leads.body.leads[0];
if (anyLead) {
  const detail = await admin.get('/api/admin/leads/' + anyLead.id);
  ok('chi tiết có breakdown điểm', Array.isArray(detail.body.lead.breakdown), true);
  ok('có nhãn tiếng Việt cho band', typeof detail.body.lead.bandLabel, 'string');
  ok('đổi trạng thái được', (await admin.patch('/api/admin/leads/' + anyLead.id, { status: 'contacted' })).status, 200);
  ok('trạng thái sai bị từ chối',
    (await admin.patch('/api/admin/leads/' + anyLead.id, { status: 'khong-ton-tai' })).status, 400);
  ok('thêm ghi chú được',
    (await admin.post('/api/admin/leads/' + anyLead.id + '/notes', { body: 'Đã gọi, hẹn gọi lại chiều mai.' })).status, 200);
  ok('ghi chú trống bị từ chối',
    (await admin.post('/api/admin/leads/' + anyLead.id + '/notes', { body: '  ' })).status, 400);
}
const csv = await fetch(BASE + '/api/admin/leads/export.csv', { headers: { cookie: '' } });
ok('xuất CSV không đăng nhập bị chặn', csv.status, 401);
console.log('');

// ---------------------------------------------------------------- CTV
console.log('Quản lý cộng tác viên');
const code = 'TEST' + Math.floor(Math.random() * 9000 + 1000);
const created = await admin.post('/api/admin/affiliates', {
  code, name: 'CTV Kiểm Thử', email: `ctv${Date.now()}@vidu.com`, commissionRate: 2000,
});
ok('tạo CTV được', created.body.ok, true);
ok('trả mật khẩu tạm một lần', typeof created.body.tempPassword, 'string');
const dup = await admin.post('/api/admin/affiliates', {
  code, name: 'Trùng mã', email: `khac${Date.now()}@vidu.com`,
});
ok('mã trùng bị từ chối', dup.status, 409);
ok('email sai bị từ chối',
  (await admin.post('/api/admin/affiliates', { code: 'ABCXYZ', name: 'X', email: 'khong-phai-email' })).status, 400);
console.log('');

// ---------------------------------------------------------------- portal CTV
console.log('Portal cộng tác viên');
const aff = makeClient();
ok('chưa đăng nhập thì /me trả 401', (await aff.get('/api/aff/me')).status, 401);
const affLogin = await aff.post('/api/aff/login', {
  email: created.body.affiliate.email, password: created.body.tempPassword,
});
ok('CTV đăng nhập được', affLogin.status, 200);
const affMe = await aff.get('/api/aff/me');
aff.setCsrf(affMe.body.csrfToken);
ok('thấy đúng mã giới thiệu của mình', affMe.body.affiliate.code, code);
ok('thấy tỉ lệ hoa hồng 20%', affMe.body.affiliate.ratePercent, 20);

const links = await aff.get('/api/aff/links');
ok('có 4 link giới thiệu', links.body.links.length, 4);
ok('link mang đúng mã ref', links.body.links[0].url.includes('ref=' + code), true);

const affStats = await aff.get('/api/aff/stats');
ok('xem được thống kê của mình', affStats.body.ok, true);

// Ranh giới quyền: phiên CTV không được dùng ở route quản trị.
ok('phiên CTV KHÔNG vào được API quản trị', (await aff.get('/api/admin/stats')).status, 401);
ok('phiên quản trị KHÔNG vào được portal CTV', (await admin.get('/api/aff/me')).status, 401);
console.log('');

// ---------------------------------------------------------------- rút tiền
console.log('Yêu cầu rút hoa hồng');
const noBank = await aff.post('/api/aff/payouts');
ok('chưa có tài khoản ngân hàng thì chặn', noBank.status, 400);
ok('câu lỗi nói rõ phải làm gì', noBank.body.error.includes('ngân hàng'), true);

ok('cập nhật tài khoản ngân hàng được', (await aff.patch('/api/aff/bank', {
  bankName: 'Techcombank', accountNo: '19001234567', accountName: 'NGUYEN VAN TEST',
})).status, 200);

const noCommission = await aff.post('/api/aff/payouts');
ok('chưa có hoa hồng nào thì chặn', noCommission.status, 400);

/**
 * Bơm hoa hồng đã duyệt vào DB để thử luồng rút.
 *
 * Cần HAI đơn: ngưỡng rút mặc định là 500.000đ còn một đơn 2 triệu chỉ sinh
 * 400.000đ hoa hồng. Một đơn duy nhất bị chặn — và đó là hành vi đúng.
 */
const affId = created.body.affiliate.id;

// Test phải tự dựng đủ dữ liệu, không phụ thuộc vào việc đã chạy bộ test
// thanh toán trước đó hay chưa.
const productId = db.prepare("SELECT id FROM products LIMIT 1").get()?.id;
// 30 đơn, không phải 2. Vòng lặp cũ gọi D1 hai lần cho mỗi hoa hồng, nên chỉ
// vỡ khi một đợt chi có hơn ~23 cái — và với 2 cái thì bộ kiểm chứng báo xanh
// suốt trong khi lỗi nằm đó chờ một CTV bán chạy.
//
// Nói thẳng giới hạn của bộ kiểm này: bản giả lập chạy máy nhà KHÔNG áp trần
// 50 subrequest của Workers, nên 30 hoa hồng ở đây không tái hiện được cú ném
// trên thật — y như trần 100.000 vòng của PBKDF2 từng lọt qua mọi bài kiểm.
// Cái nó giữ được là phần logic: gộp một đợt chi lớn vào cùng một batch thì
// không con nào bị bỏ sót, và không con nào kẹt lại để lần sau chi trùng.
const SO_DON = 30;
while (db.prepare('SELECT COUNT(*) n FROM orders').get().n < SO_DON && productId) {
  const n = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  db.prepare(`INSERT INTO orders
    (id, order_code, product_id, full_name, phone, phone_norm, email, email_norm,
     amount_total, amount_paid, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?, 2000000, 2000000, 'paid', unixepoch(), unixepoch())`)
    .run(`o-test-${n}`, `GCTEST${n}Z`, productId, 'Khách Kiểm Thử',
      '0900000' + String(n).padStart(3, '0'), '8490000' + String(n).padStart(4, '0'),
      null, null);
}

const orderIds = db.prepare('SELECT id FROM orders LIMIT ?').all(SO_DON).map((r) => r.id);
if (orderIds.length >= SO_DON) {
  orderIds.forEach((oid, i) => {
    db.prepare(`INSERT OR REPLACE INTO commissions
      (id, affiliate_id, order_id, base_amount, rate, amount, status, available_at, created_at, updated_at)
      VALUES (?, ?, ?, 2000000, 2000, 400000, 'approved', unixepoch(), unixepoch(), unixepoch())`)
      .run('c-test-' + i, affId, oid);
  });

  const payout = await aff.post('/api/aff/payouts');
  ok('yêu cầu rút thành công', payout.body.ok, true);
  ok(`số tiền đúng (${SO_DON} đơn × 400k)`, payout.body.amount, SO_DON * 400000);
  ok('mã đợt chi đúng định dạng', /^PO-\d{4}-\d{4}$/.test(payout.body.payoutCode), true);

  const again = await aff.post('/api/aff/payouts');
  ok('không rút lại được cùng hoa hồng đó', again.status, 400);
  ok('hoa hồng chuyển sang payout_requested',
    db.prepare("SELECT status FROM commissions WHERE id='c-test-0'").get().status, 'payout_requested');

  // Admin duyệt và chi.
  const payoutId = payout.body.payoutId;
  ok('đánh dấu đã chi khi CHƯA duyệt bị chặn',
    (await admin.post(`/api/admin/payouts/${payoutId}/paid`, { reference: 'FT123' })).status, 400);
  ok('admin duyệt được', (await admin.post(`/api/admin/payouts/${payoutId}/approve`)).status, 200);
  ok('đánh dấu đã chi mà thiếu mã giao dịch bị chặn',
    (await admin.post(`/api/admin/payouts/${payoutId}/paid`, {})).status, 400);
  ok('đánh dấu đã chi kèm mã giao dịch thành công',
    (await admin.post(`/api/admin/payouts/${payoutId}/paid`, { reference: 'FT20260905001' })).status, 200);
  ok('TẤT CẢ hoa hồng chuyển sang đã chi, không sót cái nào',
    db.prepare("SELECT COUNT(*) n FROM commissions WHERE id LIKE 'c-test-%' AND status='paid'").get().n, SO_DON);
  // Sót một cái là nó quay lại đợt chi sau và CTV được trả tiền hai lần.
  ok('không còn cái nào kẹt ở payout_requested',
    db.prepare("SELECT COUNT(*) n FROM commissions WHERE id LIKE 'c-test-%' AND status='payout_requested'").get().n, 0);
  ok('đã chi rồi thì không chi lại được',
    (await admin.post(`/api/admin/payouts/${payoutId}/paid`, { reference: 'FT-lan-2' })).status, 400);
}
console.log('');

// ---------------------------------------------------------------- lịch
console.log('Lịch tháng');
{
  // Ba buổi đặt đúng vào những chỗ múi giờ hay làm sai:
  //   · 06:00 giờ VN ngày 1  → 23:00 UTC ngày TRƯỚC ĐÓ, tháng trước.
  //   · 23:30 giờ VN ngày cuối tháng → 16:30 UTC cùng ngày.
  // Tính bằng UTC là buổi thứ nhất rơi ra ngoài tháng và biến mất khỏi lịch.
  const thang = '2026-11';
  const unix = (iso) => Math.floor(Date.parse(iso) / 1000);
  const dat = (id, title, iso) => db.prepare(`INSERT OR REPLACE INTO workshop_sessions
      (id, slug, title, starts_at, duration_min, zoom_url, status, created_at, updated_at)
    VALUES (?,?,?,?,135,?, 'upcoming', unixepoch(), unixepoch())`)
    .run(id, id, title, unix(iso), 'https://zoom.us/j/lich');

  dat('lich-a', 'Buổi sáng sớm', '2026-11-01T06:00:00+07:00');
  dat('lich-b', 'Buổi tối muộn', '2026-11-30T23:30:00+07:00');
  dat('lich-c', 'Buổi tháng khác', '2026-12-05T20:00:00+07:00');

  const res = await admin.get(`/api/admin/lich?thang=${thang}`);
  ok('lấy được lịch', res.status, 200);
  const ids = (res.body.events ?? []).map((e) => e.id);
  ok('buổi 6h sáng ngày 1 nằm ĐÚNG trong tháng', ids.includes('lich-a'), true);
  ok('buổi 23h30 ngày cuối tháng vẫn trong tháng', ids.includes('lich-b'), true);
  ok('buổi tháng khác KHÔNG lọt vào', ids.includes('lich-c'), false);

  const a = (res.body.events ?? []).find((e) => e.id === 'lich-a');
  ok('ngày theo giờ Việt Nam, không phải UTC', a?.date, '2026-11-01');
  ok('giờ hiển thị đúng', a?.time, '06:00');
  ok('có đếm số người đăng ký', typeof a?.registrations, 'number');

  ok('tham số tháng sai bị từ chối', (await admin.get('/api/admin/lich?thang=11-2026')).status, 400);

  db.prepare("DELETE FROM workshop_sessions WHERE id LIKE 'lich-%'").run();
}
console.log('');

// ---------------------------------------------------------------- duyệt bài
console.log('Duyệt bài, coin và chuỗi ngày');
{
  const prod = db.prepare("SELECT id FROM products LIMIT 1").get()?.id;
  const stId = 'st-game-test';
  const enId = 'en-game-test';
  db.prepare('DELETE FROM submissions WHERE student_id = ?').run(stId);
  db.prepare('DELETE FROM coin_ledger WHERE student_id = ?').run(stId);
  db.prepare('DELETE FROM enrollments WHERE id = ?').run(enId);
  db.prepare('DELETE FROM students WHERE id = ?').run(stId);
  db.prepare(`INSERT INTO students (id, full_name, phone, phone_norm, xp, coin,
    streak_current, streak_best, last_submit_date, created_at, updated_at)
    VALUES (?, 'Học Viên Kiểm Thử', '0900111222', '84900111222', 0, 0, 0, 0, NULL, unixepoch(), unixepoch())`)
    .run(stId);
  db.prepare(`INSERT INTO enrollments (id, student_id, product_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', unixepoch(), unixepoch())`).run(enId, stId, prod);

  const mkSub = (id, day, daysAgo) => {
    const ts = Math.floor(Date.now() / 1000) - daysAgo * 86400;
    db.prepare(`INSERT INTO submissions (id, enrollment_id, student_id, day, post_url, status, created_at, updated_at)
      VALUES (?,?,?,?, 'https://vidu.com/b', 'pending', ?, ?)`).run(id, enId, stId, day, ts, ts);
  };
  mkSub('sub-1', 1, 2);
  mkSub('sub-2', 2, 1);

  const st = () => db.prepare('SELECT xp, coin, streak_current, streak_best FROM students WHERE id = ?').get(stId);

  ok('trước khi duyệt: chưa có coin', st().coin, 0);

  const r1 = await admin.post('/api/admin/submissions/sub-1/review', { action: 'approve' });
  ok('duyệt bài đầu thành công', r1.body.ok, true);
  ok('cộng đúng coin cơ bản', st().coin, 50);
  ok('cộng đúng XP', st().xp, 100);
  ok('chuỗi bắt đầu từ 1', st().streak_current, 1);

  // Bấm duyệt lần hai: không được cộng thêm lần nào nữa.
  const r2 = await admin.post('/api/admin/submissions/sub-1/review', { action: 'approve' });
  ok('duyệt lại vẫn trả 200', r2.status, 200);
  ok('KHÔNG cộng coin lần hai', st().coin, 50);
  ok('KHÔNG cộng XP lần hai', st().xp, 100);

  await admin.post('/api/admin/submissions/sub-2/review', { action: 'approve' });
  ok('chuỗi tăng khi nộp ngày liền kề', st().streak_current, 2);
  ok('coin có thưởng chuỗi ở ngày thứ hai', st().coin, 50 + 55);

  ok('sổ cái ghi đủ số lần cộng',
    db.prepare("SELECT COUNT(*) n FROM coin_ledger WHERE student_id=? AND reason='submission'").get(stId).n, 2);
  ok('số dư khớp tổng sổ cái',
    db.prepare('SELECT COALESCE(SUM(delta),0) n FROM coin_ledger WHERE student_id=?').get(stId).n, st().coin);

  ok('tiến độ đếm bài ĐÃ DUYỆT',
    db.prepare('SELECT posts_done FROM enrollments WHERE id=?').get(enId).posts_done, 2);

  mkSub('sub-3', 3, 0);
  const r3 = await admin.post('/api/admin/submissions/sub-3/review', { action: 'needs_work' });
  ok('yêu cầu sửa mà thiếu nhận xét bị chặn', r3.status, 400);
  const r4 = await admin.post('/api/admin/submissions/sub-3/review',
    { action: 'needs_work', feedback: 'Hook chưa rõ, viết lại câu mở đầu giúp em.' });
  ok('có nhận xét thì cho qua', r4.status, 200);
  ok('yêu cầu sửa KHÔNG cộng coin', st().coin, 105);
}
console.log('');

// ---------------------------------------------------------------- đổi quà
console.log('Đổi quà');
{
  const stId = 'st-game-test';
  db.prepare('DELETE FROM reward_redemptions WHERE student_id = ?').run(stId);
  db.prepare('UPDATE students SET coin = 1000 WHERE id = ?').run(stId);
  db.prepare(`INSERT INTO reward_redemptions (id, student_id, reward_id, reward_name,
    cost_coin, status, created_at, updated_at)
    VALUES ('rd-test', ?, 'rw_hook', 'Bộ 100 Hook bản mở rộng', 300, 'requested', unixepoch(), unixepoch())`)
    .run(stId);
  // Coin đã bị trừ lúc đặt đổi (giữ chỗ) — mô phỏng đúng như luồng thật.
  db.prepare('UPDATE students SET coin = coin - 300 WHERE id = ?').run(stId);
  const coin = () => db.prepare('SELECT coin FROM students WHERE id = ?').get(stId).coin;
  ok('coin đã bị giữ chỗ', coin(), 700);

  const rj = await admin.post('/api/admin/redemptions/rd-test/reject', { note: 'Hết hàng' });
  ok('từ chối thành công', rj.status, 200);
  ok('HOÀN LẠI coin cho học viên', coin(), 1000);
  ok('trạng thái chuyển sang đã từ chối',
    db.prepare("SELECT status FROM reward_redemptions WHERE id='rd-test'").get().status, 'rejected');
  const again = await admin.post('/api/admin/redemptions/rd-test/reject', {});
  ok('từ chối lần hai bị chặn, không hoàn coin thêm', again.status, 400);
  ok('coin không bị hoàn hai lần', coin(), 1000);
}
console.log('');

// ---------------------------------------------------------------- nhân sự
//
// Thêm người vào hệ quản trị là việc nguy hiểm nhất trong cả trang: sai một
// nước là mất quyền vào chính trang này, và sửa thì phải bới cơ sở dữ liệu.
// Bốn luật dưới đây kiểm ở tầng server, không phải chỉ ẩn nút trên giao diện.
console.log('Nhân sự');
{
  const meRow = (await admin.get('/api/admin/staff')).body;
  const laOwner = meRow?.staff !== undefined;
  if (!laOwner) {
    console.log('   (bỏ qua — tài khoản đang dùng không phải owner)');
  } else {
    const email = `nv-${Date.now()}@test.vn`;
    const them = await admin.post('/api/admin/staff', { name: 'Bạn Trực Page', email, role: 'staff' });
    ok('thêm được nhân viên', them.status, 200);
    ok('mật khẩu trả về đúng một lần', typeof them.body.password === 'string', true);
    ok('email trùng → 409 chứ không phải 500',
      (await admin.post('/api/admin/staff', { name: 'Trùng', email, role: 'staff' })).status, 409);

    ok('tự đổi vai trò của mình bị chặn',
      (await admin.patch(`/api/admin/staff/${meRow.me}`, { role: 'staff' })).status, 400);
    ok('tự tắt tài khoản của mình bị chặn',
      (await admin.patch(`/api/admin/staff/${meRow.me}`, { isActive: false })).status, 400);

    const nvId = them.body.id;
    const dat = await admin.post(`/api/admin/staff/${nvId}/mat-khau`);
    ok('đặt lại mật khẩu được', dat.status, 200);
    ok('mật khẩu mới khác mật khẩu cũ', dat.body.password !== them.body.password, true);

    const nv = makeClient();
    const dnMoi = await nv.req('POST', '/api/admin/login', { email, password: dat.body.password });
    ok('mật khẩu MỚI đăng nhập được', dnMoi.status, 200);
    nv.setCsrf((await nv.get('/api/admin/me')).body.csrfToken);
    ok('mật khẩu CŨ hết dùng được',
      (await makeClient().req('POST', '/api/admin/login', { email, password: them.body.password })).status, 401);

    ok('nhân viên xem danh sách nhân sự → 403', (await nv.get('/api/admin/staff')).status, 403);
    ok('nhân viên tự nâng mình lên owner → 403',
      (await nv.patch(`/api/admin/staff/${nvId}`, { role: 'owner' })).status, 403);

    // Tự đặt lại mật khẩu của CHÍNH MÌNH thì KHÔNG bị đăng xuất. Người vừa bấm
    // nút đã chứng minh họ đang đăng nhập hợp lệ giây trước đó; đá họ ra không
    // an toàn thêm chút nào, chỉ khiến màn hình hiện lỗi đỏ ngay dưới mật khẩu
    // mới — đọc như hỏng trong khi mọi thứ vừa chạy đúng.
    const tuDat = await admin.post(`/api/admin/staff/${meRow.me}/mat-khau`);
    ok('tự đặt lại mật khẩu của mình được', tuDat.status, 200);
    ok('và KHÔNG bị đăng xuất', (await admin.get('/api/admin/me')).status, 200);

    // ---- Tự đổi mật khẩu (có nhập mật khẩu cũ)
    //
    // Chạy bằng phiên của NHÂN VIÊN, không phải owner: đường này cố ý nằm
    // ngoài requireRole('owner') vì ai cũng phải đổi được mật khẩu của mình.
    // Kiểm bằng owner thì không phân biệt được nó có thật sự mở cho mọi vai
    // trò hay chỉ tình cờ chạy được vì owner làm gì cũng được.
    const mkCu = dat.body.password;
    const mkMoi = 'ChuoiDaiAnToan-2026';

    // Phiên thứ hai của cùng người, mở TRƯỚC khi đổi: đây là cái máy quên đăng
    // xuất ở quán cà phê, và nó phải chết sau khi đổi mật khẩu.
    const nvMayKhac = makeClient();
    await nvMayKhac.req('POST', '/api/admin/login', { email, password: mkCu });
    nvMayKhac.setCsrf((await nvMayKhac.get('/api/admin/me')).body.csrfToken);
    ok('máy thứ hai đang đăng nhập được', (await nvMayKhac.get('/api/admin/me')).status, 200);

    ok('sai mật khẩu hiện tại bị từ chối',
      (await nv.post('/api/admin/me/mat-khau', { current: 'sai-be-bet', next: mkMoi })).status, 400);
    ok('mật khẩu mới quá ngắn bị từ chối',
      (await nv.post('/api/admin/me/mat-khau', { current: mkCu, next: 'ngan123' })).status, 400);
    ok('mật khẩu dễ đoán bị từ chối',
      (await nv.post('/api/admin/me/mat-khau', { current: mkCu, next: 'goccreator2026' })).status, 400);
    ok('mật khẩu mới trùng mật khẩu cũ bị từ chối',
      (await nv.post('/api/admin/me/mat-khau', { current: mkCu, next: mkCu })).status, 400);

    ok('đổi mật khẩu thành công', (await nv.post('/api/admin/me/mat-khau',
      { current: mkCu, next: mkMoi })).status, 200);
    ok('người vừa đổi KHÔNG bị đăng xuất', (await nv.get('/api/admin/me')).status, 200);
    ok('máy thứ hai bị đăng xuất', (await nvMayKhac.get('/api/admin/me')).status, 401);
    ok('mật khẩu mới đăng nhập được', (await makeClient()
      .req('POST', '/api/admin/login', { email, password: mkMoi })).status, 200);
    ok('mật khẩu cũ hết dùng được', (await makeClient()
      .req('POST', '/api/admin/login', { email, password: mkCu })).status, 401);

    // Tắt xong thì phiên của người đó phải chết ngay, không đợi hết hạn —
    // tắt tài khoản mà họ vẫn thao tác được thì việc tắt gần như vô nghĩa.
    ok('tắt được tài khoản', (await admin.patch(`/api/admin/staff/${nvId}`, { isActive: false })).status, 200);
    ok('phiên của người vừa bị tắt chết ngay', (await nv.get('/api/admin/me')).status, 401);
  }
}
console.log('');

// ---------------------------------------------------------------- đăng xuất
console.log('Đăng xuất');
ok('đăng xuất được', (await admin.post('/api/admin/logout')).status, 200);
ok('phiên đã bị thu hồi', (await admin.get('/api/admin/me')).status, 401);
console.log('');

console.log(failures === 0 ? 'TẤT CẢ KHẲNG ĐỊNH ĐỀU ĐÚNG' : `CÓ ${failures} KHẲNG ĐỊNH SAI`);
process.exit(failures === 0 ? 0 : 1);
