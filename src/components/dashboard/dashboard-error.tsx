"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useLang } from "@/lib/use-lang";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Optional module-specific title key, e.g. "agents". Falls back to generic. */
  moduleKey?: string;
}

export function DashboardError({ error, reset, moduleKey }: DashboardErrorProps) {
  const { t } = useLang();

  useEffect(() => {
    console.error(`[dashboard error${moduleKey ? `:${moduleKey}` : ""}]`, error);
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs")
        .then((Sentry) => Sentry.captureException(error))
        .catch(() => {});
    }
  }, [error, moduleKey]);

  const title = moduleKey
    ? (t as (key: string) => string)(`error.${moduleKey}_title`)
    : t("dashboard.error_title");
  const defaultMsg = t("dashboard.error_default");
  const retry = t("dashboard.retry_btn");

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-600/20">
          <AlertCircle size={20} className="text-rose-400" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-[color:var(--ds-text)]">{title}</h2>
        <p className="mb-6 text-sm text-[color:var(--ds-text-muted)]">
          {error.message || defaultMsg}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[color:var(--brand-primary-hover)]"
        >
          <RotateCcw size={14} /> {retry}
        </button>
      </div>
    </div>
  );
}
