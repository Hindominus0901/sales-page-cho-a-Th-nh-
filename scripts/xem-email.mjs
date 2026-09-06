/**
 * Dựng mọi mẫu email ra file để XEM, không gửi đi đâu cả.
 *
 *     node scripts/xem-email.mjs
 *
 * Vì sao cần: thư "đường link vào lớp" là thứ DUY NHẤT chuyển mã truy cập tới
 * tay học viên đã trả tiền. Một lỗi chữ hay một link hỏng trong đó không lộ ra
 * ở bất kỳ bài kiểm nào — bộ kiểm chỉ khẳng định thư CÓ vào hàng đợi và link
 * KHỚP database, không ai nhìn nó trông ra sao.
 *
 * Không cần mạng, không cần khoá Resend. Các hàm mẫu thư là hàm thuần: chúng
 * chỉ đọc PUBLIC_BASE_URL từ env, nên truyền một object giả là đủ.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const RA = 'public/.xem-thu';
const TAM = '.xem-thu-templates.mjs';

// esbuild gộp templates.ts thành một file .mjs chạy được bằng node.
await build({
  entryPoints: ['src/lib/email/templates.ts'],
  outfile: TAM,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
});

const T = await import(pathToFileURL(TAM).href);
rmSync(TAM, { force: true });

// env giả. Đúng bằng những gì mẫu thư thật sự đọc.
const env = { PUBLIC_BASE_URL: 'https://manhthanh.net' };

const MA_HOC = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const MA_DAT_LAI = 'K7x2QmZ9-vLp4WdT8nRbY3sFhJ6aCgE0';

const mau = [
  ['01-xac-nhan-thanh-toan', 'Xác nhận thanh toán', T.orderPaidMail(env, {
    id: 'o-1', code: 'GC7K2M9Q', name: 'Nguyễn Thị Bình',
    email: 'binh@vidu.com', amount: 2000000,
  })],
  ['02-link-vao-lop', 'Đường link vào lớp', T.studentAccessMail(env, {
    orderId: 'o-1', name: 'Nguyễn Thị Bình',
    email: 'binh@vidu.com', token: MA_HOC,
  })],
  ['03-dat-lai-mat-khau', 'Đặt lại mật khẩu', T.passwordResetMail(env, {
    resetId: 'r-1', token: MA_DAT_LAI, subjectType: 'student',
    email: 'binh@vidu.com', name: 'Nguyễn Thị Bình',
  })],
  ['04-dang-ky-workshop', 'Xác nhận đăng ký workshop', T.workshopMail(env, {
    id: 'ws-1:84912345678', name: 'Lê Thị Hoa', email: 'hoa@vidu.com',
    sessionTitle: 'Workshop mở kênh từ số 0',
    whenText: '20:00 08/09/2026',
    zoomUrl: 'https://zoom.us/j/9876543210',
    zaloUrl: 'https://zalo.me/g/abcxyz',
  })],
  ['05-ctv-da-nhan-ho-so', 'CTV — đã nhận hồ sơ', T.affiliateApplicationMail(env, {
    id: 'aff-1', name: 'Trần Hoàng Nam', email: 'nam@vidu.com',
  })],
  ['06-ctv-da-duyet', 'CTV — đã được duyệt', T.affiliateApprovedMail(env, {
    resetId: 'r-2', token: MA_DAT_LAI, name: 'Trần Hoàng Nam',
    email: 'nam@vidu.com', code: 'HOANGNAM',
  })],
];

rmSync(RA, { recursive: true, force: true });
mkdirSync(RA, { recursive: true });

console.log('');
for (const [ten, nhan, mail] of mau) {
  if (!mail) { console.log(`  ⚠ ${nhan}: hàm trả null — bỏ qua`); continue; }
  writeFileSync(`${RA}/${ten}.html`, mail.html, 'utf8');
  writeFileSync(`${RA}/${ten}.txt`,
    `Tới:      ${mail.toName} <${mail.toEmail}>\n`
    + `Tiêu đề:  ${mail.subject}\n`
    + `Mẫu:      ${mail.template}\n`
    + `${'─'.repeat(64)}\n\n${mail.text}\n`, 'utf8');
  console.log(`  ✓ ${nhan.padEnd(28)} ${ten}.html`);
}

console.log(`\nMở bằng trình duyệt: ${RA}/\n`);
