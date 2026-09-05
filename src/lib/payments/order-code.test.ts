import { describe, it, expect } from 'vitest';
import { normalizeTransferContent, extractOrderCode, orderCodeRegex } from './order-code';

const env = { ORDER_CODE_PREFIX: 'GC' } as never;

describe('normalizeTransferContent', () => {
  it('bỏ dấu tiếng Việt và viết hoa', () => {
    expect(normalizeTransferContent('Chuyển tiền học phí')).toBe('CHUYENTIENHOCPHI');
  });
  it('xử lý được chữ đ', () => {
    expect(normalizeTransferContent('đóng tiền')).toBe('DONGTIEN');
  });
  it('bỏ mọi ký tự không phải chữ-số', () => {
    expect(normalizeTransferContent('GC-7QF.3KD / abc')).toBe('GC7QF3KDABC');
  });
});

describe('extractOrderCode — các kiểu nội dung ngân hàng hay gửi về', () => {
  const CODE = 'GC7QF3KD';

  it.each([
    ['nội dung sạch',            CODE],
    ['có tiền tố ngân hàng',     `FT26091234567 ${CODE} CHUYEN TIEN`],
    ['bị chèn dấu cách',         'GC 7QF 3KD'],
    ['bị chèn gạch nối',         'GC-7QF-3KD'],
    ['viết thường',              'gc7qf3kd'],
    ['kèm tên người gửi',        `NGUYEN VAN A chuyen khoan ${CODE}`],
    ['kèm dấu tiếng Việt',       `Đóng học phí ${CODE} nhé`],
    ['nằm cuối chuỗi dài',       `CT DEN:0987654321 NGUYEN VAN A ${CODE}`],
  ])('%s', (_label, content) => {
    expect(extractOrderCode(env, content)).toBe(CODE);
  });

  it('ghép cả trường code và content của SePay', () => {
    expect(extractOrderCode(env, null, `thanh toan ${CODE}`)).toBe(CODE);
    expect(extractOrderCode(env, CODE, 'noi dung khac')).toBe(CODE);
  });

  it('trả null khi không có mã', () => {
    expect(extractOrderCode(env, 'CHUYEN TIEN AN TRUA')).toBeNull();
    expect(extractOrderCode(env, '')).toBeNull();
    expect(extractOrderCode(env, null, undefined)).toBeNull();
  });

  it('không nhận mã sai độ dài', () => {
    expect(extractOrderCode(env, 'GC7QF3')).toBeNull();
  });

  it('không nhận ký tự ngoài bảng chữ (B I O S U 0 1 2 5 8)', () => {
    expect(extractOrderCode(env, 'GCBIOSU0')).toBeNull();
    expect(extractOrderCode(env, 'GC012588')).toBeNull();
  });

  it('mã dài hơn 6 ký tự vẫn cắt đúng 6 — không nuốt ký tự thừa', () => {
    // GC7QF3KDX -> khớp 'GC7QF3KD', phần thừa không thuộc mã
    expect(extractOrderCode(env, 'GC7QF3KDX')).toBe('GC7QF3KD');
  });
});

describe('orderCodeRegex', () => {
  it('theo đúng tiền tố được cấu hình', () => {
    expect(orderCodeRegex('XK').test('XK7QF3KD')).toBe(true);
    expect(orderCodeRegex('XK').test('GC7QF3KD')).toBe(false);
  });
});
