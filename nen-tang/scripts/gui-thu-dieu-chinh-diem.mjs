/**
 * Gui thu "dieu chinh thang diem" cho hoc vien qua Resend.
 *
 *   node scripts/gui-thu-dieu-chinh-diem.mjs                  # CHAY THU, khong gui
 *   node scripts/gui-thu-dieu-chinh-diem.mjs --chi a@b.com    # gui thu mot dia chi
 *   node scripts/gui-thu-dieu-chinh-diem.mjs --that           # GUI THAT cho ca lop
 *
 * VI SAO RESEND CHU KHONG PHAI KIT: khoa API cua Kit doc duoc nhung khong tao
 * duoc broadcast (POST /broadcasts -> 403), va do la quyen ben tai khoan Kit.
 *
 * VI SAO GUI DUOC 633 THU MA KHONG HONG NHU LAN TRUOC. Doc lai bang emails_sent
 * thi thay ro hai loai loi khac han nhau:
 *     06-08/09   111 loi  "reached your daily email sending quota"   (goi mien phi)
 *     09/09       10 loi  "only 10 requests per second"              (gui qua nhanh)
 * Ngay 09/09 da gui 573 thu MOT NGAY va khong con loi han muc nao - tuc la goi
 * da duoc nang, tran ngay khong con la rao can. Rao can duy nhat con lai la 10
 * request mot giay. Nen o day dung endpoint GUI THEO LO (100 thu mot lan goi):
 * 633 nguoi chi ton 7 lan goi, cach nhau mot nhip - xa tran rat nhieu.
 *
 * CHONG GUI TRUNG: moi nguoi mot khoa co dinh trong emails_sent. Chay lai script
 * khong gui lai cho ai da nhan, ke ca khi dut mang giua chung.
 *
 * KHONG BIA LINK HUY DANG KY. He thong chua co duong huy that; dat mot link gia
 * vao chan thu con te hon la khong co. Chan thu noi thang: khong muon nhan nua
 * thi nhan cho Thanh qua Zalo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { dieuChinhDiem } from './kit-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const layCo = (t) => { const i = args.indexOf(`--${t}`); return i >= 0 ? args[i + 1] : null; };
const THAT = args.includes('--that');
const CHI = layCo('chi') || '';
const conLai = layCo('con-lai') || 'Ngày 04 và Ngày 05';

const ENV = {};
for (const raw of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) ENV[m[1]] = m[2].trim();
}
const KHOA = ENV.RESEND_API_KEY || '';
const FROM = ENV.MAIL_FROM || '';
const ZALO = ENV.ZALO_GROUP_URL || ENV.ZALO_URL || '';
const APP = (ENV.APP_ORIGIN || '').replace(/\/$/, '');
const TEN_CHUONG_TRINH = ENV.BRAND_PRODUCT_LINE || ENV.BRAND_NAME || '';
if (!KHOA) { console.error('Thieu RESEND_API_KEY trong .env'); process.exit(1); }
if (!FROM) { console.error('Thieu MAIL_FROM trong .env'); process.exit(1); }

function sql(cau) {
  const mot = String(cau).replace(/\s+/g, ' ').trim();
  const ra = execFileSync(process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'platform', '--remote',
      '--json', '--command', mot],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const i = ra.indexOf('[');
  if (i < 0) throw new Error(`D1 khong tra ve gi: ${ra.slice(0, 300)}`);
  return JSON.parse(ra.slice(i))[0]?.results || [];
}
const esc = (v) => String(v).replace(/'/g, "''");

// ------------------------------------------------------------- than thu HTML
const KHUNG = fs.readFileSync(path.join(ROOT, 'thu-dieu-chinh-diem.html'), 'utf8');
const e = dieuChinhDiem({ conLai });

/** Ten goi: lay chu dau cua ho ten, khong co thi goi "ban". */
const tenGoi = (hoTen) => {
  const t = String(hoTen || '').trim().split(/\s+/).filter(Boolean);
  return t.length ? t[t.length - 1] : 'bạn';
};

function thanThu(nguoi) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${e.subject}</title></head>`
    + `<body style="margin:0;padding:0;background:#000000">`
    + KHUNG
      // Kit thay hai the nay luc gui; Resend thi khong, nen phai tu thay.
      // Bo sot mot the la hoc vien nhan duoc thu co chu "{{ ... }}" tho lo.
      .replace(/\{\{\s*subscriber\.first_name[^}]*\}\}/g, tenGoi(nguoi.full_name))
      .replace(/<em><strong style="font-weight:bolder">\{\{\s*unsubscribe_link\s*\}\}<\/strong><\/em>/g,
        ZALO ? `<a href="${ZALO}" style="color:#686565">Nhắn cho Thanh qua Zalo</a>` : 'Nhắn cho Thanh là được.')
      .replace(/\{\{\s*unsubscribe_link\s*\}\}/g, '')
    + `</body></html>`;
}

const banRo = (nguoi) => [
  `Chào ${tenGoi(nguoi.full_name)},`, '',
  'Đi được nửa chặng, Thanh nhìn lại bảng xếp hạng và thấy nó chưa phản ánh đúng',
  'công sức mọi người bỏ ra. Từ hôm nay Thanh cân lại các mốc điểm cho gần nhau',
  'hơn, và điểm đã cộng trước đây cũng được tính lại theo cách mới.',
  '',
  `Còn ${conLai}. Khoảng cách trên bảng giờ sát hơn nhiều.`,
  '', APP ? `Xem bảng xếp hạng: ${APP}` : '', '',
  `Bạn nhận thư này vì đang tham gia ${TEN_CHUONG_TRINH}.`,
].filter((x) => x !== undefined).join('\n');

// ---------------------------------------------------------------- nguoi nhan
let nguoiNhan;
if (CHI) {
  nguoiNhan = sql(`SELECT id, email, full_name FROM users WHERE lower(email) = '${esc(CHI.toLowerCase())}'`);
  if (!nguoiNhan.length) nguoiNhan = [{ id: `ngoai-${CHI}`, email: CHI, full_name: '' }];
} else {
  nguoiNhan = sql(`SELECT id, email, full_name FROM users
     WHERE status = 'active' AND email IS NOT NULL AND email <> ''
       AND email NOT LIKE '%@smoketest.local'
     ORDER BY created_date`);
}

const KHOA_THU = (u) => `dieu-chinh-diem-2026-09-12-${u.id}`;

// Bo nhung nguoi DA nhan roi (chay lai khong gui hai lan).
const daNhan = new Set(
  sql(`SELECT idempotency_key k FROM emails_sent WHERE idempotency_key LIKE 'dieu-chinh-diem-2026-09-12-%'`)
    .map((r) => r.k),
);
const conLaiNhan = nguoiNhan.filter((u) => !daNhan.has(KHOA_THU(u)));

console.log(`\nThu: "${e.subject}"`);
console.log(`  nguoi nhan   : ${nguoiNhan.length}`);
console.log(`  da nhan truoc: ${nguoiNhan.length - conLaiNhan.length}`);
console.log(`  se gui       : ${conLaiNhan.length}`);
console.log(`  gui tu       : ${FROM}`);

if (!THAT && !CHI) {
  console.log('\n  CHAY THU - khong goi Resend, khong ai nhan duoc gi.');
  console.log('  Vai dia chi dau tien:');
  for (const u of conLaiNhan.slice(0, 5)) console.log(`    ${u.email}  (${tenGoi(u.full_name)})`);
  console.log('\n  Them --that de gui that.\n');
  process.exit(0);
}

// -------------------------------------------------------------------- gui
const LO = 100;
const nghi = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0; let loi = 0;

for (let i = 0; i < conLaiNhan.length; i += LO) {
  const lo = conLaiNhan.slice(i, i + LO);

  // Ghi so TRUOC khi goi, giong sendMail() trong worker: neu dut mang giua
  // chung thi lan chay sau biet ai da duoc dua di roi.
  for (const u of lo) {
    try {
      sql(`INSERT INTO emails_sent (id, to_addr, template, idempotency_key, status, created_at)
           VALUES ('${esc(crypto.randomUUID())}','${esc(u.email)}','dieu-chinh-diem','${esc(KHOA_THU(u))}','queued',datetime('now'))`);
    } catch { /* da co roi */ }
  }

  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KHOA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(lo.map((u) => ({
      from: FROM, to: [u.email], subject: e.subject, html: thanThu(u), text: banRo(u),
    }))),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    loi += lo.length;
    console.log(`  lo ${i / LO + 1}: LOI ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    for (const u of lo) {
      sql(`UPDATE emails_sent SET status='failed', error='${esc(String(res.status))}' WHERE idempotency_key='${esc(KHOA_THU(u))}'`);
    }
  } else {
    ok += lo.length;
    console.log(`  lo ${i / LO + 1}: da gui ${lo.length}`);
    for (const u of lo) {
      sql(`UPDATE emails_sent SET status='sent', sent_at=datetime('now') WHERE idempotency_key='${esc(KHOA_THU(u))}'`);
    }
  }

  if (i + LO < conLaiNhan.length) await nghi(1500);
}

console.log(`\nXong: ${ok} da gui, ${loi} loi.\n`);
