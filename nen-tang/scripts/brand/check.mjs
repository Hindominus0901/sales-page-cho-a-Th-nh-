/**
 * Quet ca cay tim dau vet cua khach cu.
 *
 *   node scripts/brand/check.mjs                 (hoac: npm run brand:check)
 *   node scripts/brand/check.mjs --git           quet ca LICH SU git
 *   node scripts/brand/check.mjs --strict        kiem luon file sinh ra co bi
 *                                                sua tay khong
 *
 * Chay truoc moi lan build va moi lan deploy. Con mot chuoi trong danh sach cam
 * la thoat voi ma loi - de khong ai deploy nham mot ban con mang ten khach.
 *
 * Vi sao co --git: xoa file o commit moi KHONG xoa no khoi lich su. Ban template
 * ban ra ngoai phai co lich su rieng; `--git` la cach chung minh dieu do, khong
 * phai niem tin.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUET_GIT = process.argv.includes('--git');
const NGHIEM = process.argv.includes('--strict');

const dsCam = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand/denylist.json'), 'utf8'));
const mau = dsCam.mau.map((m) => ({ ...m, rx: new RegExp(m.re, 'gi') }));
const boQua = new Set(dsCam.boQua);

const NHI_PHAN = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.db', '.sqlite', '.woff', '.woff2', '.ttf', '.mp4']);

function* moiFile(thuMuc) {
  for (const ten of fs.readdirSync(thuMuc)) {
    const duong = path.join(thuMuc, ten);
    const tuongDoi = path.relative(ROOT, duong).split(path.sep).join('/');
    if (boQua.has(ten) || boQua.has(tuongDoi)) continue;
    const st = fs.statSync(duong);
    if (st.isDirectory()) { yield* moiFile(duong); continue; }
    if (NHI_PHAN.has(path.extname(ten).toLowerCase())) continue;
    if (st.size > 8 * 1024 * 1024) continue;
    yield { duong, tuongDoi };
  }
}

const dinh = [];

for (const { duong, tuongDoi } of moiFile(ROOT)) {
  let noiDung;
  try { noiDung = fs.readFileSync(duong, 'utf8'); } catch { continue; }
  for (const m of mau) {
    m.rx.lastIndex = 0;
    const khop = noiDung.match(m.rx);
    if (khop) dinh.push({ file: tuongDoi, vi: m.vi, mau: m.re, so: khop.length, viDu: khop[0] });
  }
}

if (QUET_GIT) {
  // Loai tru dung nhung file ma ban quet cay lam viec cung loai tru - neu khong
  // thi chinh brand/denylist.json (file LIET KE cac chuoi cam) se bi bat, va bao
  // cao "con 15 dau vet" trong khi tat ca deu la ban thanh danh sach cam.
  const loaiTru = [...boQua].map((t) => `:(exclude)${t}`);
  const r = spawnSync('git', ['log', '--all', '-p', '--no-color', '--', '.', ...loaiTru],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const vanBan = r.stdout || '';
  for (const m of mau) {
    m.rx.lastIndex = 0;
    const khop = vanBan.match(m.rx);
    if (khop) dinh.push({ file: '(LICH SU GIT)', vi: m.vi, mau: m.re, so: khop.length, viDu: khop[0] });
  }
}

if (NHIEM_VU_SINH()) { /* xem ham ben duoi */ }

/** So sanh file sinh ra voi ban ma apply.mjs se sinh ra ngay bay gio. */
function NHIEM_VU_SINH() {
  if (!NGHIEM) return false;
  const r = spawnSync('node', ['scripts/brand/apply.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    dinh.push({ file: '(FILE SINH RA)', vi: 'co nguoi sua tay vung duoc sinh tu brand.json', mau: '--strict', so: 1, viDu: '' });
  }
  return false;
}

if (!dinh.length) {
  console.log(`  ✓ sach - khong con dau vet nao trong ${QUET_GIT ? 'cay lam viec VA lich su git' : 'cay lam viec'}`);
  if (!QUET_GIT) console.log('    (them --git de quet ca lich su, --strict de kiem file sinh ra)');
  process.exit(0);
}

console.error(`\n  ✗ Con ${dinh.length} cho mang dau vet cua thuong hieu cu:\n`);
const theoFile = new Map();
for (const d of dinh) {
  if (!theoFile.has(d.file)) theoFile.set(d.file, []);
  theoFile.get(d.file).push(d);
}
for (const [file, ds] of theoFile) {
  console.error(`  ${file}`);
  for (const d of ds) console.error(`      ${d.vi} · ${d.so} lan · vi du: ${JSON.stringify(d.viDu)}`);
}
console.error('\n  Sua xong chay lai. Neu mot mau bat nham (vi du chu "thanh toan"),');
console.error('  sua bieu thuc trong brand/denylist.json cho co neo chat hon.\n');
process.exit(1);
