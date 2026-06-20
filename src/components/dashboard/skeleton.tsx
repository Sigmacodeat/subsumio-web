import { cn } from "@/lib/utils";

/**
 * Skeleton shimmer for loading states.
 * Matches the design system's surface/border tokens.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-[color:var(--ds-border)]/40",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** Stat card skeleton — matches the dashboard stat card layout */
export function StatCardSkeleton() {
  return (
    <div className="p-5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow">
      <div className="flex items-start justify-between mb-2">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
    </div>
  );
}

/** Row skeleton — for lists, recent queries, etc. */
export function RowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3.5">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page loading skeleton for dashboard pages */
export function PageSkeleton() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="md:col-span-2 lg:col-span-2 space-y-6 lg:space-y-8">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow">
            <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <RowSkeleton count={3} />
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow">
            <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
              <Skeleton className="h-4 w-32 rounded" />
            </div>
            <RowSkeleton count={3} />
          </div>
        </div>
        <div className="space-y-6 lg:space-y-8">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow">
            <div className="p-5 pb-4 border-b border-[color:var(--ds-border)]">
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <div className="p-3 space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
