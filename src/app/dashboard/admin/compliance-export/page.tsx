"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Hash,
  Cpu,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { type ReasoningTrace as TraceData } from "@/lib/ai-reasoning-trace";
import { exportTracesHTML } from "@/lib/ai-reasoning-trace-export";

interface ReasoningTrace {
  trace_id: string;
  timestamp: string;
  brain_id: string;
  query_hash: string;
  query: string;
  model_used: string;
  system_prompt_hash: string;
  guardrail_passed: boolean | null;
  cross_verify_clean: boolean | null;
  ensemble_clean: boolean | null;
  injection_detected: boolean;
  injection_blocked: boolean;
  final_answer_hash: string;
  answer_length: number;
  pages_gathered: number;
  takes_gathered: number;
  graph_hits: number;
  confidence_level: string | null;
  overall_confidence: number | null;
  regeneration_count: number;
  latency_ms: number | null;
  trace_hash: string;
  prev_trace_hash: string | null;
  warnings: string[];
  retrieved_chunks: Array<{ slug: string; score: number; rank: number; source: string }>;
  Citations: unknown[];
  retrieved_chunks_count: number;
  citations_count: number;
}

interface TracesResponse {
  traces: ReasoningTrace[];
  count: number;
}

export default function ComplianceExportPage() {
  const { t } = useLang();
  const [limit, _setLimit] = useState(50);

  const { data, isLoading, refetch } = useQuery<TracesResponse>({
    queryKey: ["reasoning-traces", limit],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/reasoning-traces?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch traces");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const traces = data?.traces ?? [];

  const handleExportCSV = () => {
    window.location.href = `/api/monitoring/reasoning-traces?format=csv&limit=${limit}`;
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `reasoning-traces-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const html = exportTracesHTML(traces as unknown as TraceData[]);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        setTimeout(() => win.print(), 500);
      });
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const stats = {
    total: traces.length,
    guardrailPassed: traces.filter((t) => t.guardrail_passed === true).length,
    guardrailFailed: traces.filter((t) => t.guardrail_passed === false).length,
    injectionDetected: traces.filter((t) => t.injection_detected).length,
    injectionBlocked: traces.filter((t) => t.injection_blocked).length,
    ensembleClean: traces.filter((t) => t.ensemble_clean === true).length,
    avgConfidence:
      traces.length > 0
        ? (traces.reduce((sum, t) => sum + (t.overall_confidence ?? 0), 0) / traces.length).toFixed(
            2
          )
        : "—",
    avgLatency:
      traces.length > 0
        ? Math.round(traces.reduce((sum, t) => sum + (t.latency_ms ?? 0), 0) / traces.length)
        : 0,
    regenerations: traces.reduce((sum, t) => sum + (t.regeneration_count ?? 0), 0),
  };

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("admin.compliance_export.title")}
        description={t("admin.compliance_export.desc")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJSON}>
              <Download className="mr-2 h-4 w-4" />
              JSON
            </Button>
            <Button variant="primary" size="sm" onClick={handleExportCSV}>
              <Download className="mr-2 h-4 w-4" />
              CSV Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileText className="mr-2 h-4 w-4" />
              PDF Export
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Traces gesamt</CardTitle>
            <FileText className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">KI-Ausgaben protokolliert</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guardrail bestanden</CardTitle>
            <ShieldCheck className="h-4 w-4 text-[color:var(--ds-success-text)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[color:var(--ds-success-text)]">
              {stats.guardrailPassed}
            </div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {stats.guardrailFailed} fehlgeschlagen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Injection erkannt</CardTitle>
            <AlertTriangle className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[color:var(--ds-warning-text)]">
              {stats.injectionDetected}
            </div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {stats.injectionBlocked} blockiert
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ø Konfidenz</CardTitle>
            <Hash className="h-4 w-4 text-[color:var(--ds-text-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgConfidence}</div>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {stats.regenerations} Regenerationen
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">EU-KI-Verordnung Art. 12 Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[color:var(--ds-text-muted)]">
          <p>
            Jede KI-Ausgabe wird als unveränderlicher, hash-verketteter Reasoning-Trace erfasst.
            Traces umfassen den Retrieval-Kontext, Guardrail-Ergebnisse, Ensemble-Verifizierung,
            adversariale Defense-Scans und Konfidenzwerte.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="default" className="text-xs">
              <Hash className="mr-1 h-3 w-3" />
              Hash-verkettet
            </Badge>
            <Badge variant="default" className="text-xs">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Unveränderlich
            </Badge>
            <Badge variant="default" className="text-xs">
              <FileText className="mr-1 h-3 w-3" />
              CSV / JSON-Export
            </Badge>
            <Badge variant="default" className="text-xs">
              <Clock className="mr-1 h-3 w-3" />
              10-Jahres-Aufbewahrung
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Trace List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Letzte Reasoning-Traces</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-[color:var(--ds-text-muted)]">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Lade Traces…
            </div>
          ) : traces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[color:var(--ds-text-muted)]">
              <FileText className="mb-2 h-8 w-8" />
              <p>Keine Reasoning-Traces gefunden.</p>
              <p className="text-xs">Traces entstehen bei jeder KI-Ausgabe.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {traces.map((trace) => (
                <TraceRow key={trace.trace_id} trace={trace} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TraceRow({ trace }: { trace: ReasoningTrace }) {
  const [expanded, setExpanded] = useState(false);

  const time = new Date(trace.timestamp).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      className="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-[color:var(--ds-surface-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-[color:var(--ds-text-muted)] transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="max-w-[120px] truncate font-mono text-xs text-[color:var(--ds-text-muted)]">
                {trace.trace_id.slice(0, 8)}...
              </span>
              <span className="text-xs text-[color:var(--ds-text-muted)]">{time}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              {trace.guardrail_passed === true && (
                <Badge variant="success" className="text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Guardrail
                </Badge>
              )}
              {trace.guardrail_passed === false && (
                <Badge variant="danger" className="text-xs">
                  <XCircle className="mr-1 h-3 w-3" />
                  Guardrail
                </Badge>
              )}
              {trace.ensemble_clean === true && (
                <Badge variant="info" className="text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Ensemble
                </Badge>
              )}
              {trace.injection_detected && (
                <Badge variant="warning" className="text-xs">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Injection
                </Badge>
              )}
              {trace.injection_blocked && (
                <Badge variant="danger" className="text-xs">
                  <XCircle className="mr-1 h-3 w-3" />
                  Blockiert
                </Badge>
              )}
              {trace.confidence_level && (
                <Badge variant="default" className="text-xs">
                  {trace.confidence_level}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            {trace.model_used.split(":").pop()}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {trace.latency_ms ? `${(trace.latency_ms / 1000).toFixed(1)}s` : "—"}
          </span>
          <span>{trace.retrieved_chunks_count} Chunks</span>
          <span>{trace.citations_count} Citations</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Trace-ID:</span>{" "}
              <code className="font-mono">{trace.trace_id}</code>
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Modell:</span>{" "}
              <code className="font-mono">{trace.model_used}</code>
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Query-Hash:</span>{" "}
              <code className="font-mono">{trace.query_hash.slice(0, 16)}...</code>
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Answer-Hash:</span>{" "}
              <code className="font-mono">{trace.final_answer_hash.slice(0, 16)}...</code>
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Trace-Hash:</span>{" "}
              <code className="font-mono">{trace.trace_hash.slice(0, 16)}...</code>
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Vorheriger Hash:</span>{" "}
              <code className="font-mono">
                {trace.prev_trace_hash ? trace.prev_trace_hash.slice(0, 16) + "..." : "—"}
              </code>
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Antwortlänge:</span>{" "}
              {trace.answer_length} Zeichen
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Regenerations:</span>{" "}
              {trace.regeneration_count}
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Seiten gesammelt:</span>{" "}
              {trace.pages_gathered}
            </div>
            <div>
              <span className="text-[color:var(--ds-text-muted)]">Graph-Hits:</span>{" "}
              {trace.graph_hits}
            </div>
          </div>
          {trace.warnings.length > 0 && (
            <div className="mt-2">
              <span className="text-[color:var(--ds-text-muted)]">Warnungen:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {trace.warnings.map((w, i) => (
                  <Badge key={i} variant="default" className="font-mono text-xs">
                    {w}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
