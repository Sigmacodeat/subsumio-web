"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function WordAddinError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[word-addin error]", error);
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs")
        .then((Sentry) => Sentry.captureException(error))
        .catch(() => {});
    }
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-sm">
        <div className="w-12 h-12 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={20} className="text-rose-400" />
        </div>
        <h2 className="text-lg font-semibold text-[color:var(--ds-text)] mb-2">
          Modul konnte nicht geladen werden
        </h2>
        <p className="text-sm text-[color:var(--ds-text-muted)] mb-6">
          {error.message || "Ein unerwarteter Fehler ist aufgetreten."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary-hover)] text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          <RotateCcw size={14} /> Erneut versuchen
        </button>
      </div>
    </div>
  );
}
