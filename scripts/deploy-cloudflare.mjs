/**
 * Dựng hạ tầng Cloudflare và deploy bằng một câu lệnh.
 *
 *   npm run cf:preview        →  goc-creator-preview.workers.dev
 *   npm run cf:prod           →  goc-creator.workers.dev
 *
 * Chạy lại được nhiều lần: tài nguyên đã có thì dùng lại, khoá bí mật đã đặt
 * thì KHÔNG sinh lại (sinh lại SESSION_SECRET là đá văng mọi người đang đăng
 * nhập), dữ liệu đã có thì không seed đè.
 *
 * Cần trước: Node 20+, và `npx wrangler login` một lần.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const ENV = arg('env', 'preview');
const DRY = argv.includes('--dry-run');

if (!['preview', 'production'].includes(ENV)) {
  fatal(`Môi trường không hợp lệ: ${ENV}. Chỉ nhận "preview" hoặc "production".`);
}

const NAMES = {
  preview:    { d1: 'goc-creator-preview', r2: 'goc-creator-media-preview' },
  production: { d1: 'goc-creator-prod',    r2: 'goc-creator-media' },
}[ENV];

let step = 0;
const heading = (t) => console.log(`\n[${++step}] ${t}\n${'─'.repeat(72)}`);
const say  = (t) => console.log('    ' + t);
const done = (t) => console.log('  ✓ ' + t);
function fatal(msg, hint) {
  console.error(`\n✗ ${msg}`);
  if (hint) console.error(`\n  ${hint}`);
  console.error('');
  process.exit(1);
}

/** Chạy wrangler, trả về stdout. Lỗi thì ném — nơi gọi tự quyết xử lý thế nào. */
function wr(args, { quiet = true } = {}) {
  const res = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (res.status !== 0) {
    const err = new Error((res.stderr || res.stdout || '').trim() || `wrangler ${args[0]} lỗi`);
    err.stdout = res.stdout;
    throw err;
  }
  return res.stdout ?? '';
}

/** Wrangler in kèm banner quảng cáo bản mới; chỉ lấy đoạn JSON bên trong. */
function json(out) {
  const s = out.indexOf('['), sObj = out.indexOf('{');
  const start = s >= 0 && (sObj < 0 || s < sObj) ? s : sObj;
  if (start < 0) throw new Error('không tìm thấy JSON trong output của wrangler');
  const end = out[start] === '[' ? out.lastIndexOf(']') : out.lastIndexOf('}');
  return JSON.parse(out.slice(start, end + 1));
}

// ═══════════════════════════════════════════════ 1. Kiểm tra tiền đề

heading('Kiểm tra tiền đề');

if (Number(process.versions.node.split('.')[0]) < 20) {
  fatal(`Cần Node 20 trở lên, đang chạy ${process.versions.node}.`);
}
done(`Node ${process.versions.node}`);

let account;
try {
  const who = wr(['whoami']);
  if (/not authenticated/i.test(who)) throw new Error('chưa đăng nhập');
  account = (who.match(/([\w .@-]+)\s*\|\s*([0-9a-f]{32})/) ?? [])[0] ?? 'đã đăng nhập';
} catch (err) {
  const msg = String(err.message ?? '');
  // Phân biệt "chưa đăng nhập" với "không ra được internet". Hai thứ này chữa
  // theo hai cách hoàn toàn khác nhau, gộp lại thì người chạy loay hoay đăng
  // nhập lại mãi trong khi vấn đề nằm ở mạng.
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|403|proxy/i.test(msg)) {
    fatal('Không kết nối được tới api.cloudflare.com.',
      'Máy đang chặn hoặc proxy không cho ra ngoài. Kiểm tra mạng/VPN rồi chạy lại.\n' +
      `  Chi tiết: ${msg.split('\n')[0]}`);
  }
  fatal('Wrangler chưa đăng nhập Cloudflare.',
    'Chạy `npx wrangler login` (mở trình duyệt, bấm Allow), rồi chạy lại lệnh này.');
}
done(`Cloudflare: ${account}`);
say(`Sẽ deploy lên môi trường: ${ENV}`);

// ═══════════════════════════════════════════════ 2. Tài nguyên

heading('D1, KV, R2');

// ---- D1: tra theo tên, tên là thứ mình đặt nên tra chính xác được.
let dbId;
const dbs = json(wr(['d1', 'list', '--json']));
const found = dbs.find((d) => d.name === NAMES.d1);
if (found) {
  dbId = found.uuid ?? found.database_id;
  done(`D1 ${NAMES.d1} đã có sẵn`);
} else if (DRY) {
  dbId = '(sẽ tạo)';
  say(`D1 ${NAMES.d1} chưa có — sẽ tạo`);
} else {
  wr(['d1', 'create', NAMES.d1]);
  const again = json(wr(['d1', 'list', '--json']));
  const made = again.find((d) => d.name === NAMES.d1);
  if (!made) fatal(`Tạo D1 ${NAMES.d1} xong nhưng không thấy trong danh sách.`);
  dbId = made.uuid ?? made.database_id;
  done(`Đã tạo D1 ${NAMES.d1}`);
}

// ---- KV: wrangler tự đặt tên namespace theo quy tắc riêng và quy tắc đó đổi
// theo phiên bản. Nên không đoán tên: chụp danh sách trước, tạo, rồi so lại để
// biết chính xác cái nào vừa sinh ra.
let kvId;
const kvList = () => json(wr(['kv', 'namespace', 'list']));
const kvMatch = (list) => list.filter((n) =>
  n.title.includes('goc-creator') && /CACHE/i.test(n.title) &&
  (ENV === 'production' ? !/preview/i.test(n.title) : /preview/i.test(n.title)));

const before = kvList();
const already = kvMatch(before);
if (already.length === 1) {
  kvId = already[0].id;
  done(`KV ${already[0].title} đã có sẵn`);
} else if (already.length > 1) {
  fatal(`Có ${already.length} KV namespace cùng khớp môi trường ${ENV}:\n` +
    already.map((n) => `      • ${n.title} (${n.id})`).join('\n'),
    'Xoá bớt trong dashboard Cloudflare rồi chạy lại, hoặc điền tay id đúng vào wrangler.jsonc.');
} else if (DRY) {
  kvId = '(sẽ tạo)';
  say('KV cho CACHE chưa có — sẽ tạo');
} else {
  wr(['kv', 'namespace', 'create', 'CACHE', '--env', ENV]);
  const after = kvList();
  const ids = new Set(before.map((n) => n.id));
  const fresh = after.filter((n) => !ids.has(n.id));
  if (fresh.length !== 1) {
    fatal('Tạo KV xong nhưng không xác định được namespace vừa sinh ra.',
      'Vào dashboard Cloudflare lấy id rồi điền tay vào wrangler.jsonc.');
  }
  kvId = fresh[0].id;
  done(`Đã tạo KV ${fresh[0].title}`);
}

// ---- R2: hiện wrangler.jsonc KHÔNG khai báo r2_buckets (chưa mã nào dùng tới,
// và bật R2 đòi thêm một bước đăng ký gói trên tài khoản Cloudflare). Vẫn tạo
// sẵn bucket ở đây nếu tài khoản đã bật R2, để lúc cần chỉ việc thêm binding.
// Không tạo được cũng không sao — deploy vẫn chạy bình thường.
try {
  const buckets = wr(['r2', 'bucket', 'list']);
  if (buckets.includes(NAMES.r2)) {
    done(`R2 ${NAMES.r2} đã có sẵn`);
  } else if (DRY) {
    say(`R2 ${NAMES.r2} chưa có — sẽ tạo`);
  } else {
    wr(['r2', 'bucket', 'create', NAMES.r2]);
    done(`Đã tạo R2 ${NAMES.r2}`);
  }
} catch (err) {
  // R2 chưa bật trên tài khoản là chuyện thường và KHÔNG chặn: ảnh hiện đang
  // nằm trong ./public đi kèm Worker, R2 chỉ dùng cho ảnh tải lên từ CMS sau này.
  say(`Bỏ qua R2: ${String(err.message).split('\n')[0]}`);
  say('  Không sao — wrangler.jsonc chưa dùng R2. Ảnh trang nằm trong ./public.');
}

// ═══════════════════════════════════════════════ 3. Ghi id vào wrangler.jsonc

heading('Ghi id vào wrangler.jsonc');

if (DRY) {
  say(`database_id → ${dbId}`);
  say(`kv id       → ${kvId}`);
} else {
  const changed = writeIds('wrangler.jsonc', ENV, dbId, kvId);
  if (changed.length === 0) done('Đã đúng sẵn, không cần sửa');
  else changed.forEach((c) => done(c));
}

/**
 * Thay id vào đúng khối env đang deploy.
 *
 * File là JSONC có chú thích tiếng Việt giải thích từng lựa chọn. `JSON.parse`
 * rồi `stringify` sẽ xoá sạch chỗ đó, nên phải thay chuỗi tại chỗ: định vị
 * khối `"<env>": {` bằng cách đếm ngoặc, rồi chỉ đụng vào phần bên trong.
 */
function writeIds(file, envName, database, kv) {
  let text = readFileSync(file, 'utf8');
  const key = `"${envName}": {`;
  const at = text.indexOf(key);
  if (at < 0) fatal(`wrangler.jsonc không có khối "${envName}".`);

  let depth = 0, end = -1;
  for (let i = at + key.length - 1; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) fatal(`Không đọc được ranh giới khối "${envName}" trong wrangler.jsonc.`);

  let block = text.slice(at, end);
  const notes = [];

  block = block.replace(/("database_id"\s*:\s*")([^"]*)(")/, (m, a, old, b) => {
    if (old === database) return m;
    notes.push(`database_id: ${old.slice(0, 12)}… → ${database}`);
    return a + database + b;
  });

  block = block.replace(/("kv_namespaces"\s*:\s*\[\s*\{\s*"binding"\s*:\s*"CACHE"\s*,\s*"id"\s*:\s*")([^"]*)(")/,
    (m, a, old, b) => {
      if (old === kv) return m;
      notes.push(`kv id: ${old.slice(0, 12)}… → ${kv}`);
      return a + kv + b;
    });

  if (notes.length) writeFileSync(file, text.slice(0, at) + block + text.slice(end));
  return notes;
}

// ═══════════════════════════════════════════════ 4. Khoá bí mật

heading('Khoá bí mật');

let existing = new Set();
try {
  existing = new Set(json(wr(['secret', 'list', '--env', ENV])).map((s) => s.name));
} catch {
  say('Worker chưa từng deploy nên chưa có khoá nào — sẽ đặt mới.');
}

// Hai khoá này hệ tự sinh được. Đã có thì TUYỆT ĐỐI không sinh lại: đổi
// SESSION_SECRET là mọi phiên đăng nhập đang mở chết ngay lập tức.
for (const [name, bytes, what] of [
  ['SESSION_SECRET', 48, 'ký cookie phiên đăng nhập'],
  ['IP_HASH_SALT',   32, 'băm IP để thống kê mà không lưu IP thô'],
]) {
  if (existing.has(name)) { done(`${name} đã có, giữ nguyên (${what})`); continue; }
  if (DRY) { say(`${name} sẽ được sinh mới`); continue; }
  putSecret(name, randomBytes(bytes).toString('base64'));
  done(`Đã sinh ${name} (${what})`);
}

// Khoá này lấy từ SePay, không tự sinh được.
if (!existing.has('SEPAY_WEBHOOK_API_KEY')) {
  say('⚠ SEPAY_WEBHOOK_API_KEY chưa đặt. Lấy trong SePay → Tích hợp webhook → API Key, rồi:');
  say(`     npx wrangler secret put SEPAY_WEBHOOK_API_KEY --env ${ENV}`);
} else {
  done('SEPAY_WEBHOOK_API_KEY đã có');
}

/** Đẩy khoá qua stdin: không ghi ra file, không nằm trong lịch sử lệnh. */
function putSecret(name, value) {
  const res = spawnSync('npx', ['wrangler', 'secret', 'put', name, '--env', ENV], {
    input: value + '\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (res.status !== 0) fatal(`Không đặt được khoá ${name}.`, (res.stderr ?? '').trim());
}

// ═══════════════════════════════════════════════ 5. Soát cấu hình

heading('Soát cấu hình trước khi deploy');

if (DRY) {
  say('(bỏ qua ở chế độ --dry-run)');
} else {
  const res = spawnSync(process.execPath, ['scripts/preflight.mjs', '--env', ENV], { stdio: 'inherit' });
  if (res.status !== 0) {
    fatal('Dừng trước khi deploy.',
      'Những mục ở trên khiến hệ deploy xong vẫn KHÔNG nhận được tiền. Sửa rồi chạy lại.');
  }
}

// ═══════════════════════════════════════════════ 6. Migration và dữ liệu nền

heading('Migration và dữ liệu nền');

if (DRY) {
  say('(bỏ qua ở chế độ --dry-run)');
} else {
  wr(['d1', 'migrations', 'apply', 'DB', '--remote', '--env', ENV], { quiet: false });
  done('Đã chạy migration');

  // Seed đè lên dữ liệu đã có là nhân đôi sản phẩm và bậc thứ hạng — chỉ chạy
  // khi database còn trắng.
  if (count('products') === 0) {
    for (const f of ['migrations/seed/0001_seed.sql', 'migrations/seed/0002_gamification.sql']) {
      wr(['d1', 'execute', 'DB', '--remote', '--env', ENV, '--file', f]);
    }
    done('Đã nạp dữ liệu nền (sản phẩm, cơ chế thưởng, bậc thứ hạng, quà mẫu)');
  } else {
    done('Đã có dữ liệu, bỏ qua bước nạp nền');
  }
}

function count(table) {
  try {
    const out = wr(['d1', 'execute', 'DB', '--remote', '--env', ENV,
      '--command', `SELECT COUNT(*) AS n FROM ${table}`, '--json']);
    const parsed = json(out);
    return Number(parsed?.[0]?.results?.[0]?.n ?? parsed?.results?.[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════ 7. Build và deploy

heading('Build và deploy');

if (DRY) {
  say('(bỏ qua ở chế độ --dry-run)');
} else {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  wr(['deploy', '--env', ENV], { quiet: false });
  done('Đã deploy');
}

// ═══════════════════════════════════════════════ 8. Tài khoản quản trị

heading('Tài khoản quản trị');

let created = false;
if (DRY) {
  say('(bỏ qua ở chế độ --dry-run)');
} else if (count('admin_users') > 0) {
  done('Đã có tài khoản quản trị, không tạo thêm');
} else {
  const email = arg('email');
  if (!email) {
    say('Chưa có tài khoản quản trị nào. Tạo bằng:');
    say(`     node scripts/create-admin.mjs --email <email> --remote --env ${ENV}`);
  } else {
    execFileSync(process.execPath,
      ['scripts/create-admin.mjs', '--email', email, '--remote', '--env', ENV],
      { stdio: 'inherit' });
    created = true;
  }
}

// ═══════════════════════════════════════════════ Tổng kết

const rawCfg = readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, '');
const base = JSON.parse(rawCfg).env[ENV].vars.PUBLIC_BASE_URL;

console.log(`
${'═'.repeat(72)}
XONG — môi trường ${ENV}
${'═'.repeat(72)}

  Trang bán            ${base}/
  Workshop             ${base}/workshop
  Bản đồ 21 ngày       ${base}/ban-do-21-ngay
  Quản trị             ${base}/admin
  Portal cộng tác viên ${base}/aff

  Dán vào SePay → Tích hợp webhook → URL:
      ${base}/api/webhooks/sepay

Việc tiếp theo:

  1. Dán URL webhook ở trên vào SePay, lấy API Key rồi đặt:
         npx wrangler secret put SEPAY_WEBHOOK_API_KEY --env ${ENV}
  2. Tạo một đơn thử rồi CHUYỂN THẬT 2.000đ. Đây là thứ duy nhất chứng minh
     được payload SePay khớp với cách hệ đọc nó.
  3. Vào ${base}/admin → Cài đặt, điền link nhóm Zalo và link Bản Đồ 21 Ngày.${created ? '' : `
  4. Tạo tài khoản quản trị nếu chưa có:
         node scripts/create-admin.mjs --email <email> --remote --env ${ENV}`}
`);
