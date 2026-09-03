import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--brand-primary)]" />
        <span className="text-sm text-[color:var(--ds-text-muted)]">
          Sachverhaltsprüfung wird geladen…
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className="h-[600px] animate-pulse rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-[color:var(--ds-surface-2)]" />
            ))}
          </div>
        </div>
        <div className="h-[600px] animate-pulse rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
          <div className="space-y-4">
            <div className="h-6 w-1/3 rounded bg-[color:var(--ds-surface-2)]" />
            <div className="h-32 rounded-lg bg-[color:var(--ds-surface-2)]" />
            <div className="h-32 rounded-lg bg-[color:var(--ds-surface-2)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
