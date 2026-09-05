/**
 * Kiểm chứng API quản trị và portal cộng tác viên.
 *
 *   npm run dev                       (cửa sổ khác)
 *   node scripts/create-admin.mjs --email admin@test.vn
 *   node scripts/test-admin-flows.mjs --email admin@test.vn --password <mật khẩu vừa in>
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const EMAIL = arg('email');
const PASSWORD = arg('password');
if (!EMAIL || !PASSWORD) { console.error('Cần --email và --password'); process.exit(1); }

const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const db = new DatabaseSync(join(D1_DIR, readdirSync(D1_DIR).find((f) => f.endsWith('.sqlite'))));

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
while (db.prepare('SELECT COUNT(*) n FROM orders').get().n < 2 && productId) {
  const n = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  db.prepare(`INSERT INTO orders
    (id, order_code, product_id, full_name, phone, phone_norm, email, email_norm,
     amount_total, amount_paid, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?, 2000000, 2000000, 'paid', unixepoch(), unixepoch())`)
    .run(`o-test-${n}`, `GCTEST${n}Z`, productId, 'Khách Kiểm Thử',
      '0900000' + String(n).padStart(3, '0'), '8490000' + String(n).padStart(4, '0'),
      null, null);
}

const orderIds = db.prepare('SELECT id FROM orders LIMIT 2').all().map((r) => r.id);
if (orderIds.length >= 2) {
  orderIds.forEach((oid, i) => {
    db.prepare(`INSERT OR REPLACE INTO commissions
      (id, affiliate_id, order_id, base_amount, rate, amount, status, available_at, created_at, updated_at)
      VALUES (?, ?, ?, 2000000, 2000, 400000, 'approved', unixepoch(), unixepoch(), unixepoch())`)
      .run('c-test-' + i, affId, oid);
  });

  const payout = await aff.post('/api/aff/payouts');
  ok('yêu cầu rút thành công', payout.body.ok, true);
  ok('số tiền đúng (2 đơn × 400k)', payout.body.amount, 800000);
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
  ok('cả hai hoa hồng chuyển sang đã chi',
    db.prepare("SELECT COUNT(*) n FROM commissions WHERE id LIKE 'c-test-%' AND status='paid'").get().n, 2);
  ok('đã chi rồi thì không chi lại được',
    (await admin.post(`/api/admin/payouts/${payoutId}/paid`, { reference: 'FT-lan-2' })).status, 400);
}
console.log('');

// ---------------------------------------------------------------- đăng xuất
console.log('Đăng xuất');
ok('đăng xuất được', (await admin.post('/api/admin/logout')).status, 200);
ok('phiên đã bị thu hồi', (await admin.get('/api/admin/me')).status, 401);
console.log('');

console.log(failures === 0 ? 'TẤT CẢ KHẲNG ĐỊNH ĐỀU ĐÚNG' : `CÓ ${failures} KHẲNG ĐỊNH SAI`);
process.exit(failures === 0 ? 0 : 1);
