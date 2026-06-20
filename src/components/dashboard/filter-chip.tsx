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

export function FilterChip({ label, active, onClick, onRemove, className: _className }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)]",
        active
          ? "brand-soft brand-text brand-border"
          : "bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] border-[color:var(--ds-border)] hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)]"
      )}
    >
      {label}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 -mr-0.5 cursor-pointer hover:text-red-500 transition-colors p-0.5 rounded"
          role="button"
          aria-label={`Filter ${label} entfernen`}
        >
          <X size={13} />
        </span>
      )}
    </button>
  );
}
