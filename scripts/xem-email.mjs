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
  ['07-ctv-email-da-co-ho-so', 'CTV — email đã có hồ sơ', T.affiliateDuplicateMail(env, {
    id: 'aff-1', name: 'Trần Hoàng Nam', email: 'nam@vidu.com', status: 'active',
  })],
  ['08-bai-da-duyet', 'Bài đã được duyệt', T.submissionReviewedMail(env, {
    submissionId: 's-1', lanDuyet: 1, day: 5, duyet: true,
    feedback: 'Phần mở đầu tới rồi, giữ nhịp này.\nLần sau thử thêm một câu hỏi ở cuối bài.',
    name: 'Nguyễn Thị Lan', email: 'lan@vidu.com', coin: 90, xp: 100, chuoi: 5,
  })],
  ['09-bai-can-sua', 'Bài cần sửa thêm', T.submissionReviewedMail(env, {
    submissionId: 's-2', lanDuyet: 1, day: 6, duyet: false,
    feedback: 'Phần mở đầu dài quá, cắt còn 2 câu.\nẢnh bìa chưa có chữ — thêm tiêu đề vào giúp em.',
    name: 'Nguyễn Thị Lan', email: 'lan@vidu.com',
  })],
  ['10-qua-da-duyet', 'Quà — đã duyệt gửi', T.rewardDecidedMail(env, {
    redemptionId: 'rd-1', rewardName: 'Bộ 100 Hook bản mở rộng', duyet: true,
    adminNote: null, hoanCoin: null, name: 'Nguyễn Thị Lan', email: 'lan@vidu.com',
  })],
  ['11-qua-bi-tu-choi', 'Quà — bị từ chối', T.rewardDecidedMail(env, {
    redemptionId: 'rd-2', rewardName: 'Coaching 1:1 với Thành 60 phút', duyet: false,
    adminNote: 'Suất tháng này đã hết. Anh chị giữ coin, tháng sau mở lại em báo ngay.',
    hoanCoin: 2500, name: 'Nguyễn Thị Lan', email: 'lan@vidu.com',
  })],
  ['12-nhac-chuoi-sap-dut', 'Nhắc — chuỗi sắp đứt', T.nhacNopBaiMail(env, {
    studentId: 'st-1', ngay: '2026-09-15', name: 'Nguyễn Thị Lan', email: 'lan@vidu.com',
    soNgayIm: 1, chuoiSapDut: true, chuoi: 7,
  })],
  ['13-nhac-da-im-vai-ngay', 'Nhắc — đã im vài ngày', T.nhacNopBaiMail(env, {
    studentId: 'st-1', ngay: '2026-09-18', name: 'Nguyễn Thị Lan', email: 'lan@vidu.com',
    soNgayIm: 3, chuoiSapDut: false, chuoi: 0,
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
