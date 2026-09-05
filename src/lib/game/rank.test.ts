import { describe, it, expect } from 'vitest';
import { rankOf, parseTiers, DEFAULT_TIERS } from './rank';

describe('rankOf', () => {
  it('bắt đầu ở bậc thấp nhất', () => {
    const r = rankOf(0);
    expect(r.index).toBe(0);
    expect(r.tier.name).toBe('Mới bắt đầu');
  });

  it('đúng bậc tại mốc và ngay dưới mốc', () => {
    expect(rankOf(299).tier.name).toBe('Mới bắt đầu');
    expect(rankOf(300).tier.name).toBe('Đều đặn');
    expect(rankOf(2099).tier.name).toBe('Về đích');
    expect(rankOf(2100).tier.name).toBe('Gương sáng');
  });

  it('đi trọn 21 ngày (2100 XP) là chạm bậc cao nhất', () => {
    const r = rankOf(21 * 100);
    expect(r.index).toBe(DEFAULT_TIERS.length - 1);
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
    expect(r.xpToNext).toBe(0);
  });

  it('XP vượt mốc cao nhất vẫn giữ bậc cao nhất, không lỗi', () => {
    expect(rankOf(999999).tier.name).toBe('Gương sáng');
  });

  it('tính đúng phần đường tới bậc kế tiếp', () => {
    const r = rankOf(600);           // giữa 300 và 900
    expect(r.tier.name).toBe('Đều đặn');
    expect(r.next?.name).toBe('Bền bỉ');
    expect(r.progress).toBeCloseTo(0.5);
    expect(r.xpToNext).toBe(300);
  });

  it('bậc truyền vào không theo thứ tự vẫn xếp đúng', () => {
    const lungtung = [
      { name: 'Cao', icon: 'c', minXp: 100 },
      { name: 'Thấp', icon: 't', minXp: 0 },
    ];
    expect(rankOf(150, lungtung).tier.name).toBe('Cao');
    expect(rankOf(50, lungtung).tier.name).toBe('Thấp');
  });
});

describe('parseTiers', () => {
  it('JSON hợp lệ thì dùng', () => {
    const t = parseTiers('[{"name":"A","icon":"a","minXp":0}]');
    expect(t).toHaveLength(1);
  });
  it('JSON hỏng thì rơi về mặc định — trang không được vỡ vì một lần sửa sai', () => {
    expect(parseTiers('{hỏng')).toBe(DEFAULT_TIERS);
    expect(parseTiers(null)).toBe(DEFAULT_TIERS);
    expect(parseTiers('[]')).toBe(DEFAULT_TIERS);
    expect(parseTiers('"chuỗi"')).toBe(DEFAULT_TIERS);
  });
  it('bỏ phần tử thiếu trường, giữ phần tử hợp lệ', () => {
    expect(parseTiers('[{"name":"A","icon":"a","minXp":0},{"name":"B"}]')).toHaveLength(1);
  });
});
