"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon | ReactNode;
  trend?: { value: number; positive: boolean };
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function StatsCard({ title, value, description, icon, trend, loading, className, style }: StatsCardProps) {
  if (loading) {
    return (
      <div className={cn("rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow p-5", className)} style={style}>
        <div className="flex items-start justify-between mb-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>
    );
  }

  const IconElement = typeof icon === "function" ? icon : null;
  const IconNode = icon && typeof icon !== "function" ? icon : null;

  return (
    <div className={cn("rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow p-5 transition-all duration-200 hover:card-shadow-hover hover:border-[color:var(--ds-border-strong)] hover:-translate-y-0.5", className)} style={style}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[0.6875rem] font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider">{title}</span>
        {IconElement && (
          <div className="w-10 h-10 rounded-xl brand-soft flex items-center justify-center shrink-0">
            <IconElement size={18} className="brand-text" />
          </div>
        )}
        {IconNode && (
          <div className="w-10 h-10 rounded-xl brand-soft flex items-center justify-center shrink-0">
            {IconNode}
          </div>
        )}
      </div>
      <div className="text-[2rem] font-bold text-[color:var(--ds-text)] tabular-nums tracking-tight leading-none">{value}</div>
      <div className="flex items-center gap-2 mt-2">
        {trend && (
          <span className={cn("text-xs font-semibold tabular-nums", trend.positive ? "text-emerald-600" : "text-red-600")}>
            {trend.positive ? "↑" : "↓"} {trend.positive ? "+" : ""}{trend.value}%
          </span>
        )}
        {description && <span className="text-xs text-[color:var(--ds-text-muted)] leading-relaxed">{description}</span>}
      </div>
    </div>
  );
}
