"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Brain,
  Target,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Activity,
  Gauge,
  FileSearch,
  ThumbsUp,
  ThumbsDown,
  Send,
  Download,
  ChevronRight,
  X,
  Hash,
  Clock,
  Globe,
  Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────

interface HallucinationMetrics {
  total_traces: number;
  guardrail_pass_rate: number | null;
  cross_verify_clean_rate: number | null;
  hallucination_rate: number | null;
  regeneration_rate: number | null;
  avg_confidence: number | null;
  low_confidence_rate: number | null;
  avg_provenance_links: number | null;
  provenance_coverage: number | null;
}

interface GuardrailStats {
  total: number;
  tier_0_pass_rate: number | null;
  tier_0_fail_count: number;
  tier_0_regen_count: number;
  tier_1_pass_rate: number | null;
  tier_1_fail_count: number;
  tier_1_regen_count: number;
  avg_latency_ms: number | null;
}

interface CalibrationData {
  samples: { predicted_confidence: number; actual_correctness: number }[];
  ece: number;
  sample_count: number;
}

interface QualityReport {
  hallucination: HallucinationMetrics | null;
  guardrail_stats: GuardrailStats | null;
  calibration: CalibrationData;
  trace_count: number;
  days: number;
}

interface TraceRow {
  trace_id: string;
  timestamp: string;
  query: string;
  jurisdiction: string | null;
  model_used: string | null;
  guardrail_passed: boolean | null;
  cross_verify_clean: boolean | null;
  overall_confidence: number | null;
  regeneration_count: number;
  latency_ms: number | null;
  hash_chain: string | null;
  retrieved_chunk_count: number | null;
  provenance_links: unknown;
  warnings: string[] | null;
}

interface TraceDetail extends TraceRow {
  retrieved_chunks?: Array<{ slug: string; score: number; chunk_text?: string }>;
  citations?: Array<{ label: string; slug: string }>;
  guardrail_flags?: string[];
  synthesis_summary?: string;
}

interface TrendPoint {
  date: string;
  total_traces: number;
  guardrail_pass_rate: number | null;
  cross_verify_clean_rate: number | null;
  hallucination_rate: number | null;
  avg_confidence: number | null;
  regeneration_rate: number | null;
}

interface CalibrationTrendPoint {
  date: string;
  sample_count: number;
  ece: number | null;
}

type TabId = "overview" | "traces" | "trend";

// ─── Helpers ────────────────────────────────────────────────────────────

function rateStatus(rate: number | null, threshold = 90): "ok" | "warn" | "fail" | "neutral" {
  if (rate === null) return "neutral";
  if (rate >= threshold) return "ok";
  if (rate >= threshold - 10) return "warn";
  return "fail";
}

function hallucRateStatus(rate: number | null): "ok" | "warn" | "fail" | "neutral" {
  if (rate === null) return "neutral";
  if (rate <= 5) return "ok";
  if (rate <= 10) return "warn";
  return "fail";
}

function eceStatus(ece: number): "ok" | "warn" | "fail" {
  if (ece <= 0.05) return "ok";
  if (ece <= 0.15) return "warn";
  return "fail";
}

function fmtDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ─── MetricCard ─────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  suffix,
  icon: Icon,
  status,
}: {
  label: string;
  value: string | number | null | undefined;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: "ok" | "warn" | "fail" | "neutral";
}) {
  const colorClass =
    status === "ok"
      ? "text-emerald-600"
      : status === "warn"
        ? "text-amber-600"
        : status === "fail"
          ? "text-red-600"
          : "text-slate-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <Icon className={cn("h-4 w-4", colorClass)} />
      </div>
      <div className={cn("mt-2 text-2xl font-bold", colorClass)}>
        {value === null ? "—" : value}
        {suffix && value !== null && (
          <span className="ml-1 text-sm font-normal text-slate-400">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab({ report, onRefresh }: { report: QualityReport; onRefresh: () => void }) {
  const h = report.hallucination;
  const g = report.guardrail_stats;
  const c = report.calibration;
  const [feedbackTraceId, setFeedbackTraceId] = useState("");
  const [feedbackCorrect, setFeedbackCorrect] = useState<boolean | null>(null);
  const [feedbackConfidence, setFeedbackConfidence] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Hallucination Metrics */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Brain className="h-5 w-5 text-violet-600" />
          Halluzinations-Metriken
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Gesamte Traces"
            value={h?.total_traces ?? 0}
            icon={Activity}
            status="neutral"
          />
          <MetricCard
            label="Guardrail-Pass-Rate"
            value={h?.guardrail_pass_rate}
            suffix="%"
            icon={ShieldCheck}
            status={rateStatus(h?.guardrail_pass_rate ?? null)}
          />
          <MetricCard
            label="Cross-Verify-Clean-Rate"
            value={h?.cross_verify_clean_rate}
            suffix="%"
            icon={ShieldCheck}
            status={rateStatus(h?.cross_verify_clean_rate ?? null)}
          />
          <MetricCard
            label="Halluzinationsrate"
            value={h?.hallucination_rate}
            suffix="%"
            icon={ShieldAlert}
            status={hallucRateStatus(h?.hallucination_rate ?? null)}
          />
          <MetricCard
            label="Regenerationsrate"
            value={h?.regeneration_rate}
            suffix="%"
            icon={RefreshCw}
            status={rateStatus(h?.regeneration_rate ?? null, 95)}
          />
          <MetricCard
            label="Ø Confidence"
            value={h?.avg_confidence}
            icon={Gauge}
            status={
              h?.avg_confidence != null ? (h.avg_confidence >= 0.7 ? "ok" : "warn") : "neutral"
            }
          />
          <MetricCard
            label="Low-Confidence-Rate"
            value={h?.low_confidence_rate}
            suffix="%"
            icon={AlertTriangle}
            status={hallucRateStatus(h?.low_confidence_rate ?? null)}
          />
          <MetricCard
            label="Provenance-Abdeckung"
            value={h?.provenance_coverage}
            suffix="%"
            icon={FileSearch}
            status={rateStatus(h?.provenance_coverage ?? null)}
          />
        </div>
      </section>

      {/* Guardrail Stats */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          Guardrail-Statistiken
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Guardrail-Events"
            value={g?.total ?? 0}
            icon={Activity}
            status="neutral"
          />
          <MetricCard
            label="Tier 0 Pass-Rate"
            value={g?.tier_0_pass_rate}
            suffix="%"
            icon={ShieldCheck}
            status={rateStatus(g?.tier_0_pass_rate ?? null)}
          />
          <MetricCard
            label="Tier 0 Fails"
            value={g?.tier_0_fail_count ?? 0}
            icon={ShieldAlert}
            status={(g?.tier_0_fail_count ?? 0) > 0 ? "warn" : "ok"}
          />
          <MetricCard
            label="Tier 0 Regenerations"
            value={g?.tier_0_regen_count ?? 0}
            icon={RefreshCw}
            status="neutral"
          />
          <MetricCard
            label="Tier 1 Pass-Rate"
            value={g?.tier_1_pass_rate}
            suffix="%"
            icon={ShieldCheck}
            status={rateStatus(g?.tier_1_pass_rate ?? null)}
          />
          <MetricCard
            label="Tier 1 Fails"
            value={g?.tier_1_fail_count ?? 0}
            icon={ShieldAlert}
            status={(g?.tier_1_fail_count ?? 0) > 0 ? "warn" : "ok"}
          />
          <MetricCard
            label="Tier 1 Regenerations"
            value={g?.tier_1_regen_count ?? 0}
            icon={RefreshCw}
            status="neutral"
          />
          <MetricCard
            label="Ø Latency"
            value={g?.avg_latency_ms}
            suffix="ms"
            icon={Activity}
            status="neutral"
          />
        </div>
      </section>

      {/* Calibration ECE */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Target className="h-5 w-5 text-amber-600" />
          ECE-Kalibrierung
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard
            label="Expected Calibration Error"
            value={c ? Math.round(c.ece * 1000) / 1000 : 0}
            icon={Target}
            status={c ? eceStatus(c.ece) : "neutral"}
          />
          <MetricCard
            label="Calibration Samples"
            value={c?.sample_count ?? 0}
            icon={Activity}
            status="neutral"
          />
          <div className="rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">ECE-Interpretation</div>
            <div className="mt-2 text-sm text-slate-600">
              {c && c.sample_count === 0 ? (
                <span className="text-slate-400">
                  Noch keine Calibration-Samples. Sammle Attorney-Feedback über das Formular unten.
                </span>
              ) : c && c.ece <= 0.05 ? (
                <Badge className="bg-emerald-100 text-emerald-700">Exzellent kalibriert</Badge>
              ) : c && c.ece <= 0.15 ? (
                <Badge className="bg-amber-100 text-amber-700">Moderate Kalibrierung</Badge>
              ) : (
                <Badge className="bg-red-100 text-red-700">Schlechte Kalibrierung</Badge>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Calibration Feedback Form */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Target className="h-5 w-5 text-amber-600" />
          Attorney-Feedback (ECE-Kalibrierung)
        </h2>
        <div className="rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] p-4 shadow-sm">
          <p className="mb-4 text-sm text-slate-500">
            Bewerte eine KI-Antwort als korrekt oder inkorrekt. Dies speichert ein
            Calibration-Sample für die ECE-Berechnung und verbessert die Confidence-Kalibrierung.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">Trace-ID</label>
              <input
                type="text"
                value={feedbackTraceId}
                onChange={(e) => setFeedbackTraceId(e.target.value)}
                placeholder="UUID der Reasoning Trace"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">
                Predicted Confidence (0–1)
              </label>
              <input
                type="number" inputMode="decimal"
                step="0.01"
                min="0"
                max="1"
                value={feedbackConfidence}
                onChange={(e) => setFeedbackConfidence(e.target.value)}
                placeholder="z.B. 0.75"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-slate-600">Bewertung</label>
            <div className="flex gap-2">
              <Button
                variant={feedbackCorrect === true ? "primary" : "outline"}
                size="sm"
                onClick={() => setFeedbackCorrect(true)}
              >
                <ThumbsUp className="mr-2 h-4 w-4" />
                Korrekt
              </Button>
              <Button
                variant={feedbackCorrect === false ? "primary" : "outline"}
                size="sm"
                onClick={() => setFeedbackCorrect(false)}
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Inkorrekt
              </Button>
            </div>
          </div>
          {feedbackMsg && (
            <div
              className={cn(
                "mt-3 rounded-md p-2 text-sm",
                feedbackMsg.includes("Fehler")
                  ? "bg-red-50 text-red-700"
                  : "bg-emerald-50 text-emerald-700"
              )}
            >
              {feedbackMsg}
            </div>
          )}
          <div className="mt-4">
            <Button
              size="sm"
              disabled={
                !feedbackTraceId ||
                feedbackCorrect === null ||
                !feedbackConfidence ||
                feedbackSubmitting
              }
              onClick={async () => {
                setFeedbackSubmitting(true);
                setFeedbackMsg(null);
                try {
                  const res = await csrfFetch("/api/monitoring/calibration-feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      trace_id: feedbackTraceId,
                      predicted_confidence: parseFloat(feedbackConfidence),
                      actual_correctness: feedbackCorrect ? 1 : 0,
                    }),
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  setFeedbackMsg("Calibration-Sample gespeichert.");
                  setFeedbackTraceId("");
                  setFeedbackConfidence("");
                  setFeedbackCorrect(null);
                  onRefresh();
                } catch (err) {
                  setFeedbackMsg(`Fehler: ${err instanceof Error ? err.message : "unbekannt"}`);
                } finally {
                  setFeedbackSubmitting(false);
                }
              }}
            >
              {feedbackSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Feedback senden
            </Button>
          </div>
        </div>
      </section>

      {/* Empty state */}
      {h === null && (g?.total ?? 0) === 0 && (c?.sample_count ?? 0) === 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
          <Brain className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            Noch keine KI-Qualitätsdaten verfügbar. Sobald Anfragen über den Think-Pipeline
            verarbeitet werden, werden hier automatisch Halluzinations-Metriken, Guardrail-Stats und
            Calibration-Daten angezeigt.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Traces Tab ─────────────────────────────────────────────────────────

function TracesTab() {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<TraceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTraces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/monitoring/reasoning-traces?limit=100", { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { traces: TraceRow[]; count: number };
      setTraces(data.traces ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTraces();
  }, [loadTraces]);

  const openTrace = useCallback(async (traceId: string) => {
    setDetailLoading(true);
    setSelectedTrace(null);
    try {
      const res = await csrfFetch(`/api/monitoring/reasoning-traces/${traceId}`, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSelectedTrace(data.trace ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trace konnte nicht geladen werden");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCsvExport = useCallback(() => {
    const url = "/api/monitoring/reasoning-traces?format=csv&limit=500";
    void csrfFetch(url, { method: "GET" }).then(async (res) => {
      if (!res.ok) return;
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `reasoning-traces-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        {error}
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <Brain className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">
          Noch keine Reasoning Traces gespeichert. Sobald Anfragen über den Think-Pipeline
          verarbeitet werden, werden hier die Traces mit Query, Guardrail-Status und Hash-Chain
          angezeigt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{traces.length} Traces geladen</p>
        <Button variant="outline" size="sm" onClick={handleCsvExport}>
          <Download className="mr-2 h-4 w-4" />
          CSV-Export (EU AI Act Art. 13)
        </Button>
      </div>

      {/* Trace Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Zeit</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Query</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Jur</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Guard</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Cross-V</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Conf</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Regen</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Modell</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {traces.map((t) => (
              <tr
                key={t.trace_id}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() => openTrace(t.trace_id)}
              >
                <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">
                  {fmtDate(t.timestamp)}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-slate-700">
                  {truncate(t.query || "—", 60)}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="default" className="text-xs">
                    {t.jurisdiction || "—"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {t.guardrail_passed === true ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : t.guardrail_passed === false ? (
                    <ShieldAlert className="h-4 w-4 text-red-600" />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {t.cross_verify_clean === true ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  ) : t.cross_verify_clean === false ? (
                    <ShieldAlert className="h-4 w-4 text-red-600" />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {t.overall_confidence !== null ? Number(t.overall_confidence).toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {t.regeneration_count > 0 ? (
                    <Badge className="bg-amber-100 text-amber-700">{t.regeneration_count}×</Badge>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {truncate(t.model_used || "—", 20)}
                </td>
                <td className="px-3 py-2">
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trace Detail Modal */}
      {(selectedTrace || detailLoading) && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via the dialog's close button.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !detailLoading) setSelectedTrace(null);
          }}
        >
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-[color:var(--ds-surface)] p-6 shadow-xl">
            {detailLoading ? (
              <div
                className="flex items-center justify-center py-12"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : selectedTrace ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-800">Trace Detail</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTrace(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Meta info */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-600">{fmtDate(selectedTrace.timestamp)}</span>
                  </div>
                  {selectedTrace.jurisdiction && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">{selectedTrace.jurisdiction}</span>
                    </div>
                  )}
                  {selectedTrace.model_used && (
                    <div className="flex items-center gap-2 text-sm">
                      <Cpu className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">{selectedTrace.model_used}</span>
                    </div>
                  )}
                  {selectedTrace.latency_ms !== null && (
                    <div className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">{selectedTrace.latency_ms}ms</span>
                    </div>
                  )}
                </div>

                {/* Query */}
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-700">Query</h4>
                  <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-800">
                    {selectedTrace.query || "—"}
                  </div>
                </div>

                {/* Guardrail Status */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Guardrail</div>
                    <div className="mt-1">
                      {selectedTrace.guardrail_passed === true ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Passed</Badge>
                      ) : selectedTrace.guardrail_passed === false ? (
                        <Badge className="bg-red-100 text-red-700">Failed</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Cross-Verify</div>
                    <div className="mt-1">
                      {selectedTrace.cross_verify_clean === true ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Clean</Badge>
                      ) : selectedTrace.cross_verify_clean === false ? (
                        <Badge className="bg-red-100 text-red-700">Flagged</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Confidence</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {selectedTrace.overall_confidence !== null
                        ? Number(selectedTrace.overall_confidence).toFixed(3)
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">Regenerations</div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {selectedTrace.regeneration_count}
                    </div>
                  </div>
                </div>

                {/* Hash Chain */}
                {selectedTrace.hash_chain && (
                  <div>
                    <h4 className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
                      <Hash className="h-4 w-4" />
                      Hash-Chain (Integrität)
                    </h4>
                    <div className="rounded-md bg-slate-50 p-3 font-mono text-xs break-all text-slate-600">
                      {selectedTrace.hash_chain}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {selectedTrace.warnings && selectedTrace.warnings.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-slate-700">Warnings</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedTrace.warnings.map((w, i) => (
                        <Badge key={i} variant="default" className="text-xs">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Retrieved Chunks */}
                {selectedTrace.retrieved_chunks && selectedTrace.retrieved_chunks.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-slate-700">
                      Retrieved Chunks ({selectedTrace.retrieved_chunks.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedTrace.retrieved_chunks.slice(0, 10).map((c, i) => (
                        <div key={i} className="rounded-md border border-slate-200 p-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-slate-600">{c.slug}</span>
                            <span className="text-slate-500">Score: {c.score.toFixed(3)}</span>
                          </div>
                          {c.chunk_text && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                              {truncate(c.chunk_text, 120)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Citations */}
                {selectedTrace.citations && selectedTrace.citations.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-slate-700">
                      Zitate ({selectedTrace.citations.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedTrace.citations.map((c, i) => (
                        <Badge key={i} variant="default" className="text-xs">
                          {c.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trend Tab ──────────────────────────────────────────────────────────

function TrendTab({ days }: { days: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [traceTrend, setTraceTrend] = useState<TrendPoint[]>([]);
  const [calibTrend, setCalibTrend] = useState<CalibrationTrendPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    csrfFetch(`/api/monitoring/quality-trend?days=${days}`, { method: "GET" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setTraceTrend(data.trace_trend ?? []);
          setCalibTrend(data.calibration_trend ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertTriangle className="mr-2 inline h-4 w-4" />
        {error}
      </div>
    );
  }

  if (traceTrend.length === 0 && calibTrend.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <TrendingUp className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500">
          Noch keine Trend-Daten verfügbar. Sobald genügend Traces gesammelt wurden, werden hier
          Zeitverläufe für Hallucination-Rate, Guardrail-Pass-Rate und ECE angezeigt.
        </p>
      </div>
    );
  }

  const chartData = traceTrend.map((t) => ({
    date: t.date.slice(5),
    "Guardrail-Pass %": t.guardrail_pass_rate,
    "Cross-Verify %": t.cross_verify_clean_rate,
    "Hallucination %": t.hallucination_rate,
    "Ø Confidence": t.avg_confidence !== null ? Math.round(t.avg_confidence * 100) : null,
    Traces: t.total_traces,
  }));

  const calibChartData = calibTrend.map((c) => ({
    date: c.date.slice(5),
    "ECE (MAE)": c.ece,
    Samples: c.sample_count,
  }));

  return (
    <div className="space-y-6">
      {/* Quality Trend Chart */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <TrendingUp className="h-5 w-5 text-violet-600" />
          Qualitäts-Trend ({days} Tage)
        </h2>
        <div className="rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] p-4 shadow-sm">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }} stroke="var(--ds-text-subtle)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }} stroke="var(--ds-text-subtle)" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: "var(--ds-surface)", borderRadius: 8, border: "1px solid var(--ds-border)", color: "var(--ds-text)", fontSize: 12 }}
                  labelStyle={{ fontWeight: 600, color: "var(--ds-text)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  y={90}
                  stroke="var(--signal-success-500)"
                  strokeDasharray="5 5"
                  label={{ value: "Target 90%", fontSize: 10, fill: "var(--signal-success-500)" }}
                />
                <Line
                  type="monotone"
                  dataKey="Guardrail-Pass %"
                  stroke="var(--brand-primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Cross-Verify %"
                  stroke="var(--accent-premium)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="Hallucination %"
                  stroke="var(--signal-danger-500)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Keine Trace-Daten im Zeitraum</p>
          )}
        </div>
      </section>

      {/* Confidence Trend */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Gauge className="h-5 w-5 text-amber-600" />
          Confidence & Trace-Volume
        </h2>
        <div className="rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] p-4 shadow-sm">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }} stroke="var(--ds-text-subtle)" />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }} stroke="var(--ds-text-subtle)" domain={[0, 100]} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }}
                  stroke="var(--ds-text-subtle)"
                />
                <Tooltip
                  contentStyle={{ background: "var(--ds-surface)", borderRadius: 8, border: "1px solid var(--ds-border)", color: "var(--ds-text)", fontSize: 12 }}
                  labelStyle={{ fontWeight: 600, color: "var(--ds-text)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Ø Confidence"
                  stroke="var(--signal-warning-500)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Traces"
                  stroke="var(--ds-text-muted)"
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Keine Daten</p>
          )}
        </div>
      </section>

      {/* Calibration ECE Trend */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Target className="h-5 w-5 text-emerald-600" />
          ECE-Kalibrierung Trend
        </h2>
        <div className="rounded-lg border border-slate-200 bg-[color:var(--ds-surface)] p-4 shadow-sm">
          {calibChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={calibChartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ds-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }} stroke="var(--ds-text-subtle)" />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }} stroke="var(--ds-text-subtle)" domain={[0, 1]} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }}
                  stroke="var(--ds-text-subtle)"
                />
                <Tooltip
                  contentStyle={{ background: "var(--ds-surface)", borderRadius: 8, border: "1px solid var(--ds-border)", color: "var(--ds-text)", fontSize: 12 }}
                  labelStyle={{ fontWeight: 600, color: "var(--ds-text)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  yAxisId="left"
                  y={0.05}
                  stroke="var(--signal-success-500)"
                  strokeDasharray="5 5"
                  label={{ value: "ECE 0.05", fontSize: 10, fill: "var(--signal-success-500)" }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="ECE (MAE)"
                  stroke="var(--signal-success-500)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Samples"
                  stroke="var(--ds-text-muted)"
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Noch keine Calibration-Samples im Zeitraum
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function AiQualityPage() {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await csrfFetch(`/api/monitoring/quality-report?days=${days}`, {
          method: "GET",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as QualityReport;
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: Array<{
    id: TabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "overview", label: "Übersicht", icon: Gauge },
    { id: "traces", label: "Traces", icon: Brain },
    { id: "trend", label: "Trend", icon: TrendingUp },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("ai_quality.title") || "KI-Qualitätsmonitoring"}
        description={
          t("ai_quality.desc") ||
          "Halluzinations-Metriken, Guardrail-Stats, ECE-Kalibrierung und Reasoning Traces"
        }
        breadcrumbs={[
          { label: t("breadcrumb.dashboard") || "Dashboard", href: "/dashboard" },
          { label: t("ai_quality.breadcrumb") || "KI-Qualität" },
        ]}
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              variant={days === d ? "primary" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
          Aktualisieren
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-violet-600 text-violet-600"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <>
          {loading && (
            <div
              className="flex items-center justify-center py-12"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
              {error}
            </div>
          )}
          {report && !loading && <OverviewTab report={report} onRefresh={() => load(true)} />}
        </>
      )}

      {activeTab === "traces" && <TracesTab />}

      {activeTab === "trend" && <TrendTab days={days} />}
    </div>
  );
}
