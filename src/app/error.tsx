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
      import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      }).catch(() => {});
    }
  }, [error]);

  return (
    <div data-tone="dark" className="min-h-screen bg-[#06060f] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center mx-auto mb-8">
          <AlertCircle size={26} className="text-rose-400" />
        </div>
        <p className="text-xs font-mono text-rose-400 mb-3">Error</p>
        <h1 className="text-3xl font-black text-[#e8e8f0] mb-3">
          Something went wrong.
        </h1>
        <p className="text-sm text-[#8888aa] leading-relaxed mb-3">
          An unexpected error occurred. Try again — or head back to safety.
        </p>
        <p className="text-xs text-[#7878a0] mb-10">
          Ein Fehler ist aufgetreten. Zurück zur Startseite?
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-sm font-medium px-6 py-3 rounded-lg shadow-lg shadow-blue-950/40 ring-1 ring-[var(--brand-primary)]/30 transition-colors"
          >
            <SubsumioMark size={15} tile={false} /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#8888aa] hover:text-[#e8e8f0] border border-[#1e1e3a] hover:border-[#3a3a6a] px-6 py-3 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
