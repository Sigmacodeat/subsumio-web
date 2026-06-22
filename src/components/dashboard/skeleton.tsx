import { cn } from "@/lib/utils";

/**
 * Skeleton shimmer for loading states.
 * Matches the design system's surface/border tokens.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-lg", className)} aria-hidden="true" />;
}

/** Stat card skeleton — matches the dashboard stat card layout */
export function StatCardSkeleton() {
  return (
    <div className="card-shadow rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="mb-2 flex items-start justify-between">
        <Skeleton className="h-3 w-16 rounded" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
      <Skeleton className="mb-2 h-8 w-20" />
    </div>
  );
}

/** Row skeleton — for lists, recent queries, etc. */
export function RowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
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
    <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        <div className="space-y-6 md:col-span-2 lg:col-span-2 lg:space-y-8">
          <div className="card-shadow rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="border-b border-[color:var(--ds-border)] p-5 pb-4">
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <RowSkeleton count={3} />
          </div>
          <div className="card-shadow rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="border-b border-[color:var(--ds-border)] p-5 pb-4">
              <Skeleton className="h-4 w-32 rounded" />
            </div>
            <RowSkeleton count={3} />
          </div>
        </div>
        <div className="space-y-6 lg:space-y-8">
          <div className="card-shadow rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <div className="border-b border-[color:var(--ds-border)] p-5 pb-4">
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <div className="space-y-1 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
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
