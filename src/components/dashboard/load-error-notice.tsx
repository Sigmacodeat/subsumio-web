"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A failed load is not an empty list: this shows the error with a retry
 * button in place of the empty state.
 */
export function LoadErrorNotice({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2.5"
    >
      <AlertCircle size={14} className="shrink-0 text-[color:var(--ds-danger-text)]" />
      <span className="min-w-0 flex-1 text-xs text-[color:var(--ds-danger-text)]">{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={retrying}>
          <RotateCw
            size={12}
            aria-hidden="true"
            className={retrying ? "animate-spin" : undefined}
          />
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}
