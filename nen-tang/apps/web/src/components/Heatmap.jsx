import React, { useMemo } from "react";
import { todayKey } from "@/lib/format";

const TOTAL_DAYS = 98; // 14 tuan x 7 ngay, dung nhu ban thiet ke
const LEVEL_BG = [
  "hsl(var(--muted))",
  "hsl(var(--primary) / 0.28)",
  "hsl(var(--primary) / 0.55)",
  "hsl(var(--primary) / 0.8)",
  "hsl(var(--primary))",
];

/** 0 hoat dong -> o xam; cang nhieu cang dam, toi da 4 muc. */
function intensity(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * Luoi hoat dong 98 ngay kieu GitHub.
 *
 * @param {Record<string, number>} counts - so hoat dong theo khoa YYYY-MM-DD
 */
export default function Heatmap({ counts = {} }) {
  const weeks = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (TOTAL_DAYS - 1));

    const out = [];
    for (let w = 0; w < TOTAL_DAYS / 7; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = todayKey(date);
        const count = counts[key] || 0;
        days.push({
          key,
          level: intensity(count),
          title: count
            ? `${date.toLocaleDateString('vi-VN')} · ${count} hoạt động`
            : `${date.toLocaleDateString('vi-VN')} · Không có hoạt động`,
        });
      }
      out.push(days);
    }
    return out;
  }, [counts]);

  return (
    <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-bold">Hoạt động theo ngày</h3>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Ít
          {LEVEL_BG.slice(1).map((bg) => (
            <span key={bg} className="w-[11px] h-[11px] rounded-[3px]" style={{ background: bg }} />
          ))}
          Nhiều
        </div>
      </div>
      <div className="flex gap-[3px] overflow-x-auto pb-2">
        {weeks.map((days, wi) => (
          <div key={wi} className="grid gap-[3px]" style={{ gridTemplateRows: "repeat(7, 11px)" }}>
            {days.map((d) => (
              <div
                key={d.key}
                title={d.title}
                className="w-[11px] h-[11px] rounded-[3px]"
                style={{ background: LEVEL_BG[d.level] }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
