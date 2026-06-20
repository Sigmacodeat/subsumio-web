"use client";

import { useState } from "react";
import { Loader2, Play, CheckCircle2, XCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { scoreGrade, type EvalSummary, type EvalResult } from "@/lib/rag-eval";
import { PageHeader } from "@/components/dashboard/page-header";

export default function RagEvalPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runEval() {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/rag-eval", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eval fehlgeschlagen");
      setResult(data as EvalSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eval fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  const grade = result ? scoreGrade(result.overallPrecision, result.overallRecall, result.overallMrr) : null;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="RAG-Eval"
        description="Retrieval-Qualitäts-Benchmark"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "RAG-Eval" }]}
        actions={
          <Button
            variant="primary"
            className="brand-bg brand-bg text-white gap-2 text-sm"
            onClick={runEval}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {loading ? "Laufe…" : "Eval starten"}
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && grade && (
        <>
          {/* Overall Score */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className={cn("rounded-xl border p-4 text-center", `border-${grade.color}-500/20 bg-${grade.color}-500/5`)}>
              <div className={cn("text-2xl font-bold", `text-${grade.color}-400`)}>{grade.label}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)] mt-1">Gesamtbewertung</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{(result.overallPrecision * 100).toFixed(1)}%</div>
              <div className="text-xs text-[color:var(--ds-text-muted)] mt-1">Precision@10</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">{(result.overallRecall * 100).toFixed(1)}%</div>
              <div className="text-xs text-[color:var(--ds-text-muted)] mt-1">Recall@10</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-center">
              <div className="text-2xl font-bold text-amber-600">{result.overallMrr.toFixed(3)}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)] mt-1">MRR</div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)] mb-3">Nach Kategorie</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(result.byCategory).map(([cat, stats]) => (
                <div key={cat} className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                  <div className="text-xs text-[color:var(--ds-text-muted)] uppercase tracking-wider mb-2">{cat}</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">Precision</span>
                      <span className="text-[color:var(--ds-text)]">{(stats.precision * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[color:var(--ds-text-muted)]">Recall</span>
                      <span className="text-[color:var(--ds-text)]">{(stats.recall * 100).toFixed(1)}%</span>
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
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)] mb-3">Einzelergebnisse</h2>
            <div className="space-y-2">
              {result.results.map((r: EvalResult) => {
                const pass = r.precision >= 0.5 || r.recall >= 0.5;
                return (
                  <div key={r.queryId} className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", pass ? "bg-emerald-500/10" : "bg-red-500/10")}>
                      {pass ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[color:var(--ds-text)] truncate">{r.query}</span>
                        <Badge variant="default" className="text-[10px] border brand-border brand-soft brand-text shrink-0">{r.category}</Badge>
                      </div>
                      <div className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">
                        P={(r.precision * 100).toFixed(0)}% · R={(r.recall * 100).toFixed(0)}% · MRR={r.mrr.toFixed(2)} · {r.retrievedSlugs.length} Treffer
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-[color:var(--ds-text-muted)]">Eval-Lauf: {new Date(result.timestamp).toLocaleString("de-DE")}</p>
        </>
      )}

      {!result && !error && !loading && (
        <div className="text-center py-20 space-y-4">
          <Target size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <div>
            <p className="text-[color:var(--ds-text-muted)]">Noch kein Eval durchgeführt.</p>
            <p className="text-[color:var(--ds-text-muted)] text-sm mt-1">
              Klicke „Eval starten“, um die Retrieval-Qualität Ihres Brains zu benchmarken.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
