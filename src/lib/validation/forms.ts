import { z } from 'zod';
import { toPhoneNorm, normalizePhone, isValidVnPhone } from './phone';

const clean = (max: number) =>
  z.string().transform((v) => v.replace(/\s+/g, ' ').trim().slice(0, max));

const vnName = clean(120).refine((v) => v.length >= 2, {
  message: 'Anh chị vui lòng nhập họ tên (ít nhất 2 ký tự).',
});

const vnPhone = z.string().transform(normalizePhone).refine(isValidVnPhone, {
  message: 'Số điện thoại không hợp lệ (ví dụ: 0912345678).',
});

const optionalEmail = clean(160)
  .transform((v) => v.toLowerCase())
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), {
    message: 'Email không hợp lệ.',
  })
  .optional()
  .default('');

const requiredEmail = clean(160)
  .transform((v) => v.toLowerCase())
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), {
    message: 'Email không hợp lệ.',
  });

/**
 * Bẫy bot: ô ẩn tên "website". Người thật không thấy nên luôn để trống;
 * bot điền tự động vào mọi ô. Giữ nguyên tên trường của hệ cũ.
 */
const honeypot = z.string().optional().default('').refine((v) => v.trim() === '', {
  message: 'spam',
});

/** Form workshop — thu thêm dữ liệu để chấm điểm. */
export const workshopFormSchema = z.object({
  name: vnName,
  phone: vnPhone,
  email: optionalEmail,
  field: clean(120).optional().default(''),
  stuck: clean(500).optional().default(''),        // điều đang mắc kẹt nhất
  goal_text: clean(500).optional().default(''),    // mục tiêu lớn nhất
  daily_time: z.enum(['over_2h', '1_2h', 'under_1h']).optional(),
  channel: z.enum(['has_over_10k', 'has_1k_10k', 'has_under_1k', 'none_yet']).optional(),
  goal: z.enum(['sell_products', 'get_clients', 'build_personal_brand', 'just_curious']).optional(),
  website: honeypot,
  session: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

/** Form lead magnet Bản Đồ 21 Ngày — cố ý nhẹ, chỉ tên + Zalo. */
export const leadMagnetFormSchema = z.object({
  name: vnName,
  phone: vnPhone,
  email: optionalEmail,
  magnet: clean(60).optional().default('ban-do-21-ngay'),
  website: honeypot,
  'cf-turnstile-response': z.string().optional(),
});

/** Form đăng ký mua khoá — giữ đúng các trường của hệ cũ, thêm phần chấm điểm. */
export const registerFormSchema = z.object({
  name: vnName,
  phone: vnPhone,
  email: requiredEmail,
  field: clean(120).refine((v) => v.length >= 2, {
    message: 'Anh chị cho biết mình đang làm lĩnh vực gì.',
  }),
  note: clean(500).refine((v) => v.length >= 5, {
    message: 'Anh chị viết vài chữ về điều mình mong muốn nhất sau 21 ngày.',
  }),
  budget: z.enum(['ready_2m', 'need_think', 'need_installment', 'not_ready']).optional(),
  timeline: z.enum(['now', 'this_month', '2_3_months', 'unsure']).optional(),
  daily_time: z.enum(['over_2h', '1_2h', 'under_1h']).optional(),
  channel: z.enum(['has_over_10k', 'has_1k_10k', 'has_under_1k', 'none_yet']).optional(),
  goal: z.enum(['sell_products', 'get_clients', 'build_personal_brand', 'just_curious']).optional(),
  website: honeypot,
  'cf-turnstile-response': z.string().optional(),
});

export type WorkshopForm = z.infer<typeof workshopFormSchema>;
export type LeadMagnetForm = z.infer<typeof leadMagnetFormSchema>;
export type RegisterForm = z.infer<typeof registerFormSchema>;

/**
 * Gom lỗi Zod về dạng { tên_trường: "câu lỗi" } mà front-end hệ cũ đã hiểu,
 * để không phải sửa JS của các trang đã build.
 */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  // Bẫy bot: đừng nói cho bot biết vì sao bị chặn.
  if (out.website) {
    delete out.website;
    out._spam = 'spam';
  }
  return out;
}

export { toPhoneNorm, normalizePhone, isValidVnPhone };
