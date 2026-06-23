"use client";

import { useState } from "react";
import { Table2, Loader2, Plus, X, Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { TabularReviewResponse } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

const DOC_TYPES: Array<{ value: string; labelKey: DashboardKey }> = [
  { value: "legal_case", labelKey: "tabular.type_cases" },
  { value: "legal_document", labelKey: "tabular.type_documents" },
  { value: "bea_message", labelKey: "tabular.type_bea" },
  { value: "court_decision", labelKey: "tabular.type_decisions" },
  { value: "", labelKey: "tabular.type_all" },
];

export default function TabularReviewPage() {
  const { t } = useLang();
  const [docType, setDocType] = useState("legal_case");
  const [limit, setLimit] = useState(15);
  const [questions, setQuestions] = useState<string[]>(["", ""]);
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
      setError(t("tabular.error_min_questions"));
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
      if (res.rows.length === 0) setError(t("tabular.error_no_docs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tabular.error_failed"));
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
        title={t("tabular.title")}
        description={t("tabular.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("tabular.breadcrumb") },
        ]}
      />

      {/* Konfiguration */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.doc_type")}
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            >
              {DOC_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {t(dt.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.max_docs")}
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
            {t("tabular.questions_label")}
          </label>
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQuestion(i, e.target.value)}
                placeholder={t("tabular.question_placeholder").replace("{{n}}", String(i + 1))}
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
              <Plus size={13} /> {t("tabular.add_question")}
            </button>
          )}
        </div>

        <Button onClick={run} disabled={loading} className="brand-bg brand-bg gap-2 text-white">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Table2 size={15} />}
          {loading ? t("tabular.btn_running") : t("tabular.btn_run")}
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
              {t("tabular.result_summary")
                .replace("{{docs}}", String(result.document_count))
                .replace("{{questions}}", String(result.questions.length))}
              {result.truncated && (
                <span className="text-amber-600">
                  {" "}
                  · {t("tabular.truncated").replace("{{count}}", String(result.document_count))}
                </span>
              )}
            </p>
            <button
              onClick={exportCsv}
              className="brand-text flex items-center gap-1.5 text-xs hover:underline"
            >
              <Download size={13} /> {t("tabular.csv_export")}
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[color:var(--ds-hover)]">
                  <th className="sticky left-0 min-w-[200px] bg-[color:var(--ds-hover)] px-4 py-3 text-left font-semibold text-[color:var(--ds-text)]">
                    {t("tabular.col_document")}
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
                      <a
                        href={`/dashboard/brain/${encodeURIComponent(row.slug)}`}
                        className="hover:brand-text"
                      >
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
          <p className="text-xs text-[color:var(--ds-text-muted)]">{t("tabular.disclaimer")}</p>
        </div>
      )}
    </div>
  );
}
