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
const heading = (t) => console.log(`\n[${++step}/5] ${t}\n${'─'.repeat(68)}`);
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

// ══════════════════════════════════════════ 5. Việc tiếp theo

heading('Xong');

const cfg = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const base = (PREVIEW ? cfg.env.preview.vars : cfg.vars).PUBLIC_BASE_URL.replace(/\/$/, '');
const hasAdmin = count('admin_users') > 0;

console.log(`
  Trang bán             ${base}/
  Workshop              ${base}/workshop
  Quản trị              ${base}/admin
  Portal cộng tác viên  ${base}/aff
  Tìm lại đơn           ${base}/tra-cuu

  Dán vào SePay → Tích hợp webhook → URL:
      ${base}/api/webhooks/sepay
${hasAdmin ? '' : `
  ⚠ CHƯA CÓ TÀI KHOẢN QUẢN TRỊ NÀO. Tạo bằng cách chạy trên máy có Node:
      node scripts/create-admin.mjs --email <email> --remote${PREVIEW ? ' --env preview' : ''}
`}`);
