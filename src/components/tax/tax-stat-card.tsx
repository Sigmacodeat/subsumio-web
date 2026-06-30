"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface TaxStatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  colorVar?: string;
  className?: string;
}

export function TaxStatCard({
  label,
  value,
  icon: Icon,
  colorVar = "--ds-text",
  className,
}: TaxStatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center transition-colors hover:border-[color:var(--ds-border-strong)]",
        className
      )}
    >
      {Icon && (
        <div className="mb-1.5 flex justify-center">
          <Icon size={16} style={{ color: `var(${colorVar})` }} />
        </div>
      )}
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className="text-xl font-bold" style={{ color: `var(${colorVar})` }}>
        {value}
      </div>
    </div>
  );
}
