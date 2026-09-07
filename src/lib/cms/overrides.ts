import type { Env } from '../../types';

/**
 * Ghi đè nội dung trang bán lúc CHẠY, không cần deploy.
 *
 * Vì sao làm ở phía máy chủ bằng HTMLRewriter chứ không bằng JavaScript trong
 * trình duyệt: nội dung vẫn nằm trong HTML gốc, nên Google đọc được và người
 * dùng không thấy chữ nhảy sau khi trang đã hiện. Đây là trang BÁN HÀNG — mất
 * SEO để đổi lấy tiện lợi cho quản trị là một cái giá không đáng.
 *
 * Nguyên tắc của bảng `page_content` (viết từ migration 0006, giờ mới dùng tới):
 * mã giữ mặc định và cấu trúc, database chỉ giữ phần GHI ĐÈ. Trang phải render
 * hoàn hảo khi bảng rỗng — và nó có: không dòng nào thì hàm này trả nguyên
 * phản hồi gốc, không đụng vào gì.
 */

/** Những khối sửa được. Danh sách đóng — không cho ghi đè bừa vào trang. */
export const KHOI_SUA_DUOC = [
  'stats.0', 'stats.1', 'stats.2', 'stats.3',
  'faq',
] as const;

export type KhoiSuaDuoc = typeof KHOI_SUA_DUOC[number];

export interface CauHoi { q: string; a: string }

/** Đọc mọi ghi đè của một trang. Trả map rỗng khi chưa ai điền gì. */
export async function docGhiDe(
  env: Env, pageKey: string,
): Promise<Map<string, unknown>> {
  const rows = await env.DB.prepare(
    'SELECT block_key, value_json FROM page_content WHERE page_key = ?',
  ).bind(pageKey).all<{ block_key: string; value_json: string }>();

  const m = new Map<string, unknown>();
  for (const r of rows.results ?? []) {
    try { m.set(r.block_key, JSON.parse(r.value_json)); } catch { /* dòng hỏng: bỏ qua */ }
  }
  return m;
}

const esc = (s: string): string => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Áp ghi đè lên một phản hồi HTML.
 *
 * Không có ghi đè nào thì trả nguyên phản hồi — không dựng HTMLRewriter, không
 * tốn gì. Cách này giữ cho trang bán chạy đúng như trước ở mọi bản triển khai
 * chưa ai đụng vào CMS.
 */
export async function apGhiDe(
  env: Env, pageKey: string, res: Response,
): Promise<Response> {
  const kieu = res.headers.get('content-type') ?? '';
  if (!kieu.includes('text/html')) return res;

  const ghiDe = await docGhiDe(env, pageKey);

  const stats = [0, 1, 2, 3].map((i) => {
    const v = ghiDe.get(`stats.${i}`);
    return v === undefined ? null : String(v).trim();
  });
  const coGhiDeStats = stats.some((v) => v !== null);

  const faq = ghiDe.get('faq') as CauHoi[] | undefined;
  const coGhiDeFaq = Array.isArray(faq);

  // Không có gì để làm, và cũng phải kiểm khối stats rỗng — build luôn phát ra
  // khối đó kèm dấu, nên việc gỡ nó khi rỗng là việc của tầng này.
  let rw = new HTMLRewriter();

  rw = rw.on('[data-nd-block="stats"]', {
    element(el) {
      /**
       * Gỡ cả khối khi bốn ô đều rỗng.
       *
       * Build không biết trong database có gì nên nó luôn phát ra khối này.
       * Quyết định hiện hay ẩn nằm ở đây, nơi biết cả hai nguồn. Bốn ô rỗng
       * trên một trang bán hàng trông như trang hỏng.
       */
      const coSanTuLucDung = el.getAttribute('data-nd-co-san') === '1';
      if (!coGhiDeStats && !coSanTuLucDung) el.remove();
    },
  });

  // Chỉ gắn xử lý cho những ô THẬT SỰ có ghi đè; ô không có thì giữ nguyên chữ
  // đã dựng sẵn.
  for (const [i, v] of stats.entries()) {
    if (typeof v !== 'string') continue;
    rw = rw.on(`[data-nd="stats.${i}"]`, {
      element(el) { el.setInnerContent(v); },
    });
  }

  if (coGhiDeFaq) {
    const html = (faq as CauHoi[])
      .filter((x) => String(x?.q ?? '').trim() && String(x?.a ?? '').trim())
      .map((x, i) => `<details${i === 0 ? ' open=""' : ''}>`
        + `<summary>${esc(x.q)}</summary>`
        + '<p style="font-size:15px;line-height:1.7;color:#55555c;margin:0 0 20px">'
        + `${esc(x.a)}</p></details>`)
      .join('\n');

    rw = rw.on('[data-nd-list="faq"]', {
      element(el) {
        // Danh sách rỗng thì gỡ luôn cả khối FAQ, đừng để lại tiêu đề trống.
        if (!html) el.remove();
        else el.setInnerContent(html, { html: true });
      },
    });
  }

  return rw.transform(res);
}
