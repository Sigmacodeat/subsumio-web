import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <nav className={cn("flex items-center gap-1", className)} aria-label="Pagination">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)] disabled:pointer-events-none disabled:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((page, i) => (
        <React.Fragment key={i}>
          {page === "ellipsis" ? (
            <span className="flex h-9 w-9 items-center justify-center text-[color:var(--ds-text-muted)]">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          ) : (
            <button
              onClick={() => onPageChange(page as number)}
              className={cn(
                "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors",
                page === currentPage
                  ? "border-[color:var(--ds-accent)] bg-[color:var(--ds-accent)]/10 text-[color:var(--ds-accent)]"
                  : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)]"
              )}
            >
              {page}
            </button>
          )}
        </React.Fragment>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-surface-2)] disabled:pointer-events-none disabled:opacity-50"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3)
    return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}
