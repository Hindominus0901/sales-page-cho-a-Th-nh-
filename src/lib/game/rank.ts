export interface RankTier {
  name: string;
  icon: string;
  minXp: number;
}

/** Bậc mặc định. Đi trọn 21 ngày (21 × 100 XP) là chạm bậc cao nhất. */
export const DEFAULT_TIERS: RankTier[] = [
  { name: 'Mới bắt đầu', icon: '🌱', minXp: 0 },
  { name: 'Đều đặn',     icon: '🌿', minXp: 300 },
  { name: 'Bền bỉ',      icon: '🌳', minXp: 900 },
  { name: 'Về đích',     icon: '🏅', minXp: 1600 },
  { name: 'Gương sáng',  icon: '👑', minXp: 2100 },
];

export interface RankInfo {
  index: number;
  tier: RankTier;
  next: RankTier | null;
  /** 0..1 — đã đi được bao nhiêu phần đường tới bậc kế tiếp. */
  progress: number;
  xpToNext: number;
}

/**
 * Bậc hiện tại theo XP. Nhận danh sách bậc từ cài đặt để anh Thành đổi mốc mà
 * không cần deploy lại; danh sách hỏng thì rơi về bậc mặc định.
 */
export function rankOf(xp: number, tiers: RankTier[] = DEFAULT_TIERS): RankInfo {
  const list = [...(tiers.length ? tiers : DEFAULT_TIERS)].sort((a, b) => a.minXp - b.minXp);
  let index = 0;
  for (let i = 0; i < list.length; i++) {
    if (xp >= list[i]!.minXp) index = i;
  }
  const tier = list[index]!;
  const next = list[index + 1] ?? null;
  const span = next ? next.minXp - tier.minXp : 0;
  return {
    index,
    tier,
    next,
    progress: next && span > 0 ? Math.min(1, (xp - tier.minXp) / span) : 1,
    xpToNext: next ? Math.max(0, next.minXp - xp) : 0,
  };
}

export function parseTiers(json: string | null | undefined): RankTier[] {
  if (!json) return DEFAULT_TIERS;
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return DEFAULT_TIERS;
    const ok = v.filter((t): t is RankTier =>
      t && typeof t.name === 'string' && typeof t.minXp === 'number');
    return ok.length ? ok : DEFAULT_TIERS;
  } catch {
    return DEFAULT_TIERS;
  }
}
