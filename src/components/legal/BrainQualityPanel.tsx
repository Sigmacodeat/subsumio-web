"use client";

import {
  Brain,
  Database,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  Users,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import type { BrainQualitySummary } from "@/lib/matter-context-types";
import { useLang } from "@/lib/use-lang";
import { useApiQuery } from "@/lib/use-api-query";

interface BrainQualityPanelProps {
  className?: string;
}

export function BrainQualityPanel({ className }: BrainQualityPanelProps) {
  const { lang } = useLang();
  const { data: summary, loading, error, refetch } = useApiQuery<BrainQualitySummary>(
    async () => {
      const res = await csrfFetch("/api/brain-quality", { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as BrainQualitySummary;
    },
    []
  );

  const score = summary ? Math.round(summary.coverage_score * 100) : 0;
  const scoreColor =
    score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="brand-text" />
          <span className="text-sm font-semibold text-[color:var(--ds-text)]">Brain Qualität</span>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} className="h-7 px-2" disabled={loading}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </Button>
      </div>

      {loading && !summary && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--ds-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Lade Brain-Qualität…
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <AlertTriangle size={20} className="text-amber-500" />
          <p className="text-xs text-[color:var(--ds-text-muted)]">{error}</p>
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          {/* Coverage Score */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-[color:var(--ds-text-muted)]">Quellenabdeckung</span>
              <span className={cn("text-sm font-bold", scoreColor)}>{score}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
              <div
                className={cn(
                  "h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  scoreBg
                )}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              icon={FileText}
              label="Seiten"
              value={summary.total_pages}
              color="text-blue-600"
            />
            <StatCard
              icon={Users}
              label="Entitäten"
              value={summary.total_entities}
              color="text-purple-600"
            />
            <StatCard
              icon={GitBranch}
              label="Kanten"
              value={summary.total_edges}
              color="text-emerald-600"
            />
          </div>

          {/* Source Breakdown */}
          {summary.source_breakdown.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                <Database size={12} />
                Quellen
              </div>
              <div className="space-y-1.5">
                {summary.source_breakdown.map((source) => (
                  <div
                    key={source.source_type}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2.5 py-1.5"
                  >
                    <span className="text-xs text-[color:var(--ds-text)]">
                      {source.source_type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        {source.count}
                      </span>
                      {source.fresh ? (
                        <CheckCircle2 size={11} className="text-emerald-500" />
                      ) : (
                        <Clock size={11} className="text-amber-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quality Issues */}
          {summary.quality_issues.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-muted)]">
                <AlertTriangle size={12} />
                Probleme
              </div>
              {summary.quality_issues.map((issue, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5"
                >
                  <AlertTriangle size={11} className="shrink-0 text-amber-600" />
                  <span className="text-xs text-amber-600">{issue}</span>
                </div>
              ))}
            </div>
          )}

          {summary.quality_issues.length === 0 && summary.total_pages > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5">
              <CheckCircle2 size={12} className="text-emerald-600" />
              <span className="text-xs text-emerald-600">Alle Quellen aktuell</span>
            </div>
          )}

          {/* Last Synced */}
          {summary.last_synced && (
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-subtle)]">
              <Clock size={10} />
              Letzter Sync:{" "}
              {new Date(summary.last_synced).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  const { lang } = useLang();
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2.5 text-center">
      <Icon size={14} className={cn("mx-auto mb-1", color)} />
      <div className={cn("text-lg font-bold", color)}>
        {value.toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
      </div>
      <div className="text-xs text-[color:var(--ds-text-subtle)]">{label}</div>
    </div>
  );
}
