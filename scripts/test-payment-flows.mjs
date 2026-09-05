/**
 * Kiểm chứng đầu-cuối luồng thanh toán và hoa hồng trên wrangler dev.
 *
 * Chạy:  npm run dev          (cửa sổ khác)
 *        node scripts/test-payment-flows.mjs
 *
 * Đây là phần rủi ro nhất của hệ thống: tiền thật, webhook gửi lại nhiều lần,
 * và hoa hồng không được phép trả kép. Unit test không phủ được vì nó nằm ở
 * tương tác giữa ràng buộc UNIQUE của D1, batch atomic và thứ tự xử lý.
 */

import { openLocalD1 } from './lib/local-d1.mjs';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const WEBHOOK_KEY = process.env.SEPAY_WEBHOOK_API_KEY ?? 'dev-webhook-key-123';

const db = openLocalD1();

let failures = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`   ${pass ? '✓' : '✗'} ${label.padEnd(46)} ${actual}${pass ? '' : ` (mong đợi ${expected})`}`);
};
const count = (sql, ...args) => db.prepare(sql).get(...args).n;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Xoá sạch giữa các kịch bản.
 *
 * Thử lại khi gặp "database is locked": webhook nay gọi ctx.waitUntil() để gửi
 * email SAU khi đã trả lời, nên Worker vẫn còn ghi vào D1 một nhịp sau khi
 * request kết thúc. Đó là hành vi ĐÚNG của sản phẩm — chờ nó xong là việc của
 * bộ kiểm chứng, không phải lý do để bỏ waitUntil đi.
 */
async function reset() {
  const tables = ['events', 'orders', 'leads', 'workshop_registrations', 'affiliate_clicks',
    'payments', 'commissions', 'students', 'enrollments', 'daily_stats', 'audit_log',
    'webhook_events', 'payout_items', 'payouts', 'email_outbox'];
  for (let attempt = 0; ; attempt++) {
    try {
      for (const t of tables) db.exec(`DELETE FROM ${t}`);
      return;
    } catch (err) {
      if (attempt >= 20 || !/locked/i.test(String(err.message))) throw err;
      await sleep(100);
    }
  }
}

const post = (path, body, headers = {}) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const hook = (payload, key = WEBHOOK_KEY) =>
  post('/api/webhooks/sepay', payload, { authorization: `Apikey ${key}` });

let seq = 0;
const nextTx = () => 90000 + ++seq;

/**
 * Mỗi kịch bản dùng một IP giả riêng. Rate limit là 8 đơn/10 phút/IP — dùng
 * chung một IP thì các kịch bản sau bị chính cơ chế chống spam chặn lại,
 * và đó là hành vi ĐÚNG, không phải lỗi cần tắt đi.
 */
let scenarioIp = '10.0.0.1';

async function createOrder(overrides = {}, cookie = '') {
  const res = await post('/api/register', {
    name: 'Trần Văn Bình', phone: '0987654321', email: 'binh@vidu.com',
    field: 'Nội thất', note: 'Muốn có khách đều mỗi tháng',
    budget: 'ready_2m', timeline: 'now', website: '', ...overrides,
  }, { 'cf-connecting-ip': scenarioIp, ...(cookie ? { cookie } : {}) });
  const body = await res.json();
  if (!body.ok) throw new Error('không tạo được đơn: ' + JSON.stringify(body));
  return body.order.code;
}

const scenarios = [];
const test = (name, fn) => scenarios.push([name, fn]);

// ------------------------------------------------------------------ kịch bản

test('Trả đủ một lần → paid, tạo học viên và ghi danh', async () => {
  const code = await createOrder();
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: `CT DEN ${code}` });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('trạng thái đơn', o.status, 'paid');
  ok('số tiền đã nhận', o.amount_paid, 2000000);
  ok('số học viên', count('SELECT COUNT(*) n FROM students'), 1);
  ok('số ghi danh', count('SELECT COUNT(*) n FROM enrollments'), 1);
  ok('lead chuyển sang won', count("SELECT COUNT(*) n FROM leads WHERE status='won'"), 1);
});

test('Webhook gửi lại y hệt → duplicate, không nhân đôi bất cứ thứ gì', async () => {
  const code = await createOrder();
  const tx = nextTx();
  const payload = { id: tx, transferType: 'in', transferAmount: 2000000, content: code };
  await hook(payload);
  const res = await hook(payload);
  ok('lần gửi lại vẫn trả 200', res.status, 200);
  ok('số giao dịch ghi nhận', count('SELECT COUNT(*) n FROM payments'), 1);
  ok('số ghi danh', count('SELECT COUNT(*) n FROM enrollments'), 1);
  ok('nhật ký có 1 bản duplicate', count("SELECT COUNT(*) n FROM webhook_events WHERE outcome='duplicate'"), 1);
});

test('Chuyển thiếu rồi chuyển nốt → paid, chỉ một ghi danh', async () => {
  const code = await createOrder();
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 800000, content: code });
  let o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('sau lần 1: trạng thái', o.status, 'partially_paid');
  ok('sau lần 1: chưa ghi danh', count('SELECT COUNT(*) n FROM enrollments'), 0);

  await hook({ id: nextTx(), transferType: 'in', transferAmount: 1200000, content: code });
  o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('sau lần 2: trạng thái', o.status, 'paid');
  ok('sau lần 2: tổng đã nhận', o.amount_paid, 2000000);
  ok('sau lần 2: số ghi danh', count('SELECT COUNT(*) n FROM enrollments'), 1);
});

test('Chuyển thừa (trả 2 lần đủ tiền) → overpaid, KHÔNG hoa hồng kép', async () => {
  const aff = 'aff1';
  db.exec(`UPDATE affiliates SET status='active' WHERE id='${aff}'`);
  const code = await createOrder({}, `gc_ref=${aff}%7C${Math.floor(Date.now() / 1000)}`);
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code });
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('trạng thái đơn', o.status, 'overpaid');
  ok('tổng đã nhận', o.amount_paid, 4000000);
  ok('số ghi danh', count('SELECT COUNT(*) n FROM enrollments'), 1);
  ok('số hoa hồng', count('SELECT COUNT(*) n FROM commissions'), 1);
  const c = db.prepare('SELECT amount FROM commissions').get();
  ok('hoa hồng = 20% của 2.000.000', c?.amount ?? 0, 400000);
});

test('Nội dung chuyển khoản sai → unmatched, không đụng vào đơn nào', async () => {
  const code = await createOrder();
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: 'CHUYEN TIEN AN TRUA' });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('đơn vẫn đang chờ', o.status, 'pending');
  ok('giao dịch để chưa khớp', count("SELECT COUNT(*) n FROM payments WHERE status='unmatched'"), 1);
  ok('chưa ghi danh ai', count('SELECT COUNT(*) n FROM enrollments'), 0);
});

test('Ngân hàng cắt xén nội dung → vẫn khớp đúng đơn', async () => {
  const code = await createOrder();
  await hook({
    id: nextTx(), transferType: 'in', transferAmount: 2000000,
    content: `FT26091234567 CT DEN 0987654321 TRAN VAN BINH chuyen khoan ${code} GD 123456`,
  });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('trạng thái đơn', o.status, 'paid');
  ok('cách khớp', db.prepare('SELECT match_method m FROM payments').get().m, 'auto_code');
});

test('Tiền đi ra → bỏ qua, không ảnh hưởng đơn nào', async () => {
  const code = await createOrder();
  await hook({ id: nextTx(), transferType: 'out', transferAmount: 500000, content: code });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('đơn vẫn đang chờ', o.status, 'pending');
  ok('giao dịch bị bỏ qua', count("SELECT COUNT(*) n FROM payments WHERE status='ignored'"), 1);
});

test('Sai Apikey → 401, không ghi giao dịch nào', async () => {
  const code = await createOrder();
  const res = await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code }, 'key-sai');
  ok('mã trả về', res.status, 401);
  ok('không ghi giao dịch', count('SELECT COUNT(*) n FROM payments'), 0);
  ok('có ghi vào nhật ký để truy vết', count("SELECT COUNT(*) n FROM webhook_events WHERE outcome='rejected'"), 1);
});

test('Đơn hết hạn trả tiền muộn → vẫn khớp, vẫn vào lớp', async () => {
  const code = await createOrder();
  db.prepare("UPDATE orders SET status='expired', expires_at=unixepoch()-3600 WHERE order_code=?").run(code);
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('trạng thái đơn', o.status, 'paid');
  ok('vẫn ghi danh', count('SELECT COUNT(*) n FROM enrollments'), 1);
});

test('CTV tự mua bằng chính SĐT của mình → KHÔNG có hoa hồng', async () => {
  const aff = db.prepare("SELECT id, phone FROM affiliates WHERE id='aff1'").get();
  const code = await createOrder(
    { phone: aff.phone, email: 'khac@vidu.com' },
    `gc_ref=${aff.id}%7C${Math.floor(Date.now() / 1000)}`,
  );
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code });
  const o = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(code);
  ok('đơn vẫn hoàn tất bình thường', o.status, 'paid');
  ok('quy kết vẫn ghi nhận', o.affiliate_id, aff.id);
  ok('KHÔNG sinh hoa hồng', count('SELECT COUNT(*) n FROM commissions'), 0);
});

test('Quy kết chạm đầu: CTV thứ hai không cướp được hoa hồng', async () => {
  const first = Math.floor(Date.now() / 1000);
  // Khách đã mang cookie của aff1; sau đó bấm link aff2 rồi mới mua.
  const jar = `gc_vid=v-test; gc_ref=aff1%7C${first}`;
  await fetch(`${BASE}/?ref=HOANGNAM`, {
    headers: { cookie: jar, 'cf-connecting-ip': scenarioIp },
  });
  const code = await createOrder({}, jar);
  await hook({ id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code });
  const c = db.prepare('SELECT affiliate_id FROM commissions').get();
  ok('hoa hồng về CTV chạm đầu', c?.affiliate_id, 'aff1');
  ok('CTV thứ hai vẫn thấy click của mình',
    count("SELECT COUNT(*) n FROM affiliate_clicks WHERE affiliate_id='aff2'"), 1);
  ok('nhưng không phải chạm đầu',
    count("SELECT COUNT(*) n FROM affiliate_clicks WHERE affiliate_id='aff2' AND is_first_touch=1"), 0);
});

test('Email xác nhận vào hàng đợi đúng một lần dù webhook gửi lại', async () => {
  const code = await createOrder();
  const payload = { id: nextTx(), transferType: 'in', transferAmount: 2000000, content: code };
  await hook(payload);
  await hook(payload);
  await hook({ ...payload, id: nextTx() });   // giao dịch khác, cùng đơn → overpaid

  ok('số email trong hàng đợi', count("SELECT COUNT(*) n FROM email_outbox WHERE template='order_paid'"), 1);

  const mail = db.prepare("SELECT * FROM email_outbox WHERE template='order_paid'").get();
  ok('gửi đúng địa chỉ khách', mail.to_email, 'binh@vidu.com');
  ok('tiêu đề có mã đơn', mail.subject.includes(code), true);
  ok('nội dung có link tra cứu', mail.body_text.includes('/tra-cuu'), true);

  // Chưa cấu hình nhà cung cấp thì phải là 'skipped', KHÔNG phải 'failed':
  // 'failed' đọc như "có gì đó hỏng cần sửa", còn sự thật là tính năng chưa bật.
  ok('trạng thái khi chưa có RESEND_API_KEY', mail.status, 'skipped');
  ok('không thử lại vô ích', mail.attempts, 0);
});

test('Workshop: mọi ô bắt buộc, gửi mail đúng một lần', async () => {
  const dangKy = (phone, email) => post('/api/workshop/register', {
    name: 'Lê Thị Hoa', phone, email,
    field: 'Bán đồ handmade', stuck: 'Không biết bắt đầu từ đâu',
    goal_text: 'Muốn có khách đều', daily_time: '1_2h',
    channel: 'none_yet', goal: 'sell_products', website: '',
  }, { 'cf-connecting-ip': scenarioIp });

  await dangKy('0912000111', 'hoa@vidu.com');
  ok('xếp hàng một email', count("SELECT COUNT(*) n FROM email_outbox WHERE template='workshop_registered'"), 1);

  // Đăng ký lại cùng số cho cùng buổi: bản ghi là no-op, mail cũng phải no-op.
  await dangKy('0912000111', 'hoa@vidu.com');
  ok('đăng ký lại không gửi thêm', count("SELECT COUNT(*) n FROM email_outbox WHERE template='workshop_registered'"), 1);

  const mail = db.prepare("SELECT * FROM email_outbox WHERE template='workshop_registered'").get();
  ok('mail có link phòng Zoom', mail.body_text.includes('https://zoom.us/j/kiem-chung'), true);

  // Email nay BẮT BUỘC ở form workshop: thiếu thì đăng ký bị từ chối ngay,
  // không tạo lead rỗng và cũng không có dòng mail rỗng nào lọt vào hàng đợi.
  const thieuEmail = await dangKy('0912000222', '');
  ok('thiếu email bị từ chối', thieuEmail.status, 400);
  ok('không sinh thêm bản ghi đăng ký nào',
    count('SELECT COUNT(*) n FROM workshop_registrations'), 1);
  ok('hàng đợi mail không có dòng rỗng',
    count("SELECT COUNT(*) n FROM email_outbox WHERE template='workshop_registered'"), 1);

  // Thiếu một ô chọn cũng bị từ chối — đó là điểm của việc bắt buộc hết.
  const thieuChon = await post('/api/workshop/register', {
    name: 'Trần Văn B', phone: '0912000333', email: 'b@vidu.com',
    field: 'Bán đồ handmade', stuck: 'Không biết bắt đầu từ đâu',
    channel: 'none_yet', goal: 'sell_products', website: '',
  }, { 'cf-connecting-ip': scenarioIp });
  ok('thiếu ô chọn bị từ chối', thieuChon.status, 400);
});

/**
 * Hai cộng tác viên cố định mà các kịch bản hoa hồng dựa vào.
 *
 * Trước đây hai dòng này nằm sẵn trong database cục bộ từ một phiên làm việc cũ,
 * không có ở đâu trong mã. Đổi tên Worker một cái là miniflare sinh database
 * mới, dữ liệu nền biến mất, và ba kịch bản hoa hồng gãy vì lý do không liên
 * quan gì tới hoa hồng. Bộ kiểm chứng phải tự dựng lấy thứ nó cần.
 *
 * reset() cố ý KHÔNG xoá bảng affiliates, nên dựng một lần ở đây là đủ cho mọi
 * kịch bản.
 */
function seedAffiliates() {
  const ctv = [
    ['aff1', 'MINHANH', 'Minh Anh', 'minhanh@vidu.com', '0911111111', '84911111111', 'NGUYEN MINH ANH'],
    ['aff2', 'HOANGNAM', 'Hoàng Nam', 'nam@vidu.com', '0922222222', '84922222222', 'TRAN HOANG NAM'],
  ];
  const stmt = db.prepare(`INSERT OR REPLACE INTO affiliates
      (id, code, name, email, email_norm, phone, phone_norm, status, commission_rate,
       bank_account_name, payout_threshold, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?, 'active', 2000, ?, 500000, unixepoch(), unixepoch())`);
  for (const [id, code, name, email, phone, phoneNorm, bank] of ctv) {
    stmt.run(id, code, name, email, email, phone, phoneNorm, bank);
  }
}

/**
 * Một buổi workshop đang mở đăng ký.
 *
 * Cũng là dữ liệu nền từng nằm sẵn trong database cũ. Buổi workshop trong dữ
 * liệu mẫu có ngày cố định, nên nó tự hết hạn theo thời gian và kịch bản gãy
 * vào một ngày chẳng ai đụng vào mã — /api/workshop/register trả 503 "chưa có
 * buổi nào đang mở". Đặt ngày theo lúc chạy để bộ kiểm chứng không có hạn dùng.
 */
function seedWorkshopSession() {
  db.prepare(`INSERT OR REPLACE INTO workshop_sessions
      (id, slug, title, starts_at, duration_min, zoom_url, zalo_group_url,
       status, created_at, updated_at)
    VALUES ('ws-test', 'ws-test', 'Workshop kiểm chứng', unixepoch() + 604800, 135,
            'https://zoom.us/j/kiem-chung', 'https://zalo.me/g/kiem-chung',
            'upcoming', unixepoch(), unixepoch())`).run();
}

// ------------------------------------------------------------------ chạy

/**
 * Dải IP riêng cho mỗi lần chạy.
 *
 * Rate limit của /api/workshop/register là 5 lượt trong 10 phút cho mỗi IP, và
 * nó nằm trong KV — KV sống qua các lần chạy script. Dùng IP cố định thì lần
 * chạy thứ hai trong vòng 10 phút ăn 429, kịch bản workshop báo đỏ, và cái đỏ
 * đó không nói gì về sản phẩm cả. Đổi dải IP mỗi lần chạy là hết.
 */
const runBlock = Math.floor(Math.random() * 65536);

console.log(`\nKiểm chứng luồng thanh toán — ${BASE}\n`);
seedAffiliates();
seedWorkshopSession();
for (const [i, [name, fn]] of scenarios.entries()) {
  await reset();
  scenarioIp = `10.${runBlock >> 8}.${runBlock & 255}.${i + 1}`;
  console.log(name);
  try {
    await fn();
  } catch (err) {
    failures++;
    console.log('   ✗ NGOẠI LỆ:', err.message);
  }
  console.log('');
}

console.log(failures === 0
  ? `TẤT CẢ ${scenarios.length} KỊCH BẢN ĐỀU ĐÚNG`
  : `CÓ ${failures} KHẲNG ĐỊNH SAI`);
process.exit(failures === 0 ? 0 : 1);
