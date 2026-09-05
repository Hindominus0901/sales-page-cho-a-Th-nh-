import { describe, it, expect } from 'vitest';
import { nameSimilar } from './self-referral';

describe('nameSimilar — so tên khách với tên chủ tài khoản ngân hàng', () => {
  it('khớp khi chỉ khác dấu và hoa/thường', () => {
    expect(nameSimilar('NGUYEN VAN AN', 'Nguyễn Văn An')).toBe(true);
  });
  it('khớp khi khác cách đặt khoảng trắng', () => {
    expect(nameSimilar('TRANTHIBINH', 'Trần Thị Bình')).toBe(true);
  });
  it('xử lý được chữ đ', () => {
    expect(nameSimilar('DO MANH THANH', 'Đỗ Mạnh Thành')).toBe(true);
  });
  it('không khớp với người khác', () => {
    expect(nameSimilar('NGUYEN VAN AN', 'Trần Thị Bình')).toBe(false);
  });
  it('không khớp khi tên quá ngắn — tránh dương tính giả', () => {
    expect(nameSimilar('AN', 'An')).toBe(false);
    expect(nameSimilar('', '')).toBe(false);
  });
  it('tên chứa nhau nhưng không bằng nhau thì không khớp', () => {
    expect(nameSimilar('NGUYEN VAN AN', 'Nguyễn Văn An Bình')).toBe(false);
  });
});
