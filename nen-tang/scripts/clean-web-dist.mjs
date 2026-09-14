/**
 * Don rieng phan cua ban dung Vite trong dist/public.
 *
 * Vite tung tu xoa sach ca thu muc (emptyOutDir), nhung dist/public dung CHUNG
 * voi trang ban hang (f/, xem-truoc/). Chay `npm run build:web` mot minh la
 * thoi bay het trang ban hang, roi test funnel do 10 bai voi ly do khong lien
 * quan gi toi thay doi vua lam - rat mat thi gio de tim ra.
 *
 * Gio moi ben tu don dung phan cua minh: o day la assets/ va index.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'public');

for (const name of ['assets', 'index.html']) {
  const target = path.join(OUT, name);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}
