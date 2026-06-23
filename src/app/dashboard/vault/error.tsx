"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function VaultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[vault error]", error);
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => {});
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]">
          <AlertCircle size={20} className="text-[color:var(--ds-danger-text)]" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-[color:var(--ds-text)]">
          Vault konnte nicht geladen werden
        </h2>
        <p className="mb-6 text-sm text-[color:var(--ds-text-muted)]">
          {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--brand-primary-hover)]"
        >
          <RotateCcw size={14} /> Erneut versuchen
        </button>
      </div>
    </div>
  );
}
