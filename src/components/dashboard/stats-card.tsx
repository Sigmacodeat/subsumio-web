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

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  loading,
  className,
  style,
}: StatsCardProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "card-shadow rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5",
          className
        )}
        style={style}
      >
        <div className="mb-2 flex items-start justify-between">
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
    <div
      className={cn(
        "card-shadow hover:card-shadow-hover rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 transition-[background-color,border-color,color,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-strong)]",
        className
      )}
      style={style}
    >
      <div className="mb-2 flex items-start justify-between">
        <span className="text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
          {title}
        </span>
        {IconElement && (
          <div className="brand-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <IconElement size={18} className="brand-text" />
          </div>
        )}
        {IconNode && (
          <div className="brand-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            {IconNode}
          </div>
        )}
      </div>
      <div className="text-[2rem] leading-none font-bold tracking-tight text-[color:var(--ds-text)] tabular-nums">
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              trend.positive
                ? "text-[color:var(--ds-success-text)]"
                : "text-[color:var(--ds-danger-text)]"
            )}
          >
            {trend.positive ? "↑" : "↓"} {trend.positive ? "+" : ""}
            {trend.value}%
          </span>
        )}
        {description && (
          <span className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
