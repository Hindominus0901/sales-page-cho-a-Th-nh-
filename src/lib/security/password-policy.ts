/**
 * Một chính sách mật khẩu cho cả ba vai trò: quản trị, cộng tác viên, học viên.
 *
 * Trước đây nó nằm trong src/routes/admin/auth.ts và chỉ admin được hưởng.
 * Nhân đôi luật kiểu này là cách chắc chắn để hai bản lệch nhau sau vài tháng,
 * và bên lệch xuống sẽ là bên không ai nhớ tới — tức là học viên.
 */

/**
 * Tối thiểu 12 ký tự.
 *
 * Cloudflare Workers chặn PBKDF2 ở 100.000 vòng, thấp hơn khuyến nghị của
 * OWASP, và đó là trần nền tảng chứ không phải lựa chọn. Bù lại bằng độ dài:
 * một mật khẩu 12 ký tự thật sự ngẫu nhiên vẫn ngoài tầm dò, còn "Thanh2024"
 * thì 100.000 vòng không cứu nổi.
 */
export const MIN_PASSWORD = 12;

/**
 * Những chuỗi khiến mật khẩu thành đoán được.
 *
 * Danh sách này không nhằm bắt hết mọi mật khẩu yếu — không danh sách nào làm
 * được thế. Nó chặn đúng những thứ người ta thật sự hay gõ ở dự án NÀY, và
 * quan trọng hơn: chặn việc lấy chính email hay tên thương hiệu làm mật khẩu.
 */
const CAM = ['password', 'matkhau', 'goccreator', 'goc creator', 'manhthanh',
  '123456', 'qwerty', 'admin', 'abc123', '111111', 'iloveyou'];

/** Trả về câu lỗi tiếng Việt, hoặc null nếu mật khẩu dùng được. */
export function checkPassword(moi: string, email: string): string | null {
  if (moi.length < MIN_PASSWORD) {
    return `Mật khẩu phải từ ${MIN_PASSWORD} ký tự trở lên — hiện mới ${moi.length}.`;
  }
  if (moi.length > 200) return 'Mật khẩu dài quá 200 ký tự.';
  if (moi.trim() !== moi) return 'Mật khẩu không được bắt đầu hoặc kết thúc bằng dấu cách.';

  const thuong = moi.toLowerCase();
  for (const xau of CAM) {
    if (thuong.includes(xau)) return `Mật khẩu không được chứa "${xau}" — dễ đoán quá.`;
  }
  // Phần trước @ của email là thứ người dò thử đầu tiên.
  const ten = email.split('@')[0]?.toLowerCase() ?? '';
  if (ten.length >= 4 && thuong.includes(ten)) {
    return 'Mật khẩu không được chứa email của anh chị.';
  }
  // Một ký tự lặp lại suốt thì dài mấy cũng vô nghĩa.
  if (/^(.)\1*$/.test(moi)) return 'Mật khẩu chỉ có một ký tự lặp lại.';
  return null;
}
