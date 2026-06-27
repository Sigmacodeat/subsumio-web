"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
          <Icon size={26} className="text-[color:var(--ds-text-subtle)]" />
        </div>
      )}
      <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
