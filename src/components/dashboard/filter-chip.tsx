"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function FilterChip({
  label,
  active,
  onClick,
  onRemove,
  className: _className,
}: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
        active
          ? "brand-soft brand-text brand-border"
          : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)]"
      )}
    >
      {label}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 ml-0.5 cursor-pointer rounded p-0.5 transition-colors hover:text-[color:var(--ds-danger-text)]"
          role="button"
          aria-label={`Filter ${label} entfernen`}
        >
          <X size={13} />
        </span>
      )}
    </button>
  );
}
