"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import {
  Activity,
  BarChart3,
  CheckCircle,
  Clock,
  Database,
  Play,
  RefreshCw,
  Search,
  Settings2,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
  Loader2,
} from "lucide-react";

interface Run {
  id: number;
  name: string;
  run_type: string;
  status: string;
  params: Record<string, unknown> | null;
  baseline_id: number | null;
  results: Record<string, unknown> | null;
  cost_estimate_usd: number | null;
  latency_p95_ms: number | null;
  applied_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface QueueItem {
  id: number;
  slug: string;
  jurisdiction: string;
  status: string;
  priority: number;
  error: string | null;
  scheduled_at: string;
  completed_at: string | null;
}

function formatPercent(v: number | undefined): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE");
}

function statusColor(status: string): "default" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "info";
    case "pending":
      return "warning";
    case "rolled_back":
      return "default";
    default:
      return "default";
  }
}

function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="border-[var(--ds-border)] bg-[var(--ds-surface-1)]">
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-[var(--ds-text-muted)] uppercase">
            {label}
          </span>
          <Icon className="h-4 w-4 text-[var(--ds-text-muted)]" />
        </div>
        <div className="text-2xl font-bold text-[var(--ds-text)]">{value}</div>
        {trend && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {trend === "up" && (
              <TrendingUp className="h-3 w-3 text-[color:var(--ds-success-text)]" />
            )}
            {trend === "down" && (
              <TrendingDown className="h-3 w-3 text-[color:var(--ds-danger-text)]" />
            )}
            {trend === "neutral" && <Activity className="h-3 w-3 text-[var(--ds-text-muted)]" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RagOptimizerDashboardPage() {
  const { t } = useLang();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const {
    data: history,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useQuery<{ runs: Run[] }>({
    queryKey: ["rag-optimizer", "history"],
    queryFn: async () => {
      const res = await csrfFetch("/api/admin/rag-optimizer?type=history&limit=20");
      if (!res.ok) throw new Error("History konnte nicht geladen werden");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const {
    data: active,
    isLoading: activeLoading,
    refetch: refetchActive,
  } = useQuery<{ active: Run | null }>({
    queryKey: ["rag-optimizer", "active"],
    queryFn: async () => {
      const res = await csrfFetch("/api/admin/rag-optimizer?type=active");
      if (!res.ok) throw new Error("Aktive Config konnte nicht geladen werden");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const {
    data: queue,
    isLoading: queueLoading,
    refetch: refetchQueue,
  } = useQuery<{ queue: QueueItem[] }>({
    queryKey: ["rag-optimizer", "ingest-queue"],
    queryFn: async () => {
      const res = await csrfFetch("/api/admin/rag-optimizer/ingest?limit=50");
      if (!res.ok) throw new Error("Ingest-Queue konnte nicht geladen werden");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  async function trigger(action: string, body?: unknown) {
    const url =
      action === "ingest" ? "/api/admin/rag-optimizer/ingest" : "/api/admin/rag-optimizer";
    const opts: RequestInit = { method: "POST" };
    if (body) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    setActionLoading(action);
    try {
      const res = await csrfFetch(url, opts);
      if (!res.ok) throw new Error(`${action} fehlgeschlagen`);
      await Promise.all([refetchHistory(), refetchActive(), refetchQueue()]);
    } catch (err) {
      console.error(
        "[rag-optimizer] action failed:",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setActionLoading(null);
    }
  }

  const aggregate = active?.active?.results as Record<string, unknown> | undefined;
  const hit5 = (aggregate?.aggregate as Record<string, number> | undefined)?.hit_at_5;
  const mrr = (aggregate?.aggregate as Record<string, number> | undefined)?.mrr;
  const latency = active?.active?.latency_p95_ms;
  const activeParams = active?.active?.params as Record<string, unknown> | undefined;

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader title={t("admin.ragopt.title")} description={t("admin.ragopt.desc")} />

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => trigger("baseline", { action: "baseline" })}
          disabled={!!actionLoading}
          className="gap-2"
        >
          {actionLoading === "baseline" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Baseline messen
        </Button>
        <Button
          onClick={() => trigger("auto", { action: "auto" })}
          disabled={!!actionLoading}
          variant="secondary"
          className="gap-2"
        >
          {actionLoading === "auto" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Auto-Optimierung
        </Button>
        <Button
          onClick={() => trigger("ingest", { optimize: true })}
          disabled={!!actionLoading}
          variant="outline"
          className="gap-2"
        >
          {actionLoading === "ingest" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Database className="h-4 w-4" />
          )}
          Auto-Ingest starten
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Aktive Hit@5"
          value={hit5 != null ? formatPercent(hit5) : "—"}
          icon={BarChart3}
          trend={hit5 != null && hit5 > 0.85 ? "up" : "neutral"}
        />
        <MetricCard
          label="Aktive MRR"
          value={mrr != null ? mrr.toFixed(3) : "—"}
          icon={Search}
          trend={mrr != null && mrr > 0.7 ? "up" : "neutral"}
        />
        <MetricCard
          label="P95 Latenz"
          value={latency != null ? `${Math.round(latency)} ms` : "—"}
          icon={Clock}
          trend={latency != null && latency < 3000 ? "up" : "down"}
        />
        <MetricCard
          label="Aktive Runs"
          value={`${history?.runs?.length ?? 0}`}
          icon={Settings2}
          trend="neutral"
        />
      </div>

      <Card className="border-[var(--ds-border)] bg-[var(--ds-surface-1)]">
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle className="h-5 w-5 text-[color:var(--ds-success-text)]" />
            Aktive Konfiguration
          </h2>
          {activeLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Konfiguration wird geladen…
            </div>
          ) : activeParams ? (
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-[var(--ds-text-muted)]">hnsw.ef_search</div>
                <div className="font-mono font-medium">{String(activeParams.hnswEfSearch)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[var(--ds-text-muted)]">LLM Reranker</div>
                <div className="font-medium">
                  {activeParams.llmRerankEnabled ? "aktiv" : "inaktiv"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[var(--ds-text-muted)]">topNIn</div>
                <div className="font-mono font-medium">
                  {String(activeParams.llmRerankTopNIn ?? 25)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[var(--ds-text-muted)]">Run-ID</div>
                <div className="font-mono font-medium">{active?.active?.id ?? "—"}</div>
              </div>
            </div>
          ) : (
            <div className="text-[var(--ds-text-muted)]">
              Noch keine aktive Konfiguration. Führen Sie zuerst eine Optimierung durch.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--ds-border)] bg-[var(--ds-surface-1)]">
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-5 w-5" />
            Optimierungshistorie
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ds-border)] text-left text-[var(--ds-text-muted)]">
                  <th className="pr-4 pb-2">ID</th>
                  <th className="pr-4 pb-2">Typ</th>
                  <th className="pr-4 pb-2">Status</th>
                  <th className="pr-4 pb-2">Hit@5</th>
                  <th className="pr-4 pb-2">MRR</th>
                  <th className="pr-4 pb-2">Latenz</th>
                  <th className="pr-4 pb-2">Kosten</th>
                  <th className="pr-4 pb-2">Angewendet</th>
                  <th className="pb-2">Zeit</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-[var(--ds-text-muted)]">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Runs werden geladen…
                    </td>
                  </tr>
                )}
                {history?.runs?.map((run) => {
                  const agg = (run.results as Record<string, unknown> | null)?.aggregate as
                    | Record<string, number>
                    | undefined;
                  return (
                    <tr key={run.id} className="border-b border-[var(--ds-border)] last:border-0">
                      <td className="py-3 pr-4 font-mono">{run.id}</td>
                      <td className="py-3 pr-4 capitalize">{run.run_type}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusColor(run.status)}>{run.status}</Badge>
                      </td>
                      <td className="py-3 pr-4">{formatPercent(agg?.hit_at_5)}</td>
                      <td className="py-3 pr-4">{agg?.mrr != null ? agg.mrr.toFixed(3) : "—"}</td>
                      <td className="py-3 pr-4">
                        {run.latency_p95_ms != null ? `${run.latency_p95_ms} ms` : "—"}
                      </td>
                      <td className="py-3 pr-4">${run.cost_estimate_usd?.toFixed(4) ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {run.applied_at ? (
                          <CheckCircle className="h-4 w-4 text-[color:var(--ds-success-text)]" />
                        ) : (
                          <XCircle className="h-4 w-4 text-[var(--ds-text-muted)]" />
                        )}
                      </td>
                      <td className="py-3 text-[var(--ds-text-muted)]">
                        {formatDate(run.created_at)}
                      </td>
                    </tr>
                  );
                })}
                {(!history?.runs || history.runs.length === 0) && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-[var(--ds-text-muted)]">
                      Keine Optimierungs-Runs vorhanden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--ds-border)] bg-[var(--ds-surface-1)]">
        <CardContent className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Database className="h-5 w-5" />
            Gesetzes-Ingestion-Warteschlange
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ds-border)] text-left text-[var(--ds-text-muted)]">
                  <th className="pr-4 pb-2">Kurzname</th>
                  <th className="pr-4 pb-2">Rechtsgebiet</th>
                  <th className="pr-4 pb-2">Status</th>
                  <th className="pr-4 pb-2">Priorität</th>
                  <th className="pr-4 pb-2">Fehler</th>
                  <th className="pb-2">Geplant</th>
                </tr>
              </thead>
              <tbody>
                {queueLoading && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[var(--ds-text-muted)]">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Warteschlange wird geladen…
                    </td>
                  </tr>
                )}
                {queue?.queue?.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--ds-border)] last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{item.slug}</td>
                    <td className="py-3 pr-4">{item.jurisdiction}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusColor(item.status)}>{item.status}</Badge>
                    </td>
                    <td className="py-3 pr-4">{item.priority}</td>
                    <td className="py-3 pr-4 text-xs text-[color:var(--ds-danger-text)]">
                      {item.error ?? "—"}
                    </td>
                    <td className="py-3 text-[var(--ds-text-muted)]">
                      {formatDate(item.scheduled_at)}
                    </td>
                  </tr>
                ))}
                {(!queue?.queue || queue.queue.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[var(--ds-text-muted)]">
                      Warteschlange ist leer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
