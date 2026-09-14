import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ icon: Icon, label, value, sublabel, accent, className }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border p-5 flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        {Icon && (
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: accent ? `hsl(${accent} / 0.1)` : "hsl(var(--accent))", color: accent ? `hsl(${accent})` : "hsl(var(--primary))" }}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight text-foreground">{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground">{sublabel}</div>}
    </div>
  );
}