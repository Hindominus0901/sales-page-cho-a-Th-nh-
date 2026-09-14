/**
 * Sinh chuoi bam mat khau cho tai khoan quan tri.
 *
 *   npm run hash-password "mat khau cua ban"
 *
 * Roi dat ket qua vao Cloudflare:
 *   npx wrangler secret put ADMIN_PASSWORD_HASH
 *
 * Dung chung dung mot ham voi Worker (worker/src/lib/crypto.js) - neu tach ra
 * hai ban thi chi can lech mot tham so la mat khau khong dang nhap duoc, ma loi
 * ay rat kho tim.
 */
import { hashPassword, PBKDF2_ITERATIONS } from '../worker/src/lib/crypto.js';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Dung: npm run hash-password "mat khau it nhat 8 ky tu"');
  process.exit(1);
}

console.log(await hashPassword(password));
console.error(`\n(PBKDF2-SHA256, ${PBKDF2_ITERATIONS.toLocaleString('vi-VN')} vong)`);
