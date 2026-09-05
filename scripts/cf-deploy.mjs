/**
 * Lệnh deploy cho Workers Builds (nối repo trong dashboard Cloudflare).
 *
 * Dán đúng dòng này vào ô "Deploy command" của dashboard:
 *
 *     node scripts/cf-deploy.mjs
 *
 * Workers Builds chỉ chạy build rồi deploy. Nó KHÔNG chạy migration D1, và
 * Worker lên mà database chưa có bảng thì mọi request đụng tới dữ liệu đều
 * lỗi 500 — trang trông vẫn mở được nên rất dễ tưởng là đã xong.
 *
 * Chạy được nhiều lần: migration đã áp thì bỏ qua, dữ liệu nền đã có thì
 * không nạp đè.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const PREVIEW = argv.includes('--preview');
const ENV_FLAG = PREVIEW ? ['--env', 'preview'] : [];

let step = 0;
const heading = (t) => console.log(`\n[${++step}/6] ${t}\n${'─'.repeat(68)}`);
const say = (t) => console.log('    ' + t);
const done = (t) => console.log('  ✓ ' + t);

function fatal(msg, hint) {
  console.error(`\n✗ ${msg}`);
  if (hint) console.error(`\n  ${hint}`);
  console.error('');
  process.exit(1);
}

function run(cmd, args, { quiet = false } = {}) {
  if (DRY) { say(`(dry-run) ${cmd} ${args.join(' ')}`); return ''; }
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (res.status !== 0) {
    const err = new Error((res.stderr || res.stdout || '').trim() || `${cmd} ${args[0]} lỗi`);
    err.stdout = res.stdout;
    throw err;
  }
  return res.stdout ?? '';
}

const wr = (args, opts) => run('npx', ['wrangler', ...args], opts);

/** Wrangler in kèm banner; chỉ lấy đoạn JSON bên trong. */
function json(out) {
  const a = out.indexOf('['), o = out.indexOf('{');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  if (start < 0) throw new Error('không tìm thấy JSON trong output của wrangler');
  const end = out[start] === '[' ? out.lastIndexOf(']') : out.lastIndexOf('}');
  return JSON.parse(out.slice(start, end + 1));
}

// ══════════════════════════════════════════ 1. Soát cấu hình

heading('Soát cấu hình');

{
  const res = spawnSync(process.execPath,
    ['scripts/preflight.mjs', '--env', PREVIEW ? 'preview' : 'production'],
    { stdio: 'inherit' });
  if (res.status !== 0) {
    fatal('Dừng trước khi deploy.',
      'Những mục ở trên khiến hệ deploy xong vẫn KHÔNG nhận được tiền.\n'
      + '  Sửa trong wrangler.jsonc (hoặc đặt khoá bí mật trong Settings → Variables\n'
      + '  and Secrets của dashboard), rồi bấm Retry deployment.');
  }
}

// ══════════════════════════════════════════ 2. Migration

heading('Migration D1');

try {
  wr(['d1', 'migrations', 'apply', 'DB', '--remote', ...ENV_FLAG]);
  done('Đã áp migration (những cái đã áp trước thì bỏ qua)');
} catch (err) {
  fatal('Không chạy được migration D1.',
    'Thường là do database_id trong wrangler.jsonc chưa đúng, hoặc D1 chưa được tạo.\n'
    + `  Chi tiết: ${String(err.message).split('\n')[0]}`);
}

// ══════════════════════════════════════════ 3. Dữ liệu nền

heading('Dữ liệu nền');

function count(table) {
  try {
    const out = wr(['d1', 'execute', 'DB', '--remote', ...ENV_FLAG,
      '--command', `SELECT COUNT(*) AS n FROM ${table}`, '--json'], { quiet: true });
    if (DRY) return 1;
    const parsed = json(out);
    return Number(parsed?.[0]?.results?.[0]?.n ?? parsed?.results?.[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

// Nạp đè lên dữ liệu đã có là nhân đôi sản phẩm và bậc thứ hạng. Mỗi lần đẩy
// mã lên GitHub là script này chạy lại, nên điều kiện này phải chắc.
if (count('products') === 0) {
  for (const f of ['migrations/seed/0001_seed.sql', 'migrations/seed/0002_gamification.sql']) {
    wr(['d1', 'execute', 'DB', '--remote', ...ENV_FLAG, '--file', f], { quiet: true });
  }
  done('Đã nạp dữ liệu nền (sản phẩm, cơ chế thưởng, bậc thứ hạng, quà mẫu)');
} else {
  done('Database đã có dữ liệu — bỏ qua bước nạp nền');
}

// ══════════════════════════════════════════ 4. Deploy

heading('Deploy');

wr(['deploy', ...ENV_FLAG]);
done('Đã deploy');

// ══════════════════════════════════════════ 5. Tài khoản quản trị

heading('Tài khoản quản trị');

/**
 * Tạo tài khoản owner đầu tiên ngay trong lần deploy đầu.
 *
 * Trước đây việc này phải chạy `scripts/create-admin.mjs` trên máy có Node và
 * đã đăng nhập wrangler — tức là người dựng bằng dashboard thì tắc ở đây, ngay
 * sau khi mọi thứ khác đã lên.
 *
 * Chỉ chạy khi bảng còn RỖNG, nên không có đường nào thêm tài khoản lạ về sau:
 * mỗi lần đẩy mã lên là script này chạy lại, và từ lần thứ hai nó không làm gì.
 * Mật khẩu in ra nhật ký build — nhật ký đó chỉ chủ tài khoản Cloudflare xem
 * được, và dòng in ra nói rõ phải đổi ngay sau lần đăng nhập đầu.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRTVWXY34679';
const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),
    'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$210000$${b64url(salt)}$${b64url(bits)}`;
}

let firstAdmin = null;
const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();

if (DRY) {
  say('(bỏ qua ở chế độ --dry-run)');
} else if (count('admin_users') > 0) {
  done('Đã có tài khoản quản trị — không tạo thêm');
} else if (!adminEmail) {
  say('⚠ Chưa có tài khoản quản trị nào, và chưa biết tạo cho email nào.');
  say('  Thêm ADMIN_EMAIL vào Settings → Build → Variables and Secrets rồi deploy lại.');
  say('  LƯU Ý: phải là biến của BUILD, không phải phần Variables and Secrets của');
  say('  Worker — hai chỗ đó khác nhau, script này chạy lúc build nên chỉ đọc được');
  say('  chỗ đầu.');
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail)) {
  say(`⚠ ADMIN_EMAIL không hợp lệ: ${adminEmail} — bỏ qua bước tạo tài khoản.`);
} else {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const password = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  const hash = await hashPassword(password);
  const sql = `INSERT INTO admin_users
      (id, email, email_norm, name, password_hash, role, is_active, created_at, updated_at)
    VALUES ('${crypto.randomUUID()}', '${adminEmail}', '${adminEmail}',
            'Chủ hệ thống', '${hash}', 'owner', 1, unixepoch(), unixepoch());`;
  wr(['d1', 'execute', 'DB', '--remote', ...ENV_FLAG, '--command', sql], { quiet: true });
  firstAdmin = { email: adminEmail, password };
  done(`Đã tạo tài khoản owner đầu tiên: ${adminEmail}`);
}

// ══════════════════════════════════════════ 6. Việc tiếp theo

heading('Xong');

const cfg = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const base = (PREVIEW ? cfg.env.preview.vars : cfg.vars).PUBLIC_BASE_URL.replace(/\/$/, '');
const hasAdmin = firstAdmin !== null || count('admin_users') > 0;

console.log(`
  Trang bán             ${base}/
  Workshop              ${base}/workshop
  Quản trị              ${base}/admin
  Portal cộng tác viên  ${base}/aff
  Tìm lại đơn           ${base}/tra-cuu

  Dán vào SePay → Tích hợp webhook → URL:
      ${base}/api/webhooks/sepay
${firstAdmin ? `
  ┌─────────────────────────────────────────────────────────────────┐
  │  TÀI KHOẢN QUẢN TRỊ ĐẦU TIÊN — mật khẩu chỉ hiện MỘT LẦN ở đây  │
  └─────────────────────────────────────────────────────────────────┘

      Đăng nhập : ${base}/admin
      Email     : ${firstAdmin.email}
      Mật khẩu  : ${firstAdmin.password}

  Chép ra chỗ an toàn NGAY. Nhật ký build có thể bị xoá, và hệ chỉ lưu bản
  băm nên không xem lại được. Đăng nhập xong vào Nhân sự đổi mật khẩu ngay.
` : hasAdmin ? '' : `
  ⚠ CHƯA CÓ TÀI KHOẢN QUẢN TRỊ NÀO.
    Thêm ADMIN_EMAIL vào Settings → Build → Variables and Secrets (biến của BUILD,
    không phải của Worker) rồi deploy lại.
`}`);
