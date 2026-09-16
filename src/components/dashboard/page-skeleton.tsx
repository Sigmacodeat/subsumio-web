import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Page-shaped loading state (header + content rows). Used by every route's
 * `loading.tsx` and by pages while their first data loads — instead of a
 * centered spinner or a "Lade …" line. Spinners stay on buttons only.
 */
export function PageSkeleton({
  rows = 6,
  withStats = false,
  className,
}: {
  rows?: number;
  withStats?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6 p-4 md:p-6 lg:p-8", className)} role="status" aria-live="polite">
      <span className="sr-only">Wird geladen</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {withStats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 rounded-lg"
            style={{ width: `${100 - (i % 3) * 6}%` }}
          />
        ))}
      </div>
    </div>
  );
}
