"use client";

import { cn } from "@/lib/utils";

interface ChatLoadingSkeletonProps {
  className?: string;
  lines?: number;
}

export function ChatLoadingSkeleton({ className, lines = 4 }: ChatLoadingSkeletonProps) {
  return (
    <div
      className={cn("space-y-3 px-4 py-4", className)}
      role="status"
      aria-live="polite"
      aria-label="Antwort wird geladen"
    >
      <div className="flex gap-3">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-[color:var(--ds-surface-2)]" />
        <div className="flex-1 space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className="h-3.5 animate-pulse rounded bg-[color:var(--ds-surface-2)]"
              style={{
                width: `${Math.max(40, 100 - i * 12)}%`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
          <div className="flex gap-2 pt-1">
            <div className="h-5 w-16 animate-pulse rounded-full bg-[color:var(--ds-surface-2)]" />
            <div className="h-5 w-20 animate-pulse rounded-full bg-[color:var(--ds-surface-2)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
