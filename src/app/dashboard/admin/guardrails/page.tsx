"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  Scale,
  Brain,
  Zap,
  Layers,
  CalendarClock,
  Gavel,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";

interface PipelineGuardrailStats {
  total_pipelines: number;
  by_layer: Array<{
    layer: number;
    total: number;
    passed: number;
    flagged: number;
    total_flags: number;
    flag_types: Record<string, number>;
    pass_rate: number;
  }>;
  cross_verify: {
    total: number;
    clean: number;
    flagged: number;
    clean_rate: number;
    total_flags: number;
  };
}

interface FristenEngineStats {
  total: number;
  deterministic: number;
  non_deterministic: number;
  deterministic_rate: number;
  by_art: Array<{
    art: string;
    total: number;
    deterministic: number;
    deterministic_rate: number;
  }>;
  by_regime: Array<{ regime: string; count: number }>;
  by_classification: { ok: number; vorfrist: number; kritisch: number; ueberfaellig: number };
  by_source: Record<string, number>;
  llm_fallback_rate: number;
}

interface GuardrailStats {
  total: number;
  tier_0_pass_rate: number;
  tier_0_regeneration_rate: number;
  tier_1_pass_rate: number;
  tier_1_regeneration_rate: number;
  tier_1_clean_rate: number;
  by_jurisdiction: Record<string, { total: number; pass_rate: number }>;
  recent_flags: Array<{
    id: number;
    created_at: string;
    tier_0_passed: boolean | null;
    tier_1_passed: boolean | null;
    warnings: string[];
    jurisdiction: string | null;
  }>;
  hourly: Array<{ hour: string; total: number; passed: number; flagged: number }>;
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  color = "text-[var(--ds-text)]",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  color?: string;
}) {
  return (
    <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide">
            {label}
          </span>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div className="text-2xl font-bold text-[var(--ds-text)]">{value}</div>
        {trend && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {trend === "up" && <TrendingUp className="w-3 h-3 text-green-500" />}
            {trend === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
            {trend === "neutral" && <Activity className="w-3 h-3 text-[var(--ds-text-muted)]" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WarningBadge({ warning }: { warning: string }) {
  const isPassed = warning.includes("PASSED");
  const isFlagged = warning.includes("FLAGGED");
  const isRegen = warning.includes("REGEN");
  const isSkipped = warning.includes("SKIPPED");

  const variant: "default" | "success" | "danger" | "warning" | "info" = isPassed
    ? "success"
    : isFlagged
      ? "danger"
    : isRegen
        ? "warning"
        : isSkipped
          ? "default"
          : "info";

  return (
    <Badge variant={variant} className="text-xs font-mono">
      {warning.length > 60 ? warning.slice(0, 60) + "…" : warning}
    </Badge>
  );
}

function Sparkline({ hourly }: { hourly: Array<{ hour: string; total: number; passed: number; flagged: number }> }) {
  if (hourly.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-[var(--ds-text-muted)]">
        Keine Daten in diesem Zeitraum
      </div>
    );
  }

  const maxVal = Math.max(...hourly.map((h) => h.total), 1);
  const barWidth = 100 / hourly.length;

  return (
    <div className="flex items-end gap-0.5 h-32 px-2">
      {hourly.map((h, i) => {
        const passedH = (h.passed / maxVal) * 100;
        const flaggedH = (h.flagged / maxVal) * 100;
        return (
          <div
            key={i}
            className="flex flex-col justify-end relative group flex-shrink-0"
            style={{ width: `${barWidth}%`, minWidth: "4px" }}
          >
            <div
              className="rounded-t bg-red-500/60 transition-all"
              style={{ height: `${flaggedH}%`, minHeight: h.flagged > 0 ? "2px" : "0" }}
            />
            <div
              className="rounded-t bg-green-500/60 transition-all"
              style={{ height: `${passedH}%`, minHeight: h.passed > 0 ? "2px" : "0" }}
            />
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[var(--ds-surface-2)] text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
              {formatTime(h.hour)}: {h.total} total, {h.passed} ok, {h.flagged} flagged
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GuardrailDashboardPage() {
  const [hours, setHours] = useState(24);

  const { data, isLoading, refetch, isFetching } = useQuery<GuardrailStats>({
    queryKey: ["guardrail-stats", hours],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/guardrails/stats?hours=${hours}`);
      if (!res.ok) throw new Error("Failed to fetch guardrail stats");
      return res.json() as Promise<GuardrailStats>;
    },
    refetchInterval: 30_000,
  });

  const { data: pipelineStats } = useQuery<PipelineGuardrailStats>({
    queryKey: ["pipeline-guardrail-stats", hours],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/guardrails/pipeline-stats?hours=${hours}`);
      if (!res.ok) throw new Error("Failed to fetch pipeline guardrail stats");
      return res.json() as Promise<PipelineGuardrailStats>;
    },
    refetchInterval: 30_000,
  });

  const { data: fristenStats } = useQuery<FristenEngineStats>({
    queryKey: ["fristen-engine-stats", hours],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/guardrails/fristen-stats?hours=${hours}`);
      if (!res.ok) throw new Error("Failed to fetch fristen stats");
      return res.json() as Promise<FristenEngineStats>;
    },
    refetchInterval: 30_000,
  });

  const stats = data;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Guardrail Monitoring"
        description="Tier-0 (deterministic) + Tier-1 (Cross-Model Verification) Metriken"
      />

      {/* Time range selector */}
      <div className="flex items-center gap-2">
        {[1, 6, 24, 72, 168].map((h) => (
          <Button
            key={h}
            variant={hours === h ? "primary" : "outline"}
            size="sm"
            onClick={() => setHours(h)}
          >
            {h === 1 ? "1h" : h === 168 ? "7d" : `${h / 24}d`}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      ) : stats ? (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Total Queries"
              value={stats.total.toString()}
              icon={Activity}
              trend="neutral"
            />
            <MetricCard
              label="Tier-0 Pass Rate"
              value={formatPercent(stats.tier_0_pass_rate)}
              icon={ShieldCheck}
              color={stats.tier_0_pass_rate > 0.9 ? "text-green-500" : "text-orange-500"}
              trend={stats.tier_0_pass_rate > 0.9 ? "up" : "down"}
            />
            <MetricCard
              label="Tier-1 Pass Rate"
              value={formatPercent(stats.tier_1_pass_rate)}
              icon={Brain}
              color={stats.tier_1_pass_rate > 0.85 ? "text-green-500" : "text-orange-500"}
              trend={stats.tier_1_pass_rate > 0.85 ? "up" : "down"}
            />
            <MetricCard
              label="Clean Rate (beide)"
              value={formatPercent(stats.tier_1_clean_rate)}
              icon={Scale}
              color={stats.tier_1_clean_rate > 0.8 ? "text-green-500" : "text-red-500"}
              trend={stats.tier_1_clean_rate > 0.8 ? "up" : "down"}
            />
          </div>

          {/* Regeneration rates */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard
              label="Tier-0 Regeneration"
              value={formatPercent(stats.tier_0_regeneration_rate)}
              icon={Zap}
              color={stats.tier_0_regeneration_rate < 0.1 ? "text-green-500" : "text-orange-500"}
            />
            <MetricCard
              label="Tier-1 Regeneration"
              value={formatPercent(stats.tier_1_regeneration_rate)}
              icon={Zap}
              color={stats.tier_1_regeneration_rate < 0.05 ? "text-green-500" : "text-orange-500"}
            />
            <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide">
                    Jurisdictions
                  </span>
                  <Scale className="w-4 h-4 text-[var(--ds-text)]" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.by_jurisdiction).map(([jur, data]) => (
                    <Badge
                      key={jur}
                      variant={data.pass_rate > 0.9 ? "success" : "danger"}
                      className="text-xs"
                    >
                      {jur}: {formatPercent(data.pass_rate)} ({data.total})
                    </Badge>
                  ))}
                  {Object.keys(stats.by_jurisdiction).length === 0 && (
                    <span className="text-xs text-[var(--ds-text-muted)]">Keine Daten</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hourly chart */}
          <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[var(--ds-text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--ds-text)]">
                  Query Volumen (stündlich)
                </h3>
                <div className="flex-1" />
                <div className="flex items-center gap-3 text-xs text-[var(--ds-text-muted)]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-green-500/60" /> Passed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-red-500/60" /> Flagged
                  </span>
                </div>
              </div>
              <Sparkline hourly={stats.hourly} />
            </CardContent>
          </Card>

          {/* Recent flagged queries */}
          <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-semibold text-[var(--ds-text)]">
                  Zuletzt markierte Queries
                </h3>
                <Badge variant="info" className="ml-auto text-xs">
                  {stats.recent_flags.length} Einträge
                </Badge>
              </div>
              {stats.recent_flags.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-[var(--ds-text-muted)]">
                  <ShieldCheck className="w-5 h-5 mr-2 text-green-500" />
                  Keine markierten Queries — alle Guardrails bestanden!
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {stats.recent_flags.map((flag) => (
                    <div
                      key={flag.id}
                      className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--ds-text-muted)]">
                            {formatTime(flag.created_at)}
                          </span>
                          {flag.jurisdiction && (
                            <Badge variant="default" className="text-xs">
                              {flag.jurisdiction.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {flag.tier_0_passed === false && (
                            <Badge variant="danger" className="text-xs">
                              Tier-0 FAIL
                            </Badge>
                          )}
                          {flag.tier_1_passed === false && (
                            <Badge variant="danger" className="text-xs">
                              Tier-1 FAIL
                            </Badge>
                          )}
                          {flag.tier_0_passed === true && (
                            <Badge variant="success" className="text-xs">
                              Tier-0 OK
                            </Badge>
                          )}
                          {flag.tier_1_passed === true && (
                            <Badge variant="success" className="text-xs">
                              Tier-1 OK
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {flag.warnings.map((w, i) => (
                          <WarningBadge key={i} warning={w} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Guardrail Metrics (AP-9) */}
          {pipelineStats && pipelineStats.total_pipelines > 0 && (
            <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-[var(--ds-text-muted)]" />
                  <h3 className="text-sm font-semibold text-[var(--ds-text)]">
                    Pipeline Guardrail Metriken
                  </h3>
                  <Badge variant="info" className="ml-auto text-xs">
                    {pipelineStats.total_pipelines} Pipelines
                  </Badge>
                </div>
                <div className="space-y-2">
                  {pipelineStats.by_layer.map((ls) => (
                    <div key={ls.layer} className="flex items-center gap-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-2">
                      <span className="text-xs font-medium text-[var(--ds-text)] w-20">
                        Layer {ls.layer}
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-[var(--ds-border)] overflow-hidden">
                          <div
                            className={ls.pass_rate > 0.9 ? "bg-green-500/60" : "bg-orange-500/60"}
                            style={{ width: `${ls.pass_rate * 100}%`, height: "100%" }}
                          />
                        </div>
                        <span className="text-xs text-[var(--ds-text-muted)] w-16 text-right">
                          {formatPercent(ls.pass_rate)}
                        </span>
                      </div>
                      <Badge
                        variant={ls.flagged > 0 ? "danger" : "success"}
                        className="text-xs"
                      >
                        {ls.passed}✓ / {ls.flagged}⚠
                      </Badge>
                      {ls.total_flags > 0 && (
                        <span className="text-xs text-[var(--ds-text-muted)]">
                          {ls.total_flags} flags
                        </span>
                      )}
                    </div>
                  ))}
                  {pipelineStats.cross_verify.total > 0 && (
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-2">
                      <span className="text-xs font-medium text-[var(--ds-text)] w-20">
                        Cross-Verify
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-[var(--ds-border)] overflow-hidden">
                          <div
                            className={pipelineStats.cross_verify.clean_rate > 0.85 ? "bg-green-500/60" : "bg-orange-500/60"}
                            style={{ width: `${pipelineStats.cross_verify.clean_rate * 100}%`, height: "100%" }}
                          />
                        </div>
                        <span className="text-xs text-[var(--ds-text-muted)] w-16 text-right">
                          {formatPercent(pipelineStats.cross_verify.clean_rate)}
                        </span>
                      </div>
                      <Badge
                        variant={pipelineStats.cross_verify.flagged > 0 ? "danger" : "success"}
                        className="text-xs"
                      >
                        {pipelineStats.cross_verify.clean}✓ / {pipelineStats.cross_verify.flagged}⚠
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Guardrail architecture info */}

          {/* Fristen-Engine Stats (AP5) */}
          {fristenStats && fristenStats.total > 0 && (
            <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarClock className="w-4 h-4 text-[var(--ds-text-muted)]" />
                  <h3 className="text-sm font-semibold text-[var(--ds-text)]">
                    Fristen-Engine Metriken
                  </h3>
                  <Badge variant="info" className="ml-auto text-xs">
                    {fristenStats.total} Fristen
                  </Badge>
                </div>

                {/* Summary metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-3">
                    <div className="text-xs text-[var(--ds-text-muted)] mb-1">Deterministisch</div>
                    <div className="text-lg font-bold text-green-500">
                      {fristenStats.deterministic}
                    </div>
                    <div className="text-xs text-[var(--ds-text-muted)]">
                      {formatPercent(fristenStats.deterministic_rate)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-3">
                    <div className="text-xs text-[var(--ds-text-muted)] mb-1">LLM Fallback</div>
                    <div className="text-lg font-bold text-blue-500">
                      {fristenStats.by_source.llm_detected ?? 0}
                    </div>
                    <div className="text-xs text-[var(--ds-text-muted)]">
                      {formatPercent(fristenStats.llm_fallback_rate)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-3">
                    <div className="text-xs text-[var(--ds-text-muted)] mb-1">Kritisch / Überfällig</div>
                    <div className="text-lg font-bold text-red-500">
                      {fristenStats.by_classification.kritisch + fristenStats.by_classification.ueberfaellig}
                    </div>
                    <div className="text-xs text-[var(--ds-text-muted)]">
                      {fristenStats.by_classification.kritisch} krit / {fristenStats.by_classification.ueberfaellig} überf
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] p-3">
                    <div className="text-xs text-[var(--ds-text-muted)] mb-1">Vorfrist erreicht</div>
                    <div className="text-lg font-bold text-orange-500">
                      {fristenStats.by_classification.vorfrist}
                    </div>
                    <div className="text-xs text-[var(--ds-text-muted)]">
                      von {fristenStats.total} Fristen
                    </div>
                  </div>
                </div>

                {/* Classification bar */}
                <div className="mb-4">
                  <div className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                    Fristen-Status (Ampel)
                  </div>
                  <div className="flex h-6 rounded-full overflow-hidden">
                    {fristenStats.by_classification.ok > 0 && (
                      <div
                        className="bg-green-500/60 flex items-center justify-center"
                        style={{ width: `${(fristenStats.by_classification.ok / fristenStats.total) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">{fristenStats.by_classification.ok}</span>
                      </div>
                    )}
                    {fristenStats.by_classification.vorfrist > 0 && (
                      <div
                        className="bg-orange-500/60 flex items-center justify-center"
                        style={{ width: `${(fristenStats.by_classification.vorfrist / fristenStats.total) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">{fristenStats.by_classification.vorfrist}</span>
                      </div>
                    )}
                    {fristenStats.by_classification.kritisch > 0 && (
                      <div
                        className="bg-red-500/70 flex items-center justify-center"
                        style={{ width: `${(fristenStats.by_classification.kritisch / fristenStats.total) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">{fristenStats.by_classification.kritisch}</span>
                      </div>
                    )}
                    {fristenStats.by_classification.ueberfaellig > 0 && (
                      <div
                        className="bg-red-700/80 flex items-center justify-center"
                        style={{ width: `${(fristenStats.by_classification.ueberfaellig / fristenStats.total) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">{fristenStats.by_classification.ueberfaellig}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-[var(--ds-text-muted)]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500/60" /> OK</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-500/60" /> Vorfrist</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/70" /> Kritisch</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-700/80" /> Überfällig</span>
                  </div>
                </div>

                {/* By Fristart */}
                {fristenStats.by_art.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                      Nach Fristart
                    </div>
                    <div className="space-y-1.5">
                      {fristenStats.by_art.slice(0, 8).map((item) => (
                        <div key={item.art} className="flex items-center gap-2">
                          <Gavel className="w-3 h-3 text-[var(--ds-text-muted)] flex-shrink-0" />
                          <span className="text-xs text-[var(--ds-text)] w-32 truncate">
                            {item.art.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--ds-border)] overflow-hidden">
                            <div
                              className={item.deterministic_rate > 0.8 ? "bg-green-500/60" : "bg-orange-500/60"}
                              style={{ width: `${item.deterministic_rate * 100}%`, height: "100%" }}
                            />
                          </div>
                          <span className="text-xs text-[var(--ds-text-muted)] w-12 text-right">
                            {item.deterministic}/{item.total}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* By Regime + Source */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                      Rechtsgebiet
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {fristenStats.by_regime.map((r) => (
                        <Badge key={r.regime} variant="info" className="text-xs">
                          {r.regime.toUpperCase()}: {r.count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                      Quelle
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(fristenStats.by_source).map(([src, count]) => (
                        <Badge
                          key={src}
                          variant={src === "llm_detected" ? "warning" : "default"}
                          className="text-xs"
                        >
                          {src}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Guardrail architecture info */}
          <Card className="bg-[var(--ds-surface-1)] border-[var(--ds-border)]">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-[var(--ds-text)] mb-3">
                Guardrail Architektur
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-[var(--ds-text)]">Tier-0: Deterministic</span>
                  </div>
                  <p className="text-xs text-[var(--ds-text-muted)] pl-6">
                    Regex-basierte §-Citation-Prüfung, Law-Validation, Hedging-Detection,
                    Cross-Law-Contamination. Zero LLM cost.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-500" />
                    <span className="font-medium text-[var(--ds-text)]">Tier-1: Cross-Verify</span>
                  </div>
                  <p className="text-xs text-[var(--ds-text-muted)] pl-6">
                    Grok 4.3 semantische Verifikation aller §-Zitate gegen Kontext.
                    ~$0.003/check. Regeneration bei high-severity flags.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="flex items-center justify-center py-12 text-sm text-[var(--ds-text-muted)]">
          Keine Daten verfügbar
        </div>
      )}
    </div>
  );
}
