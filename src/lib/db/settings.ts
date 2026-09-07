import type { Env } from '../../types';

/**
 * Đọc một cài đặt vận hành từ bảng `settings`.
 *
 * Bảng này là NGUỒN SỰ THẬT cho các con số anh Thành chỉnh được trong /admin.
 * Trước khi có hàm này, ba khoá quan trọng nhất đều là cài đặt chết: sửa được
 * trong giao diện, báo "Đã lưu", rồi không nơi nào đọc — vì mã đọc thẳng từ
 * biến môi trường hoặc hằng số. Anh Thành đổi ngưỡng rút tiền, thấy báo thành
 * công, và không có gì đổi cả. Đây là loại lỗi nguy hiểm vì nó im lặng.
 *
 * Giá trị lưu dạng JSON (`'7'`, `'"daily"'`). Đọc hỏng thì trả `null` để người
 * gọi rơi về mặc định của mình — một dòng settings sai định dạng không được
 * phép làm chết đường thanh toán.
 */
export async function getSetting<T = unknown>(env: Env, key: string): Promise<T | null> {
  const row = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?')
    .bind(key).first<{ value_json: string }>();
  if (!row) return null;
  try { return JSON.parse(row.value_json) as T; } catch { return null; }
}

/**
 * Đọc một cài đặt kiểu số, có chặn khoảng.
 *
 * `macDinh` dùng khi chưa ai đặt, khi giá trị hỏng, hoặc khi nó nằm ngoài
 * khoảng cho phép. Chặn khoảng ở đây chứ không ở giao diện: giao diện chặn được
 * người gõ nhầm, nhưng không chặn được một dòng DB bị sửa tay.
 */
export async function getSettingNumber(
  env: Env, key: string, macDinh: number, min = 0, max = Number.MAX_SAFE_INTEGER,
): Promise<number> {
  const v = Number(await getSetting(env, key));
  if (!Number.isFinite(v) || v < min || v > max) return macDinh;
  return v;
}
