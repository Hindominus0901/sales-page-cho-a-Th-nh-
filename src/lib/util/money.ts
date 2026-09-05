/** Tiền luôn là số nguyên VND. Không bao giờ dùng số thực cho tiền. */
export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

/** Hoa hồng theo điểm cơ bản (2000 = 20%), làm tròn xuống về đồng. */
export function commissionOf(base: number, rateBp: number): number {
  return Math.floor((base * rateBp) / 10000);
}
