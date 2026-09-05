import { describe, it, expect } from 'vitest';
import { applyStreak, isStreakAlive, streakMultiplier } from './streak';

const s = (current = 0, best = 0, lastDate: string | null = null) => ({ current, best, lastDate });

describe('applyStreak', () => {
  it('bài đầu tiên bắt đầu chuỗi từ 1', () => {
    const r = applyStreak(s(), '2026-09-01');
    expect(r).toMatchObject({ current: 1, best: 1, lastDate: '2026-09-01', counted: true, broken: false });
  });

  it('nộp ngày liền kề thì chuỗi tăng', () => {
    const r = applyStreak(s(3, 5, '2026-09-01'), '2026-09-02');
    expect(r.current).toBe(4);
    expect(r.counted).toBe(true);
    expect(r.broken).toBe(false);
  });

  it('nghỉ một ngày thì chuỗi đứt, đếm lại từ 1 nhưng giữ kỷ lục', () => {
    const r = applyStreak(s(7, 7, '2026-09-01'), '2026-09-03');
    expect(r.current).toBe(1);
    expect(r.best).toBe(7);
    expect(r.broken).toBe(true);
  });

  it('kỷ lục chỉ tăng, không bao giờ giảm', () => {
    const r = applyStreak(s(2, 9, '2026-09-01'), '2026-09-02');
    expect(r.best).toBe(9);
  });

  it('nộp lại bài của chính ngày đó không cộng chuỗi lần hai', () => {
    const r = applyStreak(s(4, 4, '2026-09-02'), '2026-09-02');
    expect(r.current).toBe(4);
    expect(r.counted).toBe(false);
  });

  it('nộp bù ngày đã qua thì không đụng vào chuỗi', () => {
    const r = applyStreak(s(5, 5, '2026-09-10'), '2026-09-08');
    expect(r).toMatchObject({ current: 5, lastDate: '2026-09-10', counted: false, broken: false });
  });

  it('qua tháng vẫn tính đúng là liên tiếp', () => {
    expect(applyStreak(s(3, 3, '2026-08-31'), '2026-09-01').current).toBe(4);
  });

  it('qua năm vẫn tính đúng là liên tiếp', () => {
    expect(applyStreak(s(3, 3, '2026-12-31'), '2027-01-01').current).toBe(4);
  });

  it('đi trọn 21 ngày liên tiếp ra chuỗi 21', () => {
    let st = s();
    for (let d = 1; d <= 21; d++) {
      st = applyStreak(st, `2026-09-${String(d).padStart(2, '0')}`);
    }
    expect(st.current).toBe(21);
    expect(st.best).toBe(21);
  });
});

describe('isStreakAlive', () => {
  it('nộp hôm nay hoặc hôm qua thì chuỗi còn sống', () => {
    expect(isStreakAlive('2026-09-05', '2026-09-05')).toBe(true);
    expect(isStreakAlive('2026-09-04', '2026-09-05')).toBe(true);
  });
  it('nghỉ từ hai ngày trở lên là đứt', () => {
    expect(isStreakAlive('2026-09-03', '2026-09-05')).toBe(false);
  });
  it('chưa nộp bài nào thì không có chuỗi', () => {
    expect(isStreakAlive(null, '2026-09-05')).toBe(false);
  });
});

describe('streakMultiplier', () => {
  it('ngày đầu chưa có thưởng thêm', () => {
    expect(streakMultiplier(1, 10)).toBe(1);
  });
  it('mỗi ngày liên tiếp cộng thêm đúng phần trăm đã đặt', () => {
    expect(streakMultiplier(3, 10)).toBeCloseTo(1.2);
  });
  it('chặn trần ở gấp đôi, chuỗi dài mấy cũng không vượt', () => {
    expect(streakMultiplier(100, 10)).toBe(2);
  });
  it('tắt thưởng thì luôn là 1', () => {
    expect(streakMultiplier(21, 0)).toBe(1);
  });
});
