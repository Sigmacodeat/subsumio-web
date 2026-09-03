"use client";

/**
 * Dissensus Dashboard — zeigt wo und warum Modelle uneinig sind.
 *
 * Features:
 *   - Durchschnittlicher Disagreement-Score über alle Runs
 *   - Meist umstrittene Layer (contested_layers Ranking)
 *   - Top Disagreements (Cases mit höchstem Dissensus)
 *   - Key Disagreements Detail (welche Issues wurden von welchen Modellen raised/dismissed)
 *
 * Strategic Insight: "Bei welchen Falltypen sind die Modelle am uneinigsten?"
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingDown, Layers, Brain, Activity, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, ApiGetError } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";

interface KeyDisagreement {
  issue: string;
  raised_by: string[];
  dismissed_by: string[];
}

interface DissensusRun {
  case_slug: string;
  disagreement_score: number;
  recommendation_split: Record<string, number>;
  score_spread: number;
  contested_layers: string[];
  key_disagreements: KeyDisagreement[];
  summary: string;
  created_at?: string;
}

interface DissensusResponse {
  ok: boolean;
  runs: DissensusRun[];
  summary: {
    total_runs: number;
    avg_disagreement: number;
    contested_layers: Array<{ layer: string; count: number }>;
  };
}

function DisagreementBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 60 ? "bg-red-500" : pct >= 30 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-[color:var(--ds-hover)]">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", color)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Disagreement: ${pct}%`}
        />
      </div>
      <span className="font-mono text-xs font-medium text-[color:var(--ds-text)]">{pct}%</span>
    </div>
  );
}

function RecommendationSplit({ split }: { split: Record<string, number> }) {
  const entries = Object.entries(split);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  const colors: Record<string, string> = {
    publish: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    revise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    reject: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([rec, count]) => (
        <Badge key={rec} variant="info" className={cn("text-xs", colors[rec] ?? "")}>
          {rec}: {count}/{total}
        </Badge>
      ))}
    </div>
  );
}

export function DissensusDashboard() {
  const { data, isLoading, error } = useQuery<DissensusResponse>({
    queryKey: ["admin-dissensus"],
    queryFn: () => apiGet<DissensusResponse>("/api/admin/dissensus?limit=50"),
    retry: false,
  });

  const runs = data?.runs ?? [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={20} className="brand-text" aria-hidden />
        <h1 className="text-lg font-semibold text-[color:var(--ds-text)]">Dissensus Dashboard</h1>
        <Badge variant="info" className="text-xs">
          Ensemble-Critic
        </Badge>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-[color:var(--ds-hover)]" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && error instanceof ApiGetError && (
        <Card className="border-red-200 p-4 dark:border-red-900">
          <p className="text-sm text-red-600 dark:text-red-400">
            Fehler beim Laden: {error.message}
          </p>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && runs.length === 0 && (
        <Card className="p-8 text-center">
          <Brain size={32} className="mx-auto mb-3 text-[color:var(--ds-text-muted)]" aria-hidden />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Noch keine Ensemble-Critic Runs mit Dissensus-Daten.
          </p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
            Dissensus-Daten werden automatisch erfasst wenn der Ensemble-Critic läuft.
          </p>
        </Card>
      )}

      {/* Summary Stats */}
      {!isLoading && summary && summary.total_runs > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Total Runs */}
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <Activity size={14} aria-hidden />
                <span className="text-xs font-semibold tracking-wide uppercase">Total Runs</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[color:var(--ds-text)]">
                {summary.total_runs}
              </div>
            </Card>

            {/* Avg Disagreement */}
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <TrendingDown size={14} aria-hidden />
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Ø Disagreement
                </span>
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-[color:var(--ds-text)]">
                {Math.round(summary.avg_disagreement * 100)}%
              </div>
            </Card>

            {/* Most Contested Layer */}
            <Card className="p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <Layers size={14} aria-hidden />
                <span className="text-xs font-semibold tracking-wide uppercase">Top Contested</span>
              </div>
              <div className="mt-2 font-mono text-sm font-bold text-[color:var(--ds-text)]">
                {summary.contested_layers[0]?.layer ?? "—"}
              </div>
              {summary.contested_layers[0] && (
                <div className="text-xs text-[color:var(--ds-text-muted)]">
                  {summary.contested_layers[0].count}× umstritten
                </div>
              )}
            </Card>
          </div>

          {/* Contested Layers Ranking */}
          {summary.contested_layers.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                <Trophy size={14} className="brand-text" aria-hidden />
                Meist umstrittene Layer
              </h2>
              <div className="space-y-2">
                {summary.contested_layers.map((cl, i) => (
                  <div key={cl.layer} className="flex items-center gap-3">
                    <span className="w-6 font-mono text-xs text-[color:var(--ds-text-muted)]">
                      #{i + 1}
                    </span>
                    <span className="flex-1 font-mono text-sm text-[color:var(--ds-text)]">
                      {cl.layer}
                    </span>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-[color:var(--ds-hover)]">
                      <div
                        className="h-full rounded-full bg-[color:var(--brand-primary)] transition-[width] duration-500"
                        style={{
                          width: `${(cl.count / summary.total_runs) * 100}%`,
                        }}
                        role="progressbar"
                        aria-valuenow={cl.count}
                        aria-valuemax={summary.total_runs}
                        aria-label={`${cl.layer}: ${cl.count} von ${summary.total_runs} Runs`}
                      />
                    </div>
                    <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                      {cl.count}×
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top Disagreements (sorted by disagreement_score) */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
              <AlertTriangle size={14} className="brand-text" aria-hidden />
              Top Disagreements — Cases mit höchstem Dissensus
            </h2>
            <div className="space-y-2">
              {runs.slice(0, 10).map((run) => (
                <Card key={run.case_slug} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm font-medium text-[color:var(--ds-text)]">
                          {run.case_slug}
                        </span>
                        {run.created_at && (
                          <span className="text-xs text-[color:var(--ds-text-muted)]">
                            {new Date(run.created_at).toLocaleDateString("de-AT")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        {run.summary}
                      </p>
                    </div>
                    <DisagreementBar score={run.disagreement_score} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <RecommendationSplit split={run.recommendation_split} />
                    <span className="text-xs text-[color:var(--ds-text-muted)]">
                      Score-Spread: {run.score_spread}
                    </span>
                    {run.contested_layers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {run.contested_layers.slice(0, 3).map((l) => (
                          <Badge key={l} variant="default" className="text-xs">
                            {l}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Key Disagreements Detail */}
                  {run.key_disagreements.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-[color:var(--ds-border)] pt-3">
                      <h3 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                        Key Disagreements
                      </h3>
                      {run.key_disagreements.slice(0, 3).map((kd, i) => (
                        <div key={i} className="text-xs">
                          <span className="text-[color:var(--ds-text)]">{kd.issue}</span>
                          <span className="ml-2 text-[color:var(--ds-text-muted)]">
                            raised by: {kd.raised_by.join(", ")} · dismissed by:{" "}
                            {kd.dismissed_by.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
