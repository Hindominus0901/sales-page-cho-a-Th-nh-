/**
 * Mở đúng file SQLite mà `wrangler dev` đang dùng.
 *
 * Thư mục này có thể chứa NHIỀU file .sqlite: mỗi lần đổi tên Worker hoặc đổi
 * tên database trong wrangler.jsonc, miniflare sinh một file mới và bỏ file cũ
 * lại. Lấy file đầu tiên theo thứ tự thư mục là đánh cược — và cú đánh cược đó
 * đã thua một lần: bộ kiểm chứng đọc file cũ, thấy dữ liệu nền của phiên trước,
 * rồi báo xanh trong khi Worker đang chạy trên một database khác hẳn.
 *
 * File nào Worker đang ghi vào thì file đó mới nhất — nên chọn theo thời điểm
 * sửa cuối. Và khi có nhiều hơn một file, nói ra, để lần sau không phải lần mò.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

export function openLocalD1() {
  const files = readdirSync(D1_DIR)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ f, mtime: statSync(join(D1_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.error(`Không thấy database cục bộ nào trong ${D1_DIR}.`);
    console.error('Chạy `npm run db:reset` rồi `npm run dev` trước.');
    process.exit(2);
  }

  if (files.length > 1) {
    console.log(`   ⚠ Có ${files.length} database cục bộ — dùng file mới nhất: ${files[0].f}`);
    console.log('     File cũ là rác của lần đổi tên Worker trước, xoá được: '
      + `rm ${join(D1_DIR, files[1].f)}`);
  }

  return new DatabaseSync(join(D1_DIR, files[0].f));
}
