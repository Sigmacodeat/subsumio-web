"use client";

/**
 * Frame for product replicas in the Handbuch. Everything inside renders in the
 * dashboard token scope (`data-app="dashboard"`), so colours, radii, shadows
 * and type are the product's own — the replicas use the real components.
 */

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { cn } from "@/lib/utils";

export function ReplicaFrame({
  path,
  caption,
  interactive = false,
  children,
  className,
}: {
  /** Breadcrumb shown in the frame's title bar, e.g. ["Fristen", "Fristenbuch"]. */
  path: string[];
  caption?: string;
  /** Static replicas are inert: links and buttons inside do nothing. */
  interactive?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  // Replicas are dated relative to today (agenda, reminders, calculator), so
  // they render on the client only — server and browser clocks would disagree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <figure className={cn("my-8", className)}>
      <div
        data-app="dashboard"
        className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] text-[color:var(--ds-text)] shadow-[var(--ds-shadow-2)]"
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--ds-border-strong)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--ds-border-strong)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--ds-border-strong)]" />
          </span>
          <span className="ml-2 flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
            <SubsumioMark size={16} animated={false} className="shrink-0" />
            <span className="font-medium text-[color:var(--ds-text)]">Subsumio</span>
            {path.map((p) => (
              <span key={p} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight size={12} aria-hidden className="shrink-0" />
                <span className="truncate">{p}</span>
              </span>
            ))}
          </span>
        </div>
        <div className="p-3 sm:p-5" {...(interactive ? {} : { inert: true, "aria-hidden": true })}>
          {mounted ? (
            children
          ) : (
            <div className="h-72 animate-pulse rounded-lg bg-[color:var(--ds-surface-2)]" />
          )}
        </div>
      </div>
      {caption && (
        <figcaption className="mt-3 text-center text-xs text-[color:var(--mk-text-muted)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
