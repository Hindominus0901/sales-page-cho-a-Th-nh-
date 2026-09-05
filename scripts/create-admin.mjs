/**
 * Tạo tài khoản quản trị đầu tiên.
 *
 *   node scripts/create-admin.mjs --email a@vidu.com --name "Đỗ Mạnh Thành" --role owner
 *   node scripts/create-admin.mjs --email a@vidu.com --remote --env production
 *
 * Mật khẩu sinh ngẫu nhiên và chỉ in ra MỘT LẦN. Băm bằng đúng thuật toán
 * PBKDF2 mà Worker dùng để xác thực (src/lib/security/hash.ts).
 */
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes('--' + name);

const email = arg('email');
const name = arg('name', 'Quản trị viên');
const role = arg('role', 'owner');
const envName = arg('env');
const remote = has('remote');

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Thiếu hoặc sai --email. Ví dụ: node scripts/create-admin.mjs --email a@vidu.com');
  process.exit(1);
}
if (!['owner', 'admin', 'staff'].includes(role)) {
  console.error('--role phải là owner, admin hoặc staff.');
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Trần của Cloudflare Workers. Cao hơn thì WebCrypto ném lúc kiểm mật khẩu.
const ITERATIONS = 100_000;

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password),
    'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(bits)}`;
}

/** Bảng chữ dễ đọc để đọc mật khẩu qua điện thoại không nhầm. */
function randomPassword(len = 16) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRTVWXY34679';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

const password = randomPassword();
const hash = await hashPassword(password);
const sql = `INSERT INTO admin_users (id, email, email_norm, name, password_hash, role, is_active, created_at, updated_at)
VALUES ('${crypto.randomUUID()}', '${email}', '${email.toLowerCase()}',
        '${name.replace(/'/g, "''")}', '${hash}', '${role}', 1, unixepoch(), unixepoch());`;

const args = ['wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local'];
if (envName) args.push('--env', envName);
args.push('--command', sql);

try {
  execFileSync('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  const out = String(err.stdout ?? '') + String(err.stderr ?? '');
  if (out.includes('ux_admin_users_email')) {
    console.error(`Email ${email} đã có tài khoản.`);
  } else {
    console.error('Không tạo được tài khoản:\n' + out.slice(-1500));
  }
  process.exit(1);
}

console.log(`
Đã tạo tài khoản quản trị (${remote ? 'production/preview' : 'máy nhà'}):

  Email    : ${email}
  Mật khẩu : ${password}
  Quyền    : ${role}

Mật khẩu chỉ hiện MỘT LẦN — hệ thống chỉ lưu bản băm, không xem lại được.
Đăng nhập tại /admin rồi đổi mật khẩu ngay.
`);
