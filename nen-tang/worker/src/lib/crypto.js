/**
 * Cac ham ma hoa dung chung.
 *
 * Workers chi co WebCrypto - khong co scrypt, khong co bcrypt. PBKDF2-SHA256
 * la lua chon duy nhat co san va duoc bao dam ton tai.
 */
import { safeEqual } from './http.js';

const enc = new TextEncoder();

/**
 * Cloudflare Workers CHAN CUNG PBKDF2 o 100.000 vong mot lan goi
 * ("iteration counts above 100000 are not supported"). Day la gioi han cua nen
 * tang, khong phai cua goi dich vu - nang cap goi cung khong go duoc.
 *
 * Khuyen nghi cua OWASP cho PBKDF2-SHA256 cao hon con so do nhieu, nen ta noi
 * nhieu luot lai: ket qua luot truoc lam "mat khau" cho luot sau. Ke tan cong
 * cung phai chay dung so vong ay, nen cong suc be khoa tang dung theo ty le.
 */
const MAX_ITER_PER_CALL = 100_000;
const PBKDF2_ROUNDS = 3;
export const PBKDF2_ITERATIONS = MAX_ITER_PER_CALL * PBKDF2_ROUNDS; // 300.000

export const toHex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Token ngau nhien 32 byte - dung cho cookie phien va link dat lai mat khau. */
export const randomToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function derive(passwordBytes, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256));
}

/** Chay `iterations` vong, cat thanh nhieu luot 100.000 de lot qua gioi han. */
async function pbkdf2(password, saltHex, iterations) {
  const salt = Uint8Array.from(saltHex.match(/../g) || [], (h) => parseInt(h, 16));
  let out = enc.encode(password);
  let left = Math.max(1, Number(iterations) || PBKDF2_ITERATIONS);
  while (left > 0) {
    const step = Math.min(left, MAX_ITER_PER_CALL);
    out = await derive(out, salt, step);
    left -= step;
  }
  return toHex(out);
}

/**
 * Dinh dang: pbkdf2:sha256:<so vong>:<salt>:<hash>
 * Dung dau ":" chu khong phai "$" - dotenv nuot mat moi thu sau dau "$".
 */
export async function hashPassword(password, saltHex) {
  const salt = saltHex || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:sha256:${PBKDF2_ITERATIONS}:${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const [, , iterations, salt, expected] = parts;
  const actual = await pbkdf2(password, salt, Number(iterations) || PBKDF2_ITERATIONS);
  return safeEqual(actual, expected);
}

/**
 * Bam ma OTP kem "pepper" tu bien bi mat.
 * Ma chi co 6 chu so nen neu chi bam SHA-256 tran thi ke doc duoc database co
 * the do het mot trieu kha nang trong tich tac. Pepper nam ngoai database khien
 * viec do do tro nen vo nghia.
 */
export const hashOtp = (code, pepper) => sha256Hex(`${pepper}:${code}`);

/**
 * Ma 6 chu so tu nguon ngau nhien an toan (khong dung Math.random).
 * Bo va rut lai neu roi vao phan du - de moi ma co xac suat bang nhau.
 */
export function newOtpCode() {
  const LIMIT = 4_294_000_000; // boi so cua 1.000.000 gan 2^32 nhat
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= LIMIT);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export { safeEqual };
