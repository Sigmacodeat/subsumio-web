"use client";

import { useState, useCallback } from "react";
import {
  Lightbulb,
  Scale,
  AlertTriangle,
  CalendarClock,
  X,
  Loader2,
  RefreshCw,
  Sparkles,
  Brain,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/use-api-query";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";
import { BrainQualityPanel } from "@/components/legal/BrainQualityPanel";
import type { Insight, InsightType, InsightSeverity } from "@/lib/insights-engine";

const SEVERITY_STYLES: Record<InsightSeverity, { border: string; bg: string; text: string }> = {
  critical: { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-600" },
  warning: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-600" },
  info: { border: "border-blue-500/30", bg: "bg-blue-500/5", text: "text-blue-600" },
};

const TYPE_ICONS: Record<InsightType, typeof Lightbulb> = {
  judgement_match: Scale,
  playbook_hint: Lightbulb,
  contradiction: AlertTriangle,
  deadline_risk: CalendarClock,
};

const TYPE_LABELS_DE: Record<InsightType, string> = {
  judgement_match: "Urteil",
  playbook_hint: "Playbook",
  contradiction: "Widerspruch",
  deadline_risk: "Frist",
};

const TYPE_LABELS_EN: Record<InsightType, string> = {
  judgement_match: "Judgement",
  playbook_hint: "Playbook",
  contradiction: "Contradiction",
  deadline_risk: "Deadline",
};

interface CaseInsightsPanelProps {
  caseSlug: string;
  className?: string;
}

export function CaseInsightsPanel({ caseSlug, className }: CaseInsightsPanelProps) {
  const { lang } = useLang();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, loading, error, refetch } = useApiQuery<{
    insights: Insight[];
    count: number;
  }>(async () => {
    const res = await csrfFetch(`/api/insights?caseSlug=${encodeURIComponent(caseSlug)}`, {
      method: "GET",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as { insights: Insight[]; count: number };
  }, [caseSlug]);

  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const activeInsights = (data?.insights ?? []).filter((i) => !dismissed.has(i.id));
  const criticalCount = activeInsights.filter((i) => i.severity === "critical").length;
  const warningCount = activeInsights.filter((i) => i.severity === "warning").length;

  const typeLabels = lang === "en" ? TYPE_LABELS_EN : TYPE_LABELS_DE;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Case-Scoped Insights */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="brand-text" />
            <span className="text-sm font-semibold text-[color:var(--ds-text)]">
              {lang === "en" ? "Case Insights" : "Akten-Insights"}
            </span>
            {criticalCount > 0 && (
              <Badge variant="danger" className="text-[10px]">
                {criticalCount} {lang === "en" ? "critical" : "kritisch"}
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="warning" className="text-[10px]">
                {warningCount}{" "}
                {lang === "en" ? "warning" : warningCount === 1 ? "Warnung" : "Warnungen"}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={loading}
            className="h-7 px-2"
            aria-label={lang === "en" ? "Refresh insights" : "Insights aktualisieren"}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </Button>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-[color:var(--ds-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            {lang === "en" ? "Loading insights…" : "Lade Insights…"}
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <AlertTriangle size={20} className="text-amber-500" />
            <p className="text-xs text-[color:var(--ds-text-muted)]">{error}</p>
          </div>
        )}

        {!loading && !error && activeInsights.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Brain size={20} className="text-[color:var(--ds-text-subtle)]" />
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "No insights for this case — everything looks current."
                : "Keine Insights für diese Akte — alles aktuell."}
            </p>
          </div>
        )}

        {!loading && !error && activeInsights.length > 0 && (
          <div className="space-y-2">
            {activeInsights.slice(0, 6).map((insight) => {
              const Icon = TYPE_ICONS[insight.type];
              const styles = SEVERITY_STYLES[insight.severity];
              return (
                <div
                  key={insight.id}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-[color:var(--ds-hover)]",
                    styles.border,
                    styles.bg
                  )}
                >
                  <div className="shrink-0 pt-0.5">
                    <Icon size={14} className={styles.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[color:var(--ds-text)]">
                        {insight.title}
                      </span>
                      <span className={cn("text-[10px]", styles.text)}>
                        {typeLabels[insight.type]}
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
            })}
            {activeInsights.length > 6 && (
              <p className="pt-1 text-center text-xs text-[color:var(--ds-text-subtle)]">
                +{activeInsights.length - 6} {lang === "en" ? "more" : "weitere"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Brain Quality Panel */}
      <BrainQualityPanel />
    </div>
  );
}
