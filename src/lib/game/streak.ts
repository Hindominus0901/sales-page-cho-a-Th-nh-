/**
 * Chuỗi ngày nộp bài liên tiếp.
 *
 * Tính theo NGÀY giờ Việt Nam, không theo số giờ trôi qua: nộp lúc 23h50 hôm
 * nay rồi 0h10 hôm sau vẫn là hai ngày liên tiếp, đúng như người dùng hiểu.
 */
export interface StreakState {
  current: number;
  best: number;
  lastDate: string | null;   // 'YYYY-MM-DD'
}

export interface StreakResult extends StreakState {
  /** true khi ngày này chưa từng được tính — dùng để quyết có cộng coin không. */
  counted: boolean;
  /** true khi chuỗi bị đứt và bắt đầu lại từ 1. */
  broken: boolean;
}

const dayNumber = (date: string): number => Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);

export function applyStreak(state: StreakState, submitDate: string): StreakResult {
  const { current, best, lastDate } = state;

  // Nộp lại bài của chính ngày đó: không cộng chuỗi lần nữa.
  if (lastDate === submitDate) {
    return { current, best, lastDate, counted: false, broken: false };
  }

  // Nộp bù cho ngày đã qua: vẫn ghi nhận bài, nhưng không đụng vào chuỗi —
  // chuỗi đo tính đều đặn, không đo số bài.
  if (lastDate && dayNumber(submitDate) < dayNumber(lastDate)) {
    return { current, best, lastDate, counted: false, broken: false };
  }

  const liveTiep = lastDate !== null && dayNumber(submitDate) - dayNumber(lastDate) === 1;
  const next = liveTiep ? current + 1 : 1;

  return {
    current: next,
    best: Math.max(best, next),
    lastDate: submitDate,
    counted: true,
    broken: lastDate !== null && !liveTiep,
  };
}

/** Chuỗi đã đứt chưa, tính tới hôm nay (dùng để hiện trong bảng). */
export function isStreakAlive(lastDate: string | null, today: string): boolean {
  if (!lastDate) return false;
  return dayNumber(today) - dayNumber(lastDate) <= 1;
}

/** Thưởng thêm theo chuỗi: mỗi ngày liên tiếp cộng thêm bonusPct, tối đa gấp đôi. */
export function streakMultiplier(current: number, bonusPct: number): number {
  const raw = 1 + (Math.max(0, current - 1) * bonusPct) / 100;
  return Math.min(2, raw);
}
