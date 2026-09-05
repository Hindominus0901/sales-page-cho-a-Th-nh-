import { describe, it, expect } from 'vitest';
import { scoreLead, mergeScore, bandOf, SCORING_VERSION } from './rules';

const perfect = {
  budget: 'ready_2m',
  timeline: 'now',
  dailyTime: 'over_2h',
  channel: 'has_1k_10k',
  goal: 'get_clients',
  attendedWorkshop: true,
  phoneValid: true,
  email: 'a@vidu.com',
  facebookUrl: 'https://fb.com/a',
  freeText: ['Không biết bắt đầu từ đâu', 'Muốn có khách đều'],
};

describe('scoreLead', () => {
  it('lead lý tưởng đạt 100 và band nóng', () => {
    const r = scoreLead(perfect);
    expect(r.score).toBe(100);
    expect(r.band).toBe('hot');
    expect(r.version).toBe(SCORING_VERSION);
  });

  it('lead rỗng hoàn toàn được 0 và band lạnh', () => {
    const r = scoreLead({});
    expect(r.score).toBe(0);
    expect(r.band).toBe('cold');
    expect(r.breakdown).toHaveLength(0);
  });

  it('điểm không bao giờ âm dù bị trừ nhiều', () => {
    const r = scoreLead({
      budget: 'not_ready',
      timeline: 'unsure',
      duplicateWithin24h: true,
      freeText: ['', '  '],
    });
    expect(r.score).toBe(0);
  });

  it('điểm luôn nằm trong 0..100', () => {
    for (const input of [perfect, {}, { budget: 'ready_2m' }]) {
      const s = scoreLead(input).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('ngân sách là nhóm nặng điểm nhất', () => {
    const withBudget = scoreLead({ budget: 'ready_2m' }).score;
    const withTimeline = scoreLead({ timeline: 'now' }).score;
    const withGoal = scoreLead({ goal: 'get_clients' }).score;
    expect(withBudget).toBeGreaterThan(withTimeline);
    expect(withTimeline).toBeGreaterThan(withGoal);
  });

  it('"chưa có kênh" vẫn được điểm — đây vẫn là tệp mục tiêu', () => {
    const r = scoreLead({ channel: 'none_yet' });
    expect(r.score).toBeGreaterThan(0);
    expect(r.breakdown.find((l) => l.rule === 'channel')?.points).toBe(5);
  });

  it('khoá học giá trị nhất với người đã dự workshop', () => {
    const attended = scoreLead({ ...perfect, attendedWorkshop: true, viaAffiliate: false });
    const viaAff = scoreLead({ ...perfect, attendedWorkshop: false, viaAffiliate: true });
    const cold = scoreLead({ ...perfect, attendedWorkshop: false, viaAffiliate: false });
    expect(attended.score).toBeGreaterThan(viaAff.score);
    expect(viaAff.score).toBeGreaterThan(cold.score);
  });

  it('nguồn workshop và affiliate không cộng dồn', () => {
    const r = scoreLead({ attendedWorkshop: true, viaAffiliate: true });
    expect(r.breakdown.filter((l) => l.rule === 'source')).toHaveLength(1);
  });

  it('gửi trùng trong 24h bị trừ điểm', () => {
    const a = scoreLead({ ...perfect, duplicateWithin24h: false }).score;
    const b = scoreLead({ ...perfect, duplicateWithin24h: true }).score;
    expect(b).toBeLessThan(a);
  });

  it('bỏ trống toàn bộ câu tự luận bị trừ điểm', () => {
    const a = scoreLead({ budget: 'ready_2m', freeText: ['câu trả lời thật'] }).score;
    const b = scoreLead({ budget: 'ready_2m', freeText: ['', 'a'] }).score;
    expect(b).toBeLessThan(a);
  });

  it('chỉ một câu tự luận có nội dung là không bị trừ', () => {
    const r = scoreLead({ freeText: ['', 'có nội dung thật ở đây'] });
    expect(r.breakdown.find((l) => l.rule === 'empty_text')).toBeUndefined();
  });

  it('không có câu tự luận nào thì không bị trừ', () => {
    const r = scoreLead({ budget: 'ready_2m' });
    expect(r.breakdown.find((l) => l.rule === 'empty_text')).toBeUndefined();
  });

  it('giá trị lạ trong form bị bỏ qua, không làm vỡ điểm', () => {
    const r = scoreLead({ budget: 'khong-ton-tai', timeline: 'now' });
    expect(r.breakdown.find((l) => l.rule === 'budget')).toBeUndefined();
    expect(r.score).toBeGreaterThan(0);
  });

  it('breakdown luôn có nhãn tiếng Việt đọc được', () => {
    for (const line of scoreLead(perfect).breakdown) {
      expect(line.label.length).toBeGreaterThan(5);
      expect(line.label).toContain(':');
    }
  });

  it('tổng breakdown khớp với điểm đã chuẩn hoá', () => {
    const r = scoreLead(perfect);
    const raw = r.breakdown.reduce((s, l) => s + l.points, 0);
    expect(Math.round((raw / 110) * 100)).toBe(r.score);
  });
});

describe('bandOf — ranh giới', () => {
  it.each([
    [100, 'hot'], [70, 'hot'],
    [69, 'warm'], [40, 'warm'],
    [39, 'cold'], [0, 'cold'],
  ] as const)('điểm %i => %s', (score, band) => {
    expect(bandOf(score)).toBe(band);
  });
});

describe('mergeScore — form sau chỉ được nâng điểm', () => {
  const low = scoreLead({ phoneValid: true });
  const high = scoreLead(perfect);

  it('không có điểm cũ thì lấy điểm mới', () => {
    expect(mergeScore(null, low)).toBe(low);
  });

  it('form tư vấn đầy đủ nâng điểm của lead workshop', () => {
    expect(mergeScore(low, high)).toBe(high);
  });

  it('form ngắn KHÔNG hạ điểm của lead đã chấm kỹ', () => {
    expect(mergeScore(high, low)).toBe(high);
  });

  it('điểm bằng nhau thì lấy bản mới (breakdown mới hơn)', () => {
    expect(mergeScore(low, { ...low })).not.toBe(low);
  });
});
