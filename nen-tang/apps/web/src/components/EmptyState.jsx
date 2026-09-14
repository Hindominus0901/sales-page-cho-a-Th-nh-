import React from "react";
import { cn } from "@/lib/utils";

export function Loading({ label = "Đang tải...", className }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border p-10 text-center text-sm text-muted-foreground", className)}>
      {label}
    </div>
  );
}

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border p-10 text-center", className)}>
      {Icon && <Icon className="w-8 h-8 mx-auto text-muted-foreground mb-3" />}
      <p className="font-semibold">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
