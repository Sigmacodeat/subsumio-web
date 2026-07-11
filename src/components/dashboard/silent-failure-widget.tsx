"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, AlertCircle, Loader2, Clock, XCircle } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FailureEntry {
  caseSlug: string;
  caseTitle: string;
  severity: "critical" | "warning" | "stuck";
  message: string;
  layer?: number;
  href: string;
  timestamp?: string;
}

interface PipelineStatePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

async function fetchSilentFailures(): Promise<FailureEntry[]> {
  const pages = await api.brain.listPages({ type: "pipeline_state", limit: 100 });
  const entries: FailureEntry[] = [];

  for (const page of pages as PipelineStatePage[]) {
    const fm = page.frontmatter ?? {};
    const caseSlug = String(fm.case_ref ?? page.slug.replace("pipeline/state-", ""));
    const caseTitle = String(fm.title ?? caseSlug).replace(/^Pipeline-State — /, "");
    const status = String(fm.status ?? "unknown");
    const encoded = caseSlug.split("/").map(encodeURIComponent).join("/");
    const href = `/dashboard/cases/${encoded}`;

    // Parse full state from content
    let layers: Record<number, { status: string; error?: string; started_at?: string }> = {};
    let warnings: string[] = [];
    let updatedAt: string | undefined = page.updated_at;

    try {
      const raw = page.content ?? "";
      const parsed = JSON.parse(raw) as {
        layers?: typeof layers;
        warnings?: string[];
        updated_at?: string;
      };
      if (parsed.layers) layers = parsed.layers;
      if (parsed.warnings) warnings = parsed.warnings;
      if (parsed.updated_at) updatedAt = parsed.updated_at;
    } catch {
      // fallback to frontmatter only
    }

    // 1. Failed pipelines
    if (status === "failed") {
      const failedLayer = Object.entries(layers).find(([, v]) => v.status === "failed");
      entries.push({
        caseSlug,
        caseTitle,
        severity: "critical",
        message: failedLayer?.[1]?.error ?? "Pipeline failed",
        layer: failedLayer ? Number(failedLayer[0]) : undefined,
        href,
        timestamp: updatedAt,
      });
    }

    // 2. Needs human review
    if (status === "needs_human_review") {
      entries.push({
        caseSlug,
        caseTitle,
        severity: "critical",
        message: "Ensemble critic rejected output — human review required",
        href,
        timestamp: updatedAt,
      });
    }

    // 3. Completed with warnings
    if (status === "completed_with_warnings") {
      entries.push({
        caseSlug,
        caseTitle,
        severity: "warning",
        message: warnings[0] ?? "Pipeline completed with warnings",
        href,
        timestamp: updatedAt,
      });
    }

    // 4. Individual failed layers (even if overall status isn't "failed")
    for (const [layerStr, layer] of Object.entries(layers)) {
      if (layer.status === "failed" && status !== "failed") {
        entries.push({
          caseSlug,
          caseTitle,
          severity: "critical",
          message: layer.error ?? `Layer ${layerStr} failed`,
          layer: Number(layerStr),
          href,
          timestamp: updatedAt,
        });
      }
    }

    // 5. Warnings (non-status warnings)
    if (
      warnings.length > 0 &&
      status !== "failed" &&
      status !== "needs_human_review" &&
      status !== "completed_with_warnings"
    ) {
      for (const w of warnings.slice(0, 2)) {
        entries.push({
          caseSlug,
          caseTitle,
          severity: "warning",
          message: w,
          href,
          timestamp: updatedAt,
        });
      }
    }

    // 6. Stuck pipelines (running for > 30 min)
    if (status === "running" || status === "resuming") {
      const runningLayer = Object.entries(layers).find(([, v]) => v.status === "running");
      const startedAt = runningLayer?.[1]?.started_at;
      if (startedAt) {
        const elapsed = Date.now() - new Date(startedAt).getTime();
        if (elapsed > STUCK_THRESHOLD_MS) {
          entries.push({
            caseSlug,
            caseTitle,
            severity: "stuck",
            message: `Pipeline stuck on layer ${runningLayer![0]} for ${Math.round(elapsed / 60_000)} min`,
            layer: Number(runningLayer![0]),
            href,
            timestamp: startedAt,
          });
        }
      }
    }
  }

  // Sort: critical first, then stuck, then warning
  const severityOrder = { critical: 0, stuck: 1, warning: 2 };
  return entries.sort((a, b) => {
    const orderDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (orderDiff !== 0) return orderDiff;
    return (a.timestamp ?? "").localeCompare(b.timestamp ?? "");
  });
}

const severityConfig = {
  critical: {
    icon: XCircle,
    label: "Critical",
    labelDe: "Kritisch",
    classes:
      "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
    borderClasses: "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]",
    iconColor: "text-[color:var(--ds-danger-text)]",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    labelDe: "Warnung",
    classes:
      "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
    borderClasses: "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]",
    iconColor: "text-[color:var(--ds-warning-text)]",
  },
  stuck: {
    icon: Clock,
    label: "Stuck",
    labelDe: "Stecken geblieben",
    classes:
      "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    borderClasses: "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]",
    iconColor: "text-[color:var(--ds-info-text)]",
  },
};

export function SilentFailureWidget() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const { data, isLoading } = useQuery<FailureEntry[]>({
    queryKey: ["silent-failures"],
    queryFn: fetchSilentFailures,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const counts = useMemo(() => {
    if (!data) return { critical: 0, warning: 0, stuck: 0, total: 0 };
    return {
      critical: data.filter((e) => e.severity === "critical").length,
      warning: data.filter((e) => e.severity === "warning").length,
      stuck: data.filter((e) => e.severity === "stuck").length,
      total: data.length,
    };
  }, [data]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertCircle size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Errors & Warnings" : "Fehler & Warnungen"}
          </span>
        </div>
        <div className="flex h-20 items-center justify-center">
          <Loader2 size={18} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertCircle size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Errors & Warnings" : "Fehler & Warnungen"}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {isEn
            ? "Everything is running smoothly — no errors or warnings."
            : "Alles läuft reibungslos — keine Fehler oder Warnungen."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Errors & Warnings" : "Fehler & Warnungen"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {counts.critical > 0 && (
            <span className="rounded-full border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-danger-text)]">
              {counts.critical} {isEn ? "critical" : "kritisch"}
            </span>
          )}
          {counts.stuck > 0 && (
            <span className="rounded-full border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-info-text)]">
              {counts.stuck} {isEn ? "stuck" : "stuck"}
            </span>
          )}
          {counts.warning > 0 && (
            <span className="rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-warning-text)]">
              {counts.warning} {isEn ? "warnings" : "Warnungen"}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {data.slice(0, 10).map((entry, i) => {
          const config = severityConfig[entry.severity];
          const Icon = config.icon;
          return (
            <Link
              key={`${entry.caseSlug}-${i}`}
              href={entry.href}
              className={cn(
                "group flex items-start gap-2 rounded-md border px-2 py-1.5 transition-colors hover:opacity-80",
                config.borderClasses
              )}
            >
              <Icon size={14} className={cn("mt-0.5 shrink-0", config.iconColor)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[color:var(--ds-text)]">
                  {entry.caseTitle}
                  {entry.layer !== undefined && (
                    <span className="ml-1 text-[color:var(--ds-text-subtle)]">
                      · L{entry.layer}
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-[color:var(--ds-text-muted)]">
                  {entry.message}
                </p>
              </div>
            </Link>
          );
        })}
        {data.length > 10 && (
          <p className="px-1 text-[11px] text-[color:var(--ds-text-subtle)]">
            {isEn ? `+${data.length - 10} more` : `+${data.length - 10} weitere`}
          </p>
        )}
      </div>
    </section>
  );
}
