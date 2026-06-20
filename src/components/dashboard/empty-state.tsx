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

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)]", className)}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mb-5">
          <Icon size={26} className="text-[color:var(--ds-text-subtle)]" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">{title}</h3>
      {description && <p className="mt-2 text-xs text-[color:var(--ds-text-muted)] max-w-sm leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
