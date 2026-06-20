"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Target,
  ShieldCheck,
  ShieldAlert,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Star,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { scoreGrade, type EvalSummary, type EvalResult } from "@/lib/rag-eval";
import type { ReleaseGateResult, GateCheck } from "@/lib/release-gate";
import type { ReviewFeedbackSummary } from "@/lib/human-review";
import { PageHeader } from "@/components/dashboard/page-header";

interface EvalHistoryResponse {
  history: EvalSummary[];
  baseline: EvalSummary | null;
  totalRuns: number;
}

export default function RagEvalPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<EvalSummary[]>([]);
  const [baseline, setBaseline] = useState<EvalSummary | null>(null);
  const [gateResult, setGateResult] = useState<ReleaseGateResult | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewFeedbackSummary | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [settingBaseline, setSettingBaseline] = useState(false);

  const loadHistoryAndGate = useCallback(async () => {
    try {
      const [histRes, gateRes, reviewRes] = await Promise.all([
        csrfFetch("/api/rag-eval", { method: "GET" }),
        csrfFetch("/api/release-gate", { method: "GET" }),
        csrfFetch("/api/human-review", { method: "GET" }),
      ]);

      if (histRes.ok) {
        const histData = (await histRes.json()) as EvalHistoryResponse;
        setHistory(histData.history ?? []);
        setBaseline(histData.baseline);
      }
      if (gateRes.ok) {
        const gateData = await gateRes.json();
        setGateResult(gateData as ReleaseGateResult);
      }
      if (reviewRes.ok) {
        const reviewData = await reviewRes.json();
        setReviewSummary(reviewData as ReviewFeedbackSummary);
      }
    } catch {
      // Non-fatal — sidebar data is best-effort
    }
  }, []);

  useEffect(() => {
    loadHistoryAndGate();
  }, [loadHistoryAndGate]);

  async function runEval() {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/rag-eval", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eval fehlgeschlagen");
      setResult(data as EvalSummary);
      if (data.gate) {
        setGateResult(data.gate as ReleaseGateResult);
      }
      loadHistoryAndGate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function setAsBaseline() {
    setSettingBaseline(true);
    try {
      const res = await csrfFetch("/api/rag-eval", { method: "PUT" });
      if (res.ok) {
        loadHistoryAndGate();
      }
    } catch {
      // Non-fatal
    } finally {
      setSettingBaseline(false);
    }
  }

  const grade = result
    ? scoreGrade(result.overallPrecision, result.overallRecall, result.overallMrr)
    : null;

  const gateIcon =
    gateResult?.status === "pass" ? (
      <ShieldCheck size={16} className="text-emerald-600" />
    ) : gateResult?.status === "warn" ? (
      <AlertTriangle size={16} className="text-amber-600" />
    ) : gateResult?.status === "fail" ? (
      <ShieldAlert size={16} className="text-red-600" />
    ) : null;

  const gateColor =
    gateResult?.status === "pass" ? "emerald" : gateResult?.status === "warn" ? "amber" : "red";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="RAG-Eval & Quality Gate"
        description="Retrieval-Qualitäts-Benchmark, Release-Gate und Human Review"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "RAG-Eval" }]}
        actions={
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <Button
                variant="outline"
                className="gap-2 text-sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History size={14} />
                Historie ({history.length})
              </Button>
            )}
            <Button
              variant="primary"
              className="brand-bg brand-bg gap-2 text-sm text-white"
              onClick={runEval}
              disabled={loading}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {loading ? "Laufe…" : "Eval starten"}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Release Gate Status */}
      {gateResult && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4",
            gateColor === "emerald" && "border-emerald-500/20 bg-emerald-500/5",
            gateColor === "amber" && "border-amber-500/20 bg-amber-500/5",
            gateColor === "red" && "border-red-500/20 bg-red-500/5"
          )}
        >
          <div className="mt-0.5 shrink-0">{gateIcon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                Release-Gate
              </span>
              <Badge
                variant="default"
                className={cn(
                  "border text-xs",
                  gateColor === "emerald" &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  gateColor === "amber" &&
                    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                  gateColor === "red" &&
                    "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                )}
              >
                {gateResult.status === "pass"
                  ? "Freigegeben"
                  : gateResult.status === "warn"
                    ? "Warnung"
                    : "Blockiert"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{gateResult.summary}</p>
            {gateResult.checks.length > 0 && (
              <div className="mt-3 space-y-1">
                {gateResult.checks.map((check: GateCheck) => (
                  <div key={check.name} className="flex items-center gap-2 text-xs">
                    {check.status === "pass" && (
                      <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
                    )}
                    {check.status === "warn" && (
                      <AlertTriangle size={12} className="shrink-0 text-amber-600" />
                    )}
                    {check.status === "fail" && (
                      <XCircle size={12} className="shrink-0 text-red-600" />
                    )}
                    <span className="text-[color:var(--ds-text-muted)]">{check.message}</span>
                  </div>
                ))}
              </div>
            )}
            {baseline && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={setAsBaseline}
                  disabled={settingBaseline}
                >
                  {settingBaseline ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Star size={12} />
                  )}
                  Aktuellen Run als Baseline setzen
                </Button>
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  Baseline: {new Date(baseline.timestamp).toLocaleString("de-DE")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Human Review Summary */}
      {reviewSummary && reviewSummary.total > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={14} className="text-[color:var(--ds-text-muted)]" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Human Review Feedback
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="text-center">
              <div className="text-xl font-bold text-[color:var(--ds-text)]">
                {reviewSummary.total}
              </div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Reviews gesamt</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-600">{reviewSummary.correct}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Korrekt</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-red-600">{reviewSummary.incorrect}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Falsch</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-amber-600">{reviewSummary.incomplete}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Unvollständig</div>
            </div>
          </div>
          {reviewSummary.total > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-[color:var(--ds-text-muted)]">Accuracy Rate</span>
                <span className="text-[color:var(--ds-text)]">
                  {(reviewSummary.accuracy_rate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${reviewSummary.accuracy_rate * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <History size={14} className="text-[color:var(--ds-text-muted)]" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Eval-Historie</h2>
          </div>
          <div className="space-y-2">
            {history.slice(0, 10).map((run, i) => {
              const prevRun = history[i + 1];
              const pDelta = prevRun ? run.overallPrecision - prevRun.overallPrecision : 0;
              const rDelta = prevRun ? run.overallRecall - prevRun.overallRecall : 0;
              const isBaseline = baseline?.timestamp === run.timestamp;
              return (
                <div
                  key={run.timestamp}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[color:var(--ds-text)]">
                        {new Date(run.timestamp).toLocaleString("de-DE")}
                      </span>
                      {isBaseline && (
                        <Badge
                          variant="default"
                          className="shrink-0 border border-blue-500/30 bg-blue-500/10 text-xs text-blue-700 dark:text-blue-400"
                        >
                          Baseline
                        </Badge>
                      )}
                      <Badge
                        variant="default"
                        className="brand-border brand-soft brand-text shrink-0 border text-xs"
                      >
                        v{run.fixtureVersion}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                      P={(run.overallPrecision * 100).toFixed(1)}% · R=
                      {(run.overallRecall * 100).toFixed(1)}% · MRR={run.overallMrr.toFixed(3)} ·{" "}
                      {run.totalQueries} Queries
                    </div>
                  </div>
                  {prevRun && (
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      {pDelta !== 0 && (
                        <span
                          className={cn(
                            "flex items-center gap-0.5",
                            pDelta > 0 ? "text-emerald-600" : "text-red-600"
                          )}
                        >
                          {pDelta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {Math.abs(pDelta * 100).toFixed(1)}%
                        </span>
                      )}
                      {pDelta === 0 && (
                        <Minus size={10} className="text-[color:var(--ds-text-muted)]" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result && grade && (
        <>
          {/* Overall Score */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div
              className={cn(
                "rounded-xl border p-4 text-center",
                `border-${grade.color}-500/20 bg-${grade.color}-500/5`
              )}
            >
              <div className={cn("text-2xl font-bold", `text-${grade.color}-400`)}>
                {grade.label}
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">Gesamtbewertung</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {(result.overallPrecision * 100).toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">Precision@10</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">
                {(result.overallRecall * 100).toFixed(1)}%
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">Recall@10</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">
                {result.overallMrr.toFixed(3)}
              </div>
              <div className="mt-1 text-xs text-[color:var(--ds-text-muted)]">MRR</div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
              Nach Kategorie
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {Object.entries(result.byCategory).map(([cat, stats]) => (
                <div
                  key={cat}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                >
                  <div className="mb-2 text-xs tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                    {cat}
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">Precision</span>
                      <span className="text-[color:var(--ds-text)]">
                        {(stats.precision * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">Recall</span>
                      <span className="text-[color:var(--ds-text)]">
                        {(stats.recall * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">MRR</span>
                      <span className="text-[color:var(--ds-text)]">{stats.mrr.toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Query Results */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
              Einzelergebnisse
            </h2>
            <div className="space-y-2">
              {result.results.map((r: EvalResult) => {
                const pass = r.precision >= 0.5 || r.recall >= 0.5;
                return (
                  <div
                    key={r.queryId}
                    className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        pass ? "bg-emerald-500/10" : "bg-red-500/10"
                      )}
                    >
                      {pass ? (
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      ) : (
                        <XCircle size={16} className="text-red-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-[color:var(--ds-text)]">
                          {r.query}
                        </span>
                        <Badge
                          variant="default"
                          className="brand-border brand-soft brand-text shrink-0 border text-xs"
                        >
                          {r.category}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        P={(r.precision * 100).toFixed(0)}% · R={(r.recall * 100).toFixed(0)}% ·
                        MRR={r.mrr.toFixed(2)} · {r.retrievedSlugs.length} Treffer
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Eval-Lauf: {new Date(result.timestamp).toLocaleString("de-DE")} · Fixture v
            {result.fixtureVersion} · {result.totalQueries} Queries
          </p>
        </>
      )}

      {!result && !error && !loading && (
        <div className="space-y-4 py-20 text-center">
          <Target size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <div>
            <p className="text-[color:var(--ds-text-muted)]">Noch kein Eval durchgeführt.</p>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
              Klicke „Eval starten&ldquo;, um die Retrieval-Qualität Ihres Brains zu benchmarken.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
