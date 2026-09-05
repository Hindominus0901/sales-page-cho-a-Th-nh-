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
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const WEBHOOK_KEY = process.env.SEPAY_WEBHOOK_API_KEY ?? 'dev-webhook-key-123';
const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

const db = new DatabaseSync(join(D1_DIR, readdirSync(D1_DIR).find((f) => f.endsWith('.sqlite'))));

let failures = 0;
const ok = (label, actual, expected) => {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`   ${pass ? '✓' : '✗'} ${label.padEnd(46)} ${actual}${pass ? '' : ` (mong đợi ${expected})`}`);
};
const count = (sql, ...args) => db.prepare(sql).get(...args).n;

function reset() {
  for (const t of ['events', 'orders', 'leads', 'workshop_registrations', 'affiliate_clicks',
    'payments', 'commissions', 'students', 'enrollments', 'daily_stats', 'audit_log',
    'webhook_events', 'payout_items', 'payouts']) db.exec(`DELETE FROM ${t}`);
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

// ------------------------------------------------------------------ chạy

console.log(`\nKiểm chứng luồng thanh toán — ${BASE}\n`);
for (const [i, [name, fn]] of scenarios.entries()) {
  reset();
  scenarioIp = `10.0.0.${i + 1}`;
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
