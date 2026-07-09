"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Lightbulb,
  Scale,
  AlertTriangle,
  CalendarClock,
  X,
  Loader2,
  RefreshCw,
  Sparkles,
  FileWarning,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/use-api-query";
import { csrfFetch } from "@/lib/csrf";
import type { Insight, InsightType, InsightSeverity } from "@/lib/insights-engine";

const SEVERITY_STYLES: Record<InsightSeverity, { border: string; bg: string; text: string }> = {
  critical: {
    border: "border-[color:var(--ds-danger-border)]",
    bg: "bg-[color:var(--ds-danger-bg)]",
    text: "text-[color:var(--ds-danger-text)]",
  },
  warning: {
    border: "border-[color:var(--ds-warning-border)]",
    bg: "bg-[color:var(--ds-warning-bg)]",
    text: "text-[color:var(--ds-warning-text)]",
  },
  info: {
    border: "border-[color:var(--ds-info-border)]",
    bg: "bg-[color:var(--ds-info-bg)]",
    text: "text-[color:var(--ds-info-text)]",
  },
};

const TYPE_ICONS: Record<InsightType, typeof Lightbulb> = {
  judgement_match: Scale,
  playbook_hint: Lightbulb,
  contradiction: AlertTriangle,
  deadline_risk: CalendarClock,
  extraction_issue: FileWarning,
};

const TYPE_LABELS_DE: Record<InsightType, string> = {
  judgement_match: "Urteil",
  playbook_hint: "Playbook",
  contradiction: "Widerspruch",
  deadline_risk: "Frist",
  extraction_issue: "Extraktion",
};

export function InsightsWidget() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, loading, error, refetch } = useApiQuery<{
    insights: Insight[];
    count: number;
  }>(async () => {
    const res = await csrfFetch("/api/insights", { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { insights: Insight[]; count: number };
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const activeInsights = (data?.insights ?? []).filter((i) => !dismissed.has(i.id));
  const criticalCount = activeInsights.filter((i) => i.severity === "critical").length;
  const warningCount = activeInsights.filter((i) => i.severity === "warning").length;

  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="brand-text" />
          <span className="text-sm font-semibold text-[color:var(--ds-text)]">Insights</span>
          {criticalCount > 0 && (
            <Badge variant="danger" className="text-[10px]">
              {criticalCount} kritisch
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="warning" className="text-[10px]">
              {warningCount} Warnung{warningCount === 1 ? "" : "en"}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={loading}
          className="h-7 px-2"
          aria-label="Insights aktualisieren"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </Button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--ds-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Lade Insights…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <AlertTriangle size={20} className="text-[color:var(--ds-warning-text)]" />
          <p className="text-xs text-[color:var(--ds-text-muted)]">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && activeInsights.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Lightbulb size={20} className="text-[color:var(--ds-text-subtle)]" />
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Keine Insights — alle Akten sind aktuell.
          </p>
        </div>
      )}

      {/* Insights List */}
      {!loading && !error && activeInsights.length > 0 && (
        <div className="space-y-2">
          {activeInsights.slice(0, 8).map((insight) => {
            const Icon = TYPE_ICONS[insight.type];
            const styles = SEVERITY_STYLES[insight.severity];
            const content = (
              <div
                className={`group relative flex items-start gap-3 rounded-lg border ${styles.border} ${styles.bg} px-3 py-2.5 transition-colors hover:bg-[color:var(--ds-hover)]`}
              >
                <div className="shrink-0 pt-0.5">
                  <Icon size={14} className={styles.text} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      {insight.title}
                    </span>
                    <span className={`text-[10px] ${styles.text}`}>
                      {TYPE_LABELS_DE[insight.type]}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--ds-text-muted)]">
                    {insight.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDismiss(insight.id);
                  }}
                  className="shrink-0 rounded p-0.5 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            );

            if (insight.href) {
              return (
                <Link key={insight.id} href={insight.href}>
                  {content}
                </Link>
              );
            }
            return <div key={insight.id}>{content}</div>;
          })}

          {activeInsights.length > 8 && (
            <p className="pt-1 text-center text-xs text-[color:var(--ds-text-subtle)]">
              +{activeInsights.length - 8} weitere Insights
            </p>
          )}
        </div>
      )}
    </div>
  );
}
