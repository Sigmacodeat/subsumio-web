import { cn } from "@/lib/utils";

/**
 * Skeleton — Lade-Placeholder der das echte Layout spiegelt.
 *
 * Shimmer via `animate-pulse`; `motion-reduce:animate-none` respektiert
 * prefers-reduced-motion. Nutzt `--ds-*` Tokens für Dark-Mode-Konsistenz.
 *
 * @example
 * <Skeleton className="h-3 w-3/4" />           // Textzeile
 * <Skeleton className="h-12 w-12 rounded-full" /> // Avatar
 * <Skeleton className="h-5 w-12" />            // Badge
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded bg-[color:var(--ds-surface-2)] animate-pulse motion-reduce:animate-none",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
