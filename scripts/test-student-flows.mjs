/**
 * Kiểm chứng cổng học viên: nộp bài, nộp lại, khoá bài đã duyệt, đổi quà.
 *
 *   npm run dev                       (cửa sổ khác)
 *   node scripts/test-student-flows.mjs
 *
 * Không cần đăng nhập: cổng học viên chạy bằng mã trong đường link.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const db = new DatabaseSync(join(D1_DIR, readdirSync(D1_DIR).find((f) => f.endsWith('.sqlite'))));

let failures = 0;
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`   ${pass ? '✓' : '✗'} ${label.padEnd(48)} ${JSON.stringify(actual)}`
    + `${pass ? '' : ` (mong đợi ${JSON.stringify(expected)})`}`);
};

const now = Math.floor(Date.now() / 1000);

// Số điện thoại riêng mỗi lần chạy: `UNIQUE(phone_norm)` là ràng buộc thật của
// hệ, không phải thứ để né bằng cách xoá dữ liệu người khác.
const suffix = String(now % 1000000).padStart(6, '0');
const PHONE = '09' + suffix + '9';
const PHONE_NORM = '849' + suffix + '9';
const post = (path, body) => fetch(BASE + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.7.' + (1 + Math.floor(Math.random() * 250)) },
  body: JSON.stringify(body),
}).then((r) => r.json());
const get = (path) => fetch(BASE + path, { cache: 'no-store' }).then((r) => r.json());

// ---------------------------------------------------------- dựng dữ liệu thử

const token = randomBytes(16).toString('hex');
const studentId = randomUUID();
const enrollmentId = randomUUID();
const productId = db.prepare(`SELECT id FROM products LIMIT 1`).get().id;

db.prepare(
  `INSERT INTO students (id, full_name, phone, phone_norm, xp, coin, streak_current,
                         streak_best, created_at, updated_at)
   VALUES (?,?,?,?,0,0,0,0,?,?)`,
).run(studentId, 'Học viên Kiểm Thử', PHONE, PHONE_NORM, now, now);

db.prepare(
  `INSERT INTO enrollments (id, student_id, product_id, status, started_at,
                            access_token, token_created_at, created_at, updated_at)
   VALUES (?,?,?, 'active', ?,?,?,?,?)`,
).run(enrollmentId, studentId, productId, now - 3 * 86400, token, now, now, now);

console.log(`\n▸ Học viên thử: ${studentId.slice(0, 8)} · link /hoc/${token.slice(0, 8)}…\n`);

// ------------------------------------------------------------------ kịch bản

console.log('1. Mở link và nộp bài');
const first = await get(`/api/hoc/${token}`);
ok('mở được cổng học viên', first.ok, true);
ok('vẽ đủ 21 ô ngày', first.days.length, 21);
ok('ngày hôm nay là ngày 4', first.student.currentDay, 4);

const submitted = await post(`/api/hoc/${token}/nop-bai`, {
  day: 1, postUrl: 'https://facebook.com/bai-ngay-1', content: 'Bài đầu tiên', channel: 'facebook',
});
ok('nộp bài thành công', submitted.ok, true);
ok('bài vào hàng chờ duyệt',
  db.prepare(`SELECT status FROM submissions WHERE enrollment_id = ? AND day = 1`).get(enrollmentId).status,
  'pending');

console.log('\n2. Nộp lại thì SỬA bài cũ, không tạo bài thứ hai');
await post(`/api/hoc/${token}/nop-bai`, {
  day: 1, postUrl: 'https://facebook.com/bai-ngay-1-sua-lai', content: '', channel: 'tiktok',
});
ok('vẫn chỉ một bài cho ngày 1',
  db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE enrollment_id = ? AND day = 1`).get(enrollmentId).n, 1);
ok('link đã đổi',
  db.prepare(`SELECT post_url FROM submissions WHERE enrollment_id = ? AND day = 1`).get(enrollmentId).post_url,
  'https://facebook.com/bai-ngay-1-sua-lai');

console.log('\n3. Link hỏng và dữ liệu không hợp lệ đều bị chặn');
ok('mã sai → 404', (await get(`/api/hoc/${'0'.repeat(32)}`)).ok, false);
ok('link bài không phải URL bị từ chối',
  (await post(`/api/hoc/${token}/nop-bai`, { day: 2, postUrl: 'chưa có link', content: '', channel: 'facebook' })).ok,
  false);
ok('ngày ngoài 1–21 bị từ chối',
  (await post(`/api/hoc/${token}/nop-bai`, { day: 22, postUrl: 'https://x.com/a', content: '', channel: 'facebook' })).ok,
  false);

console.log('\n4. Bài đã duyệt thì khoá lại, không sửa được nữa');
db.prepare(
  `UPDATE submissions SET status = 'approved', coin_awarded = 50, xp_awarded = 100
   WHERE enrollment_id = ? AND day = 1`,
).run(enrollmentId);
const locked = await post(`/api/hoc/${token}/nop-bai`, {
  day: 1, postUrl: 'https://facebook.com/link-khac-hoan-toan', content: '', channel: 'facebook',
});
ok('bài đã duyệt không sửa được', locked.ok, false);
ok('link giữ nguyên như lúc được duyệt',
  db.prepare(`SELECT post_url FROM submissions WHERE enrollment_id = ? AND day = 1`).get(enrollmentId).post_url,
  'https://facebook.com/bai-ngay-1-sua-lai');

console.log('\n5. Đổi quà');
const rewardId = randomUUID();
db.prepare(
  `INSERT INTO rewards (id, name, cost_coin, min_rank, stock, is_active, sort_order, created_at, updated_at)
   VALUES (?, 'Quà kiểm thử', 300, 0, 1, 1, 0, ?, ?)`,
).run(rewardId, now, now);

const poor = await post(`/api/hoc/${token}/doi-qua`, { rewardId });
ok('không đủ coin thì không đổi được', poor.ok, false);

db.prepare(`UPDATE students SET coin = 500 WHERE id = ?`).run(studentId);
const redeemed = await post(`/api/hoc/${token}/doi-qua`, { rewardId });
ok('đổi được khi đủ coin', redeemed.ok, true);
ok('trừ đúng số coin', redeemed.coinLeft, 200);
ok('coin trong CSDL khớp',
  db.prepare(`SELECT coin FROM students WHERE id = ?`).get(studentId).coin, 200);
ok('sổ cái ghi lại lần trừ',
  db.prepare(`SELECT delta FROM coin_ledger WHERE student_id = ? AND reason = 'redeem'`).get(studentId).delta, -300);
ok('tồn kho giảm về 0',
  db.prepare(`SELECT stock FROM rewards WHERE id = ?`).get(rewardId).stock, 0);

const outOfStock = await post(`/api/hoc/${token}/doi-qua`, { rewardId });
ok('hết hàng thì không đổi được nữa', outOfStock.ok, false);
ok('coin không bị trừ thêm',
  db.prepare(`SELECT coin FROM students WHERE id = ?`).get(studentId).coin, 200);

console.log('\n6. Cấp lại link thì mã cũ chết');
const newToken = randomBytes(16).toString('hex');
db.prepare(`UPDATE enrollments SET access_token = ? WHERE id = ?`).run(newToken, enrollmentId);
ok('mã cũ hết dùng được', (await get(`/api/hoc/${token}`)).ok, false);
ok('mã mới dùng được', (await get(`/api/hoc/${newToken}`)).ok, true);

// ------------------------------------------------------------------ dọn dẹp
// Xoá học viên trước: bản ghi đổi quà tham chiếu tới quà, xoá quà trước là
// vướng khoá ngoại — chính ràng buộc giữ cho lịch sử đổi quà không mồ côi.
db.prepare(`DELETE FROM students WHERE id = ?`).run(studentId);
db.prepare(`DELETE FROM rewards WHERE id = ?`).run(rewardId);

console.log(failures === 0
  ? '\nTẤT CẢ KHẲNG ĐỊNH ĐỀU ĐÚNG\n'
  : `\n${failures} KHẲNG ĐỊNH SAI\n`);
process.exit(failures === 0 ? 0 : 1);
