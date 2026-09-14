/**
 * Dung ha tang Cloudflare lan dau cho mot tai khoan.
 *
 *   node scripts/setup-cloudflare.mjs
 *
 * Lam bon viec:
 *   1. Tao co so du lieu D1, kho KV, thung R2 (bo qua neu da co)
 *   2. Ghi ma cua chung vao wrangler.jsonc
 *   3. Chay toan bo migration len co so du lieu that
 *   4. In ra danh sach bi mat con thieu, kem lenh dat tung cai
 *
 * Chay lai duoc nhieu lan: da co gi thi bo qua cai do.
 *
 * Can CLOUDFLARE_ACCOUNT_ID va CLOUDFLARE_API_TOKEN trong .env, va token phai
 * co quyen GHI (Edit) cho Workers, D1, KV, R2 - khong phai chi Read.
 */
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'wrangler.jsonc');

// Ten tai nguyen suy tu brand/brand.json, khong viet cung ten cua mot khach.
const BRAND = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand/brand.json'), 'utf8'));
const TEN_WORKER = BRAND.domains.workerName;
const D1_NAME = 'platform';
const KV_NAME = 'CACHE';
const R2_NAME = `${TEN_WORKER}-uploads`;

function readEnvFile() {
  const file = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const dotenv = readEnvFile();
const env = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: dotenv.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN: dotenv.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN,
};

if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
  console.error('Thieu CLOUDFLARE_ACCOUNT_ID hoac CLOUDFLARE_API_TOKEN trong .env');
  process.exit(1);
}

/** @returns {{ok:boolean, out:string}} */
function wrangler(args, { quiet = false } = {}) {
  try {
    // Dung execSync + chuoi lenh thay vi execFileSync: tren Windows ten that
    // cua npx khac nhau tuy shell (npx / npx.cmd), de goi hut.
    const out = execSync(`npx wrangler ${args.join(' ')}`, {
      cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`;
    if (!quiet) console.error(out.split('\n').filter((l) => /error/i.test(l)).join('\n'));
    return { ok: false, out };
  }
}

const step = (msg) => console.log(`\n▸ ${msg}`);

// --- 1. Kiem tra quyen truoc, de bao loi som va ro ------------------------------
step('Kiem tra tai khoan va quyen cua token');
const who = wrangler(['whoami']);
if (!who.ok) {
  console.error('Khong ket noi duoc Cloudflare. Kiem tra lai CLOUDFLARE_API_TOKEN.');
  process.exit(1);
}
const accountLine = who.out.split('\n').find((l) => l.includes(env.CLOUDFLARE_ACCOUNT_ID));
console.log(`  Tai khoan: ${(accountLine || '').trim() || env.CLOUDFLARE_ACCOUNT_ID}`);

const probe = wrangler(['d1', 'list'], { quiet: true });
if (!probe.ok && /Authentication error/i.test(probe.out)) {
  console.error('\n✗ Token khong co quyen doc D1.');
  console.error('  Tao token moi voi cac quyen (cot cuoi phai la Edit, khong phai Read):');
  console.error('    Account · Workers Scripts     · Edit');
  console.error('    Account · D1                  · Edit');
  console.error('    Account · Workers KV Storage  · Edit');
  console.error('    Account · Workers R2 Storage  · Edit');
  console.error('    Account · Account Settings    · Read');
  console.error('    User    · Memberships         · Read');
  process.exit(1);
}

// --- 2. Tao tai nguyen ---------------------------------------------------------
let config = fs.readFileSync(WRANGLER, 'utf8');

step(`Co so du lieu D1 "${D1_NAME}"`);
const d1List = wrangler(['d1', 'list', '--json'], { quiet: true });
let d1Id = null;
try {
  const start = d1List.out.indexOf('[');
  if (start !== -1) {
    const found = JSON.parse(d1List.out.slice(start)).find((d) => d.name === D1_NAME);
    if (found) d1Id = found.uuid || found.database_id;
  }
} catch { /* danh sach rong hoac khong doc duoc -> tao moi */ }

if (d1Id) {
  console.log(`  da co (${d1Id})`);
} else {
  const created = wrangler(['d1', 'create', D1_NAME]);
  const m = created.out.match(/"database_id":\s*"([0-9a-f-]{36})"/i)
    || created.out.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!m) {
    console.error('  ✗ Khong tao duoc D1. Token co thieu quyen "D1 · Edit" khong?');
    process.exit(1);
  }
  d1Id = m[1];
  console.log(`  da tao (${d1Id})`);
}
config = config
  .replace(/"database_name":\s*"[^"]*"/, `"database_name": "${D1_NAME}"`)
  .replace(/"database_id":\s*"[^"]*"/, `"database_id": "${d1Id}"`);

step(`Kho KV "${KV_NAME}"`);
const kvList = wrangler(['kv', 'namespace', 'list'], { quiet: true });
let kvId = null;
try {
  const start = kvList.out.indexOf('[');
  if (start !== -1) {
    const found = JSON.parse(kvList.out.slice(start))
      .find((n) => n.title === KV_NAME || String(n.title).endsWith(`-${KV_NAME}`));
    if (found) kvId = found.id;
  }
} catch { /* tao moi */ }

if (kvId) {
  console.log(`  da co (${kvId})`);
} else {
  const created = wrangler(['kv', 'namespace', 'create', KV_NAME]);
  const m = created.out.match(/"id":\s*"([0-9a-f]{32})"/i);
  if (!m) {
    console.error('  ✗ Khong tao duoc KV. Token co thieu quyen "Workers KV Storage · Edit" khong?');
    process.exit(1);
  }
  kvId = m[1];
  console.log(`  da tao (${kvId})`);
}
config = config.replace(/\{\s*"binding":\s*"CACHE",\s*"id":\s*"[^"]*"\s*\}/,
  `{ "binding": "CACHE", "id": "${kvId}" }`);

step(`Thung R2 "${R2_NAME}"`);
const r2 = wrangler(['r2', 'bucket', 'create', R2_NAME], { quiet: true });
if (r2.ok) console.log('  da tao');
else if (/already exists|10004/i.test(r2.out)) console.log('  da co');
else {
  // Loi nhan cu noi "chua dung toi - giai doan sau", nghe nhu bo qua duoc.
  // KHONG bo qua duoc: wrangler.jsonc co khai binding UPLOADS tro toi thung
  // nay, ma Cloudflare kiem binding luc deploy - thung khong ton tai thi
  // `npm run deploy` HONG, khong phai "de sau".
  console.log('  ⚠ CHUA TAO DUOC. R2 thuong phai bat trong dashboard truoc'
    + ' (Storage & databases -> R2, can them phuong thuc thanh toan).');
  console.log('    Deploy se HONG vi wrangler.jsonc dang khai binding UPLOADS.');
  console.log('    Hai duong: bat R2 roi chay lai lenh nay, HOAC xoa khoi');
  console.log('    "r2_buckets" trong wrangler.jsonc (hoc vien se khong tai');
  console.log('    anh len duoc, moi thu khac van chay).');
  console.log('    Chi tiet loi: ' + String(r2.out).trim().split('\n').slice(-2).join(' ').slice(0, 200));
}

fs.writeFileSync(WRANGLER, config);
console.log('\n  wrangler.jsonc da cap nhat ma tai nguyen');

// --- 3. Migration --------------------------------------------------------------
step('Chay migration len co so du lieu that');
const migrate = wrangler(['d1', 'migrations', 'apply', D1_NAME, '--remote']);
if (!migrate.ok) {
  console.error('  ✗ Migration that bai');
  process.exit(1);
}
console.log(migrate.out.split('\n').filter((l) => /✅|Executed|No migrations/.test(l)).join('\n'));

// --- 4. Bi mat con thieu -------------------------------------------------------
step('Bi mat can dat');
const NEEDED = [
  ['ADMIN_PASSWORD_HASH', 'Mat khau trang quan tri. Sinh bang: npm run hash-password "mat khau"'],
  ['SESSION_SECRET', 'Khoa ky cookie phien. Dat mot chuoi ngau nhien dai.'],
  ['OTP_PEPPER', 'Tron vao ma OTP truoc khi bam. Chuoi ngau nhien dai.'],
  ['BANK_WEBHOOK_SECRET', 'Trung voi cau hinh ben SePay. De trong = tu choi moi webhook.'],
  ['RESEND_API_KEY', 'Gui email xac thuc. Thieu thi khong ai dang ky duoc.'],
  // worker/src/mail/kit.js doc bien nay nhung truoc day no khong nam trong danh
  // sach - nen chuoi email tu dong im lang khong chay ma khong bao gi.
  ['KIT_API_KEY', 'Kit (ConvertKit) gan the va chuoi email tu dong (khong bat buoc).'],
  ['GOOGLE_CLIENT_ID', 'Dang nhap bang Google (khong bat buoc).'],
  ['GOOGLE_CLIENT_SECRET', 'Dang nhap bang Google (khong bat buoc).'],
  ['ANTHROPIC_API_KEY', 'AI cham bai theo rubric (khong bat buoc).'],
  ['ADMIN_SERVICE_TOKEN', 'Token cho script/CI (khong bat buoc).'],
];

const existing = wrangler(['secret', 'list'], { quiet: true });
const have = new Set();
try {
  const start = existing.out.indexOf('[');
  if (start !== -1) for (const s of JSON.parse(existing.out.slice(start))) have.add(s.name);
} catch { /* chua co bi mat nao */ }

const missing = NEEDED.filter(([name]) => !have.has(name));

/**
 * Bi mat TU SINH duoc: khong ai can biet gia tri, chi can no dai va ngau nhien.
 * Bat nguoi dung tu nghi ra mot chuoi "ngau nhien" la cach chac chan de co mot
 * SESSION_SECRET la "abc123" tren mot he thong that.
 */
const TU_SINH = new Set(['SESSION_SECRET', 'OTP_PEPPER', 'ADMIN_SERVICE_TOKEN']);

const canDien = [];
const tuSinh = {};
for (const [name, note] of missing) {
  if (TU_SINH.has(name)) tuSinh[name] = randomBytes(32).toString('base64url');
  else if (dotenv[name]) tuSinh[name] = dotenv[name];   // da co san trong .env
  else canDien.push([name, note]);
}

if (Object.keys(tuSinh).length) {
  step('Nap bi mat');
  // `wrangler secret bulk` doc JSON tu stdin: khong file tam, khong lot vao
  // lich su shell, khong hien trong danh sach tien trinh.
  const r = spawnSync('npx', ['wrangler', 'secret', 'bulk', '-'], {
    cwd: ROOT, env, shell: true, input: JSON.stringify(tuSinh), stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (r.status === 0) {
    console.log(`  ✓ da nap ${Object.keys(tuSinh).length} bi mat: ${Object.keys(tuSinh).join(', ')}`);
  } else {
    // Loi 10007 = Worker chua ton tai. Tren tai khoan moi tinh, KHONG THE dat bi
    // mat truoc lan deploy dau tien - phai deploy mot lan roi quay lai.
    console.log('  ⚠ chua nap duoc. Neu bao "workers.api.error.script_not_found" (10007)');
    console.log('    thi Worker chua ton tai: chay `npm run deploy` mot lan roi chay lai lenh nay.');
  }
}

if (canDien.length) {
  step('Bi mat phai tu dien (lay tu ben thu ba)');
  console.log('  Chay tung lenh sau roi dan gia tri vao:\n');
  for (const [name, note] of canDien) {
    console.log(`    npx wrangler secret put ${name}`);
    console.log(`      # ${note}`);
  }
} else if (!Object.keys(tuSinh).length) {
  console.log('  Da co du.');
}

// --- 5. Nhac nhung viec con lai -------------------------------------------------
step('Con lai');
console.log('  1. npm run brand:seed -- --remote --admin-email <email cua ban>');
console.log('  2. npm run deploy');
console.log('  3. Kiem tra: mo trang ban hang, dien form, tao don, VA QUET THU MA QR');
console.log('     - phai ra dung so tai khoan cua ban.\n');
