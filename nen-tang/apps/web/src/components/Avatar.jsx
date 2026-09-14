import React from "react";
import { cn } from "@/lib/utils";
import { getInitials, avatarColors } from "@/lib/gamification";

export default function Avatar({ user, size = 40, ring, ringColor, showLevel, levelNumber }) {
  const sizeClass = {
    28: "w-7 h-7 text-[10px]",
    32: "w-8 h-8 text-xs",
    40: "w-10 h-10 text-sm",
    48: "w-12 h-12 text-base",
    56: "w-14 h-14 text-lg",
    64: "w-16 h-16 text-xl",
    80: "w-20 h-20 text-2xl",
    96: "w-24 h-24 text-3xl",
    112: "w-28 h-28 text-4xl"
  };
  const s = sizeClass[size] || sizeClass[40];
  const name = user?.full_name || user?.name || "?";
  const url = user?.avatar_url;

  return (
    <div className="relative inline-block shrink-0">
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-semibold text-white overflow-hidden",
          s,
          ring && "ring-2 ring-offset-2 ring-offset-background"
        )}
        style={ring ? { "--tw-ring-color": ringColor || "hsl(var(--primary))" } : {}}
      >
        {url ? (
          <img src={url} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span style={{ backgroundColor: avatarColors(name) }} className="w-full h-full flex items-center justify-center">
            {getInitials(name)}
          </span>
        )}
      </div>
      {showLevel && levelNumber != null && (
        <span className="absolute -bottom-1 -right-1 bg-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background">
          {levelNumber}
        </span>
      )}
    </div>
  );
}