"use client";

import { useState } from "react";
import { Table2, Loader2, Plus, X, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { TabularReviewResponse } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";

const DOC_TYPES = [
  { value: "legal_case", label: "Akten" },
  { value: "legal_document", label: "Dokumente" },
  { value: "bea_message", label: "beA-Nachrichten" },
  { value: "court_decision", label: "Urteile" },
  { value: "", label: "Alle Typen" },
];

export default function TabularReviewPage() {
  const [docType, setDocType] = useState("legal_case");
  const [limit, setLimit] = useState(15);
  const [questions, setQuestions] = useState<string[]>([
    "Wer sind die Parteien?",
    "Welche Fristen werden genannt?",
  ]);
  const [result, setResult] = useState<TabularReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setQuestion(i: number, v: string) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? v : q)));
  }
  function addQuestion() {
    setQuestions((qs) => (qs.length >= 8 ? qs : [...qs, ""]));
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  async function run() {
    const qs = questions.map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) {
      setError("Mindestens eine Frage angeben.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.tabularReview({
        type: docType || undefined,
        questions: qs,
        limit,
      });
      setResult(res);
      if (res.rows.length === 0) setError("Keine Dokumente für diesen Typ gefunden.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Massen-Review fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!result) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ["Dokument", ...result.questions].map(esc).join(",");
    const lines = result.rows.map((r) =>
      [r.title, ...r.cells.map((c) => c.answer)].map(esc).join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tabular-review-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="max-w-full space-y-6 p-4 md:p-8">
      <PageHeader
        title="Massen-Review"
        description="Eine Prüffrage gegen viele Dokumente — Antworten im Raster, jede Zelle mit Quelle"
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Massen-Review" }]}
      />

      {/* Konfiguration */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
              Dokumenttyp (Zeilen)
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
              Max. Dokumente
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Math.min(Math.max(1, Number(e.target.value) || 1), 50))}
              className="w-24 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs text-[color:var(--ds-text-muted)]">
            Fragen (Spalten, max. 8)
          </label>
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQuestion(i, e.target.value)}
                placeholder={`Frage ${i + 1}`}
                className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
              {questions.length > 1 && (
                <button
                  onClick={() => removeQuestion(i)}
                  className="p-2 text-[color:var(--ds-text-muted)] hover:text-red-600"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          {questions.length < 8 && (
            <button
              onClick={addQuestion}
              className="brand-text flex items-center gap-1.5 text-xs hover:underline"
            >
              <Plus size={13} /> Frage hinzufügen
            </button>
          )}
        </div>

        <Button onClick={run} disabled={loading} className="brand-bg brand-bg gap-2 text-white">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Table2 size={15} />}
          {loading ? "Analysiere…" : "Review starten"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Grid */}
      {result && result.rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {result.document_count} Dokumente × {result.questions.length} Fragen
              {result.truncated && (
                <span className="text-amber-600"> · gekürzt auf {result.document_count}</span>
              )}
            </p>
            <button
              onClick={exportCsv}
              className="brand-text flex items-center gap-1.5 text-xs hover:underline"
            >
              <Download size={13} /> CSV-Export
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[color:var(--ds-hover)]">
                  <th className="sticky left-0 min-w-[200px] bg-[color:var(--ds-hover)] px-4 py-3 text-left font-semibold text-[color:var(--ds-text)]">
                    Dokument
                  </th>
                  {result.questions.map((q, i) => (
                    <th
                      key={i}
                      className="min-w-[240px] border-l border-[color:var(--ds-border)] px-4 py-3 text-left font-medium text-[color:var(--ds-text-muted)]"
                    >
                      {q}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.slug}
                    className="border-t border-[color:var(--ds-border)] hover:bg-[color:var(--ds-surface)]/50"
                  >
                    <td className="sticky left-0 bg-[color:var(--ds-surface)] px-4 py-3 align-top font-medium text-[color:var(--ds-text)]">
                      <a href={`/dashboard/brain/${row.slug}`} className="hover:brand-text">
                        {row.title}
                      </a>
                    </td>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className="border-l border-[color:var(--ds-border)]/60 px-4 py-3 align-top leading-relaxed text-[color:var(--ds-text-muted)]"
                      >
                        {cell.answer}
                        {cell.citations.length > 0 && (
                          <span className="brand-text/70 mt-1 block text-xs">
                            ↳ {cell.citations[0].title}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Maschinell erzeugt — vor Verwendung prüfen. „nicht im Dokument&quot; heißt: die Frage
            wird vom jeweiligen Dokument nicht beantwortet.
          </p>
        </div>
      )}
    </div>
  );
}
