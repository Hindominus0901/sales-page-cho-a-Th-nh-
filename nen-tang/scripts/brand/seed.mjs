/**
 * Nap noi dung cua thuong hieu vao co so du lieu.
 *
 *   node scripts/brand/seed.mjs --local     (may cua ban)
 *   node scripts/brand/seed.mjs --remote    (ban that tren Cloudflare)
 *   node scripts/brand/seed.mjs --local --admin-email admin@example.com
 *
 * Vi sao la script chu khong phai migration:
 *
 * 1. Nhung hang nay quan tri vien SUA DUOC trong trang quan tri (ten cap bac,
 *    gia san pham, phan thuong). Migration se danh nhau voi ho: chay lai la de
 *    len thu ho vua sua, hoac khong chay va khong ai biet.
 * 2. Migration chay theo thu tu so va chi mot lan; noi dung thi doi lien tuc.
 *    Tron hai thu vao nhau la cach chac chan de mot ngay nao do khong ai dam
 *    chay migration nua.
 *
 * Moi lenh deu la UPSERT nen chay bao nhieu lan cung ra mot ket qua.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REMOTE = process.argv.includes('--remote');
const emailAdmin = (() => {
  const i = process.argv.indexOf('--admin-email');
  return i === -1 ? '' : (process.argv[i + 1] || '');
})();

/** Ten co so du lieu lay tu wrangler.jsonc, khong go lai lan thu hai. */
function tenDb() {
  const raw = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8')
    .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(raw).d1_databases?.[0]?.database_name || 'platform';
}

/** Nhay dau nhay don trong chuoi SQL. Khong dung cho du lieu tu nguoi la. */
const sq = (v) => `'${String(v).replace(/'/g, "''")}'`;

function dungSql(brand) {
  const { product, identity } = brand;
  const cauLenh = [];

  // 1. San pham dang ban. Truoc day nam trong migration 0006 voi gia viet cung.
  cauLenh.push(`INSERT INTO products (id, sku, name, kind, price, currency, grants_json, is_active, created_date, updated_date)
VALUES (${sq(`prod-${product.sku.toLowerCase()}`)}, ${sq(product.sku)}, ${sq(product.name)}, 'ticket',
        ${Number(product.price)}, 'VND', '[]', 1, datetime('now'), datetime('now'))
ON CONFLICT(sku) DO UPDATE SET
  name = excluded.name, price = excluded.price, updated_date = datetime('now');`);

  // 2. Ten hien thi cua tro ly AI trong trang quan tri.
  cauLenh.push(`UPDATE staff SET name = ${sq(`Trợ lý AI · ${identity.name}`)}, updated_date = datetime('now')
WHERE id = 'sf-ai';`);

  // 3. Tai khoan quan tri dau tien cho khu vuc thanh vien.
  //
  // Day la thu KHAC voi cong /admin (cong do dung ADMIN_PASSWORD_HASH). Thieu
  // hang nay thi khong ai vao duoc trang quan tri ben trong webapp, va trieu
  // chung la mot man hinh trong khong bao loi gi.
  if (emailAdmin) {
    cauLenh.push(`INSERT INTO users (id, email, full_name, role, status, email_verified, source, created_date, updated_date)
VALUES (${sq(`usr-admin-${brand.meta.slug}`)}, ${sq(emailAdmin)}, ${sq(`Quản trị ${identity.name}`)}, 'admin', 'active', 1, 'seed',
        datetime('now'), datetime('now'))
ON CONFLICT(email) DO UPDATE SET role = 'admin', status = 'active', updated_date = datetime('now');`);
  }

  // 4. Khoa hoc mien phi + cac ban ghi buoi hoc cua no.
  //
  // Mo cho MOI hoc vien: `requires_unlock = 0` va `min_level = 0`, nen no hien
  // trong tab Khoa hoc va ai dang nhap cung xem duoc, khong phai mua gi.
  //
  // Chi UPSERT chu khong xoa: quan tri vien doi ten bai hoac them bai ngay
  // trong trang quan tri, lan seed sau chi ghi de dung nhung gi brand.json
  // biet - khong quet sach cong cua ho.
  const khoa = brand.khoaMienPhi;
  const baiGiang = Array.isArray(khoa?.lessons) ? khoa.lessons : [];
  if (khoa && baiGiang.length) {
    const idKhoa = `course-${brand.meta.slug}-mien-phi`;
    cauLenh.push(`INSERT INTO courses (id, name, description, thumbnail_url, min_level, requires_unlock, is_active, sort_order, created_date, updated_date)
VALUES (${sq(idKhoa)}, ${sq(khoa.name)}, ${sq(khoa.description || '')}, '', 0, 0, 1, 0, datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  min_level = 0, requires_unlock = 0, is_active = 1,
  updated_date = datetime('now');`);

    baiGiang.forEach((bai, i) => {
      // Ma bai giang gan voi MA VIDEO chu khong phai thu tu: doi cho hai bai
      // trong brand.json khong duoc bien thanh "tao 8 bai moi va bo 8 bai cu" -
      // hoc vien se mat sach tien do da hoc.
      const idBai = `lesson-${brand.meta.slug}-${bai.id}`;
      cauLenh.push(`INSERT INTO lessons (id, course_id, title, guide, video_provider, video_id, duration, assignment_url, doc_url, xp, coin, sort_order, created_date, updated_date)
VALUES (${sq(idBai)}, ${sq(idKhoa)}, ${sq(bai.title)}, '', ${sq(bai.provider || 'wistia')}, ${sq(bai.id)},
        ${sq(bai.duration || '')}, '', '', 0, 0, ${i + 1}, datetime('now'), datetime('now'))
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, video_provider = excluded.video_provider,
  video_id = excluded.video_id, duration = excluded.duration,
  sort_order = excluded.sort_order, updated_date = datetime('now');`);
    });
  }

  return cauLenh.join('\n\n');
}

// --- chay ---------------------------------------------------------------------
let brand;
try {
  brand = loadBrand();
} catch (err) {
  console.error(`\n  ✗ ${err.message}\n`);
  process.exit(1);
}

const sql = dungSql(brand);

// Ghi ra file roi dung --file thay vi nhet vao --command: chuoi tieng Viet co
// dau va dau nhay don di qua dong lenh Windows/PowerShell la hong ky tu. Loi do
// rat kho thay - du lieu vao database sai chinh ta chu khong bao loi gi.
// Duong dan TUONG DOI chu khong tuyet doi: thu muc goc cua du an co the co dau
// cach ("C:\website cho chi Thanh"); di qua shell cua Windows la tham so bi vo
// lam doi, va wrangler bao "You must provide either --command or --file" - nghe
// nhu minh quen truyen tham so, that ra la duong dan bi cat lam doi.
const tam = path.join(ROOT, '.wrangler', 'tmp');
fs.mkdirSync(tam, { recursive: true });
const fileSql = path.join(tam, `brand-seed-${Date.now()}.sql`);
const fileSqlTuongDoi = path.relative(ROOT, fileSql).split(path.sep).join('/');
fs.writeFileSync(fileSql, `${sql}\n`, 'utf8');

const args = ['wrangler', 'd1', 'execute', tenDb(), REMOTE ? '--remote' : '--local', '--file', fileSqlTuongDoi];
if (REMOTE) args.push('--yes');

console.log(`  Nap noi dung thuong hieu "${brand.identity.name}" vao ${REMOTE ? 'ban THAT' : 'may cua ban'}...`);
const r = spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit', shell: true });
fs.unlinkSync(fileSql);

if (r.status !== 0) {
  console.error('\n  ✗ Nap khong xong. Da chay migration chua? (npm run db:migrate)\n');
  process.exit(1);
}
const soBanGhi = Array.isArray(brand.khoaMienPhi?.lessons) ? brand.khoaMienPhi.lessons.length : 0;
if (soBanGhi) {
  console.log(`  ✓ Khoa mien phi: ${soBanGhi} ban ghi (hien trong tab Khoa hoc, mo cho moi hoc vien)`);
}
console.log(`\n  ✓ Xong: san pham ${brand.product.sku} · ${new Intl.NumberFormat(brand.meta.locale).format(brand.product.price)}${brand.meta.currencySuffix}`
  + (emailAdmin ? `\n  ✓ Tai khoan quan tri: ${emailAdmin}` : '\n  (chua tao tai khoan quan tri - them --admin-email de tao)'));
