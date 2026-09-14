import React from "react";
import { cn } from "@/lib/utils";

export default function ProgressCard({ label, current, target, icon: Icon, accent }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const done = current >= target;
  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className={cn("text-sm font-semibold", done ? "text-primary" : "text-muted-foreground")}>
          {current} / {target}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: done ? "hsl(var(--primary))" : (accent || "hsl(var(--primary))") }}
        />
      </div>
    </div>
  );
}