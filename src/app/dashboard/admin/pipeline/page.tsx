"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { cn } from "@/lib/utils";

// ─── Types (mirror /api/monitoring/corpus-pipeline) ─────────────────────

interface PipelineAlert {
  type: string;
  severity: string;
  message: string;
  raised_at: string;
}

interface PipelineSourceRow {
  source_key: string;
  stage: string;
  disk_count: number;
  db_pages: number;
  ris_total: number | null;
  last_placeholder_count: number;
  backfill_exhausted: boolean;
  pid: number | null;
  pid_started_at: string | null;
  last_import_success: string | null;
  last_cycle_at: string | null;
  alert_flags: PipelineAlert[];
  stage_history: Array<{ stage: string; action: string; ts: string }>;
}

interface CorpusPipelineResponse {
  paused: boolean;
  paused_reason: string | null;
  paused_updated_at: string | null;
  sources: PipelineSourceRow[];
  alert_count: number;
  generated_at: string;
}

// ─── Stage styling ──────────────────────────────────────────────────────

const STAGE_STYLE: Record<string, { color: string; running?: boolean }> = {
  idle: { color: "text-[color:var(--ds-text-subtle)]" },
  done: { color: "text-[color:var(--ds-success-text)]" },
  ok: { color: "text-[color:var(--ds-success-text)]" },
  empty: { color: "text-[color:var(--ds-text-subtle)]" },
  importing: { color: "text-[color:var(--brand-primary)]", running: true },
  backfilling: { color: "text-[color:var(--brand-primary)]", running: true },
  "import-pending": { color: "text-[color:var(--ds-warning-text)]" },
  "backfill-pending": { color: "text-[color:var(--ds-warning-text)]" },
  "waiting-for-statutes": { color: "text-[color:var(--ds-warning-text)]" },
  "waiting-for-ris-slot": { color: "text-[color:var(--ds-warning-text)]" },
  failed: { color: "text-[color:var(--ds-danger-text)]" },
  exhausted: { color: "text-[color:var(--ds-text-subtle)]" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function CorpusPipelinePage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<CorpusPipelineResponse>({
    queryKey: ["corpus-pipeline"],
    queryFn: async () => {
      const res = await fetch("/api/monitoring/corpus-pipeline");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<CorpusPipelineResponse>;
    },
    refetchInterval: 30_000,
  });

  const control = useMutation({
    mutationFn: async (
      body:
        | { action: "pause"; reason?: string }
        | { action: "resume" }
        | { action: "clear_alerts"; source_key: string }
    ) => {
      const res = await fetch("/api/admin/corpus-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["corpus-pipeline"] }),
  });

  const sources = data?.sources ?? [];
  const totalAlerts = data?.alert_count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Korpus-Pipeline"
        description="Supervisor-Zustand je Source: Backfill → Import → Embed → Reconcile. Pause/Resume wirkt ab dem nächsten Zyklus (≤10 min)."
      />

      {/* ── Steuerleiste ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          {data?.paused ? (
            <>
              <Badge className="bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] border-[color:var(--ds-warning-border)]">
                <Pause className="mr-1 h-3 w-3" /> Pausiert
              </Badge>
              {data.paused_reason ? (
                <span className="text-xs text-[color:var(--ds-text-subtle)]">
                  Grund: {data.paused_reason} (seit {fmtTime(data.paused_updated_at)})
                </span>
              ) : null}
              <Button
                size="sm"
                onClick={() => control.mutate({ action: "resume" })}
                disabled={control.isPending}
              >
                <Play className="mr-1 h-4 w-4" /> Fortsetzen
              </Button>
            </>
          ) : (
            <>
              <Badge className="bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)] border-[color:var(--ds-success-border)]">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Aktiv
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const reason =
                    window.prompt("Grund für die Pause (landet im Audit-Log):") ?? undefined;
                  control.mutate({ action: "pause", reason });
                }}
                disabled={control.isPending}
              >
                <Pause className="mr-1 h-4 w-4" /> Pausieren
              </Button>
            </>
          )}
          <div className="ml-auto flex items-center gap-3">
            {totalAlerts > 0 ? (
              <Badge className="bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]">
                <AlertTriangle className="mr-1 h-3 w-3" /> {totalAlerts} Alert
                {totalAlerts === 1 ? "" : "s"}
              </Badge>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
          {control.error ? (
            <p className="w-full text-xs text-[color:var(--ds-danger-text)]">
              {control.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Source-Tabelle ── */}
      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-[color:var(--ds-text-subtle)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Lade Pipeline-Zustand…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-sm text-[color:var(--ds-danger-text)]">
            Pipeline-Zustand nicht abrufbar: {(error as Error).message}
          </CardContent>
        </Card>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-[color:var(--ds-text-subtle)]">
            Keine <code>pipeline_state</code>-Einträge — der Supervisor lief auf dieser Datenbank
            noch nicht (oder Migration 008 fehlt).
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text-subtle)]">
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Stage</th>
                  <th className="px-4 py-2 text-right">Disk</th>
                  <th className="px-4 py-2 text-right">DB</th>
                  <th className="px-4 py-2 text-right">Platzhalter</th>
                  <th className="px-4 py-2">Letzter Import</th>
                  <th className="px-4 py-2">Zyklus</th>
                  <th className="px-4 py-2">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const style = STAGE_STYLE[s.stage] ?? {
                    color: "text-[color:var(--ds-text)]",
                  };
                  const isOpen = expanded === s.source_key;
                  return (
                    <>
                      <tr
                        key={s.source_key}
                        className="cursor-pointer border-b border-[color:var(--ds-border)] hover:bg-[color:var(--ds-surface-hover)]"
                        onClick={() => setExpanded(isOpen ? null : s.source_key)}
                      >
                        <td className="px-4 py-2 font-mono text-xs">{s.source_key}</td>
                        <td className={cn("px-4 py-2 text-xs font-medium", style.color)}>
                          <span className="inline-flex items-center gap-1">
                            {style.running ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            {s.stage}
                            {s.pid ? (
                              <span className="text-[color:var(--ds-text-subtle)]">
                                (PID {s.pid})
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.disk_count.toLocaleString("de-DE")}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.db_pages.toLocaleString("de-DE")}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {s.last_placeholder_count > 0
                            ? s.last_placeholder_count.toLocaleString("de-DE")
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{fmtTime(s.last_import_success)}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 text-[color:var(--ds-text-subtle)]" />
                            {fmtTime(s.last_cycle_at)}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {s.alert_flags.length > 0 ? (
                            <Badge className="bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]">
                              {s.alert_flags.length}
                            </Badge>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-[color:var(--ds-success-text)]" />
                          )}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr
                          key={`${s.source_key}-detail`}
                          className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-subtle)]"
                        >
                          <td colSpan={8} className="px-6 py-3">
                            {s.alert_flags.length > 0 ? (
                              <div className="mb-3 space-y-1">
                                {s.alert_flags.map((a, i) => (
                                  <p
                                    key={i}
                                    className="text-xs text-[color:var(--ds-danger-text)]"
                                  >
                                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                                    [{a.severity}] {a.type}: {a.message}{" "}
                                    <span className="text-[color:var(--ds-text-subtle)]">
                                      ({fmtTime(a.raised_at)})
                                    </span>
                                  </p>
                                ))}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    control.mutate({
                                      action: "clear_alerts",
                                      source_key: s.source_key,
                                    });
                                  }}
                                  disabled={control.isPending}
                                >
                                  <Trash2 className="mr-1 h-3 w-3" /> Alerts löschen
                                </Button>
                              </div>
                            ) : null}
                            <p className="mb-1 text-xs font-medium text-[color:var(--ds-text-subtle)]">
                              Stage-Historie (letzte {s.stage_history.length})
                            </p>
                            <div className="space-y-0.5">
                              {[...s.stage_history].reverse().map((h, i) => (
                                <p key={i} className="font-mono text-xs">
                                  {fmtTime(h.ts)} — {h.stage}: {h.action}
                                </p>
                              ))}
                              {s.stage_history.length === 0 ? (
                                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                                  Keine Historie.
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-[color:var(--ds-text-subtle)]">
        Stand: {data ? fmtTime(data.generated_at) : "—"} · Automatische Aktualisierung alle 30 s ·
        Env-Override <code>PIPELINE_PAUSED</code> hat Vorrang vor dem Schalter hier.
      </p>
    </div>
  );
}
