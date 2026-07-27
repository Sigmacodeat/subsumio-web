"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import type { TabularReviewRun, TabularReviewRunStatus } from "@/lib/types";

/**
 * Compact live status panel for an async tabular review run — progress bar,
 * counters, cost estimate, elapsed time / ETA, plus the partial/failed
 * banners with a retry CTA. Visual language follows PipelinePanel.
 */

const STATUS_STYLES: Record<TabularReviewRunStatus, string> = {
  queued:
    "border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)]",
  running:
    "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  done: "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  partial:
    "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  failed:
    "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

const STATUS_LABEL_KEYS: Record<TabularReviewRunStatus, DashboardKey> = {
  queued: "tabular.status_queued",
  running: "tabular.status_running",
  done: "tabular.status_done",
  partial: "tabular.status_partial",
  failed: "tabular.status_failed",
};

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")} h`;
  if (m > 0) return `${m}:${String(s % 60).padStart(2, "0")} min`;
  return `${s} s`;
}

function fmtUsd(usd: number): string {
  if (!(usd > 0)) return "—";
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

interface TabularReviewProgressProps {
  run: TabularReviewRun;
  onRetryAll: () => void;
  retrying: boolean;
}

export function TabularReviewProgress({ run, onRetryAll, retrying }: TabularReviewProgressProps) {
  const { t, lang } = useLang();
  const active = run.status === "queued" || run.status === "running";
  const terminal = !active;

  // Ticking clock for elapsed time / ETA while the run is active.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  const { total, done, failed } = run.progress;
  const processed = done + failed;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  const startedMs = run.started_at ? Date.parse(run.started_at) : NaN;
  const elapsedMs =
    Number.isFinite(startedMs) && startedMs > 0
      ? (run.finished_at ? Date.parse(run.finished_at) : now) - startedMs
      : null;
  // ETA from observed throughput (only meaningful mid-run with ≥1 finished doc).
  const etaMs =
    active && done > 0 && elapsedMs != null && elapsedMs > 0
      ? (elapsedMs / done) * Math.max(0, total - processed)
      : null;

  const num = (n: number) => n.toLocaleString(lang === "en" ? "en-US" : "de-DE");
  const estimate = run.estimate;

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      {/* Header: title + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Activity size={18} className="brand-text shrink-0" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
              {run.title}
            </h3>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.run_created").replace(
                "{{date}}",
                new Date(run.created_at).toLocaleString(lang === "en" ? "en-GB" : "de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <Badge variant="default" className={cn("border text-xs", STATUS_STYLES[run.status])}>
            {run.status === "running" && <Loader2 size={10} className="mr-1 animate-spin" />}
            {t(STATUS_LABEL_KEYS[run.status])}
          </Badge>
          {terminal && failed > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={retrying}
              onClick={onRetryAll}
            >
              {retrying ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              {t("tabular.retry_all")}
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar + counters */}
      <div className="space-y-1.5">
        <Progress value={pct} aria-label={t("tabular.progress_label")} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
          <span className="tabular-nums">
            {t("tabular.progress_summary")
              .replace("{{done}}", num(done))
              .replace("{{total}}", num(total))}
          </span>
          {failed > 0 && (
            <span className="text-[color:var(--ds-danger-text)] tabular-nums">
              · {t("tabular.progress_failed").replace("{{count}}", num(failed))}
            </span>
          )}
          {elapsedMs != null && elapsedMs > 0 && (
            <span className="tabular-nums">
              · {t("tabular.elapsed").replace("{{time}}", fmtDuration(elapsedMs))}
            </span>
          )}
          {etaMs != null && etaMs > 0 && (
            <span className="tabular-nums">
              · {t("tabular.eta").replace("{{time}}", fmtDuration(etaMs))}
            </span>
          )}
        </div>
      </div>

      {/* Cost estimate (from the run's persisted estimate) */}
      <p className="text-xs text-[color:var(--ds-text-muted)]">
        <span className="font-medium text-[color:var(--ds-text)]">
          {t("tabular.estimate_label")}:
        </span>{" "}
        {t("tabular.estimate_summary")
          .replace("{{calls}}", num(estimate.llm_calls))
          .replace("{{input}}", num(estimate.approx_input_tokens))
          .replace("{{output}}", num(estimate.approx_output_tokens))}
        {" · "}
        {t("tabular.estimate_cost").replace("{{usd}}", fmtUsd(estimate.approx_usd))}
      </p>

      {/* Terminal banners */}
      {run.status === "partial" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {t("tabular.partial_banner").replace("{{count}}", num(failed))}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={retrying}
            onClick={onRetryAll}
          >
            {retrying ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            {t("tabular.retry_all")}
          </Button>
        </div>
      )}
      {run.status === "failed" && (
        <div className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          <span>{t("tabular.failed_banner").replace("{{error}}", run.error ?? "—")}</span>
        </div>
      )}
    </div>
  );
}
