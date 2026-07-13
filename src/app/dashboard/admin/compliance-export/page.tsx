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
  citations: unknown[];
  retrieved_chunks_count: number;
  citations_count: number;
}

interface TracesResponse {
  traces: ReasoningTrace[];
  count: number;
}

export default function ComplianceExportPage() {
  const [limit, setLimit] = useState(50);

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
    <div className="space-y-6">
      <PageHeader
        title="Compliance Audit Log"
        description="EU AI Act Art. 12 — Reasoning Traces"
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
            <CardTitle className="text-sm font-medium">Total Traces</CardTitle>
            <FileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-muted-foreground text-xs">AI outputs logged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guardrail Pass</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.guardrailPassed}</div>
            <p className="text-muted-foreground text-xs">{stats.guardrailFailed} failed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Injection Detected</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.injectionDetected}</div>
            <p className="text-muted-foreground text-xs">{stats.injectionBlocked} blocked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
            <Hash className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgConfidence}</div>
            <p className="text-muted-foreground text-xs">{stats.regenerations} regenerations</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">EU AI Act Art. 12 Compliance</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Every AI output is captured as an immutable, hash-chained reasoning trace. Traces
            include retrieval context, guardrail results, ensemble verification, adversarial defense
            scans, and confidence scores.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="default" className="text-xs">
              <Hash className="mr-1 h-3 w-3" />
              Hash-chained
            </Badge>
            <Badge variant="default" className="text-xs">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Immutable
            </Badge>
            <Badge variant="default" className="text-xs">
              <FileText className="mr-1 h-3 w-3" />
              CSV / JSON Export
            </Badge>
            <Badge variant="default" className="text-xs">
              <Clock className="mr-1 h-3 w-3" />
              10-year retention
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Trace List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Reasoning Traces</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground flex items-center justify-center py-8">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading traces...
            </div>
          ) : traces.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-8">
              <FileText className="mb-2 h-8 w-8" />
              <p>No reasoning traces found.</p>
              <p className="text-xs">Traces are created when AI outputs are generated.</p>
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
      className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ChevronRight
            className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground max-w-[120px] truncate font-mono text-xs">
                {trace.trace_id.slice(0, 8)}...
              </span>
              <span className="text-muted-foreground text-xs">{time}</span>
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
                  Blocked
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
        <div className="text-muted-foreground flex shrink-0 items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            {trace.model_used.split(":").pop()}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {trace.latency_ms ? `${(trace.latency_ms / 1000).toFixed(1)}s` : "—"}
          </span>
          <span>{trace.retrieved_chunks_count} chunks</span>
          <span>{trace.citations_count} citations</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <span className="text-muted-foreground">Trace ID:</span>{" "}
              <code className="font-mono">{trace.trace_id}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Model:</span>{" "}
              <code className="font-mono">{trace.model_used}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Query Hash:</span>{" "}
              <code className="font-mono">{trace.query_hash.slice(0, 16)}...</code>
            </div>
            <div>
              <span className="text-muted-foreground">Answer Hash:</span>{" "}
              <code className="font-mono">{trace.final_answer_hash.slice(0, 16)}...</code>
            </div>
            <div>
              <span className="text-muted-foreground">Trace Hash:</span>{" "}
              <code className="font-mono">{trace.trace_hash.slice(0, 16)}...</code>
            </div>
            <div>
              <span className="text-muted-foreground">Prev Hash:</span>{" "}
              <code className="font-mono">
                {trace.prev_trace_hash ? trace.prev_trace_hash.slice(0, 16) + "..." : "—"}
              </code>
            </div>
            <div>
              <span className="text-muted-foreground">Answer Length:</span> {trace.answer_length}{" "}
              chars
            </div>
            <div>
              <span className="text-muted-foreground">Regenerations:</span>{" "}
              {trace.regeneration_count}
            </div>
            <div>
              <span className="text-muted-foreground">Pages Gathered:</span> {trace.pages_gathered}
            </div>
            <div>
              <span className="text-muted-foreground">Graph Hits:</span> {trace.graph_hits}
            </div>
          </div>
          {trace.warnings.length > 0 && (
            <div className="mt-2">
              <span className="text-muted-foreground">Warnings:</span>
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
