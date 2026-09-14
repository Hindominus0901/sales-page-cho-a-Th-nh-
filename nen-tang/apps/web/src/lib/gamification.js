// Client-side gamification helpers (mirrors backend shared/scoring.ts)
export function computeLevel(totalXp, levels) {
  if (!levels || levels.length === 0) {
    return { levelNumber: 1, name: "Khởi động", icon: "🌱", thresholdXp: 0, nextThreshold: 500, progress: 0, xpIntoLevel: 0, xpToNext: 500 };
  }
  const sorted = [...levels].sort((a, b) => a.level_number - b.level_number);
  let current = sorted[0];
  let next = sorted[1] || null;
  for (let i = 0; i < sorted.length; i++) {
    if (totalXp >= sorted[i].threshold_xp) {
      current = sorted[i];
      next = sorted[i + 1] || null;
    } else break;
  }
  const currentThreshold = current.threshold_xp;
  const nextThreshold = next ? next.threshold_xp : current.threshold_xp;
  const xpIntoLevel = totalXp - currentThreshold;
  const xpToNext = next ? nextThreshold - totalXp : 0;
  const span = next ? nextThreshold - currentThreshold : 1;
  const progress = next ? Math.min(100, Math.round((xpIntoLevel / span) * 100)) : 100;
  return { levelNumber: current.level_number, name: current.name, icon: current.icon || "⭐", thresholdXp: currentThreshold, nextThreshold, progress, xpIntoLevel, xpToNext };
}

export function formatNumber(n) {
  return (n || 0).toLocaleString('vi-VN');
}

export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.slice(-2).map(p => p[0]).join("").toUpperCase();
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export function avatarColors(name) {
  const colors = ["#FF0FA3", "#FF4DB8", "#F4B400", "#C9804D", "#7C3AED", "#0891B2", "#059669", "#DC2626"];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}