"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.captureException(error);
        })
        .catch(() => {});
    }
  }, [error]);

  return (
    <div
      data-tone="dark"
      className="flex min-h-screen items-center justify-center px-4 sm:px-6 lg:px-8 [background:var(--mk-bg)]"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-600/20">
          <AlertCircle size={26} className="text-rose-400" />
        </div>
        <p className="mb-3 font-mono text-xs text-rose-400">Error</p>
        <h1 className="mb-3 text-3xl font-black [color:var(--mk-text)]">Something went wrong.</h1>
        <p className="mb-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
          An unexpected error occurred. Try again — or head back to safety.
        </p>
        <p className="mb-10 text-xs [color:var(--mk-text-subtle)]">
          Ein Fehler ist aufgetreten. Zurück zur Startseite?
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-6 py-3 text-sm font-medium text-white shadow-lg ring-1 shadow-blue-950/40 ring-[var(--brand-primary)]/30 transition-colors hover:bg-[var(--brand-primary-hover)]"
          >
            <SubsumioMark size={15} tile={false} /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-6 py-3 text-sm [color:var(--mk-text-muted)] transition-colors hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)]"
          >
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
