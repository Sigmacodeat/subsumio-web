"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Table2, Loader2, Plus, X, AlertTriangle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import {
  useLegalCaseOptions,
  useTabularReviewRetry,
  useTabularReviewRun,
  useTabularReviewStart,
} from "@/lib/queries/tabular-review";
import { TabularReviewProgress } from "@/components/legal/TabularReviewProgress";
import { TabularReviewGrid } from "@/components/legal/TabularReviewGrid";

/** UI cap for question columns (the server allows up to 50). */
const MAX_QUESTIONS = 20;
/** UI cap for the type/limit fallback document count (server cap is 500). */
const MAX_LIMIT = 500;
/** localStorage key for the "Letzten Run fortsetzen" card. */
const LAST_RUN_KEY = "tabular-review:last-run";

const DOC_TYPES: Array<{ value: string; labelKey: DashboardKey }> = [
  { value: "legal_case", labelKey: "tabular.type_cases" },
  { value: "legal_document", labelKey: "tabular.type_documents" },
  { value: "bea_message", labelKey: "tabular.type_bea" },
  { value: "court_decision", labelKey: "tabular.type_decisions" },
  { value: "", labelKey: "tabular.type_all" },
];

interface LastRunInfo {
  run_slug: string;
  title: string;
  saved_at: string;
}

function TabularReviewPageInner() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runSlug = searchParams.get("run");

  // ── Configuration state ──
  const [sourceMode, setSourceMode] = useState<"type" | "case">("type");
  const [docType, setDocType] = useState("legal_case");
  const [limit, setLimit] = useState(25);
  const [caseSlug, setCaseSlug] = useState("");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<string[]>(["", ""]);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<LastRunInfo | null>(null);

  // ── Data ──
  const casesQuery = useLegalCaseOptions();
  const runQuery = useTabularReviewRun(runSlug);
  const startMutation = useTabularReviewStart();
  const retryMutation = useTabularReviewRetry(runSlug);
  const run = runQuery.data ?? null;

  // Load the remembered last run once (client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_RUN_KEY);
      if (raw) setLastRun(JSON.parse(raw) as LastRunInfo);
    } catch {
      // corrupt entry — ignore
    }
  }, []);

  // Remember the currently viewed run for "Letzten Run fortsetzen".
  const viewedSlug = run?.run_slug;
  const viewedTitle = run?.title;
  useEffect(() => {
    if (!viewedSlug) return;
    const info: LastRunInfo = {
      run_slug: viewedSlug,
      title: viewedTitle ?? viewedSlug,
      saved_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LAST_RUN_KEY, JSON.stringify(info));
    } catch {
      // storage full/blocked — non-fatal
    }
    setLastRun((prev) => (prev?.run_slug === info.run_slug ? prev : info));
  }, [viewedSlug, viewedTitle]);

  function openRun(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("run", slug);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearRun() {
    router.replace(pathname, { scroll: false });
  }

  function dismissLastRun() {
    setLastRun(null);
    try {
      localStorage.removeItem(LAST_RUN_KEY);
    } catch {}
  }

  // ── Questions editor ──
  function setQuestion(i: number, v: string) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? v : q)));
  }
  function addQuestion() {
    setQuestions((qs) => (qs.length >= MAX_QUESTIONS ? qs : [...qs, ""]));
  }
  function removeQuestion(i: number) {
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  }

  // ── Start ──
  async function start() {
    const qs = questions.map((q) => q.trim()).filter(Boolean);
    if (qs.length === 0) {
      setFormError(t("tabular.error_min_questions"));
      return;
    }
    if (sourceMode === "case" && !caseSlug) {
      setFormError(t("tabular.error_no_case"));
      return;
    }
    setFormError(null);
    try {
      const res = await startMutation.mutateAsync({
        questions: qs,
        ...(sourceMode === "case"
          ? { case_slug: caseSlug }
          : { ...(docType ? { type: docType } : {}), limit }),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      openRun(res.run_slug);
      addToast({ type: "success", description: t("tabular.run_started") });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("tabular.error_failed"));
      addToast({ type: "error", description: t("tabular.error_failed") });
    }
  }

  function retry(slugs?: string[]) {
    retryMutation.mutate(slugs, {
      onError: () => addToast({ type: "error", description: t("tabular.retry_failed") }),
    });
  }

  // ── CSV export (from the polled run state; BOM so Excel reads umlauts) ──
  function exportCsv() {
    if (!run) return;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = [
      t("tabular.col_document"),
      "Slug",
      t("tabular.col_status"),
      t("tabular.row_error_label"),
      ...run.questions,
    ]
      .map(esc)
      .join(",");
    const lines = run.rows.map((row) =>
      [
        row.title,
        row.slug,
        row.status,
        row.error ?? "",
        ...run.questions.map((_, i) => row.cells?.[i]?.answer ?? ""),
      ]
        .map(esc)
        .join(",")
    );
    const csv = `\uFEFF${[header, ...lines].join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const safeTitle =
      (run.title || "tabular-review")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "tabular-review";
    const date = (run.created_at || new Date().toISOString()).slice(0, 10);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeTitle}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tabular.title")}
        description={t("tabular.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("tabular.breadcrumb") },
        ]}
        actions={
          runSlug ? (
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={clearRun}>
              <Plus size={12} />
              {t("tabular.new_run")}
            </Button>
          ) : undefined
        }
      />

      {/* Letzten Run fortsetzen */}
      {!runSlug && lastRun && (
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
          <History size={16} className="brand-text shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("tabular.last_run_title")}
            </p>
            <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
              {lastRun.title}
              {" · "}
              {new Date(lastRun.saved_at).toLocaleString(lang === "en" ? "en-GB" : "de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={() => openRun(lastRun.run_slug)}
          >
            {t("tabular.last_run_open")}
          </Button>
          <button
            onClick={dismissLastRun}
            aria-label={t("tabular.last_run_dismiss")}
            className="p-1.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Konfiguration */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.source_label")}
            </label>
            <div className="flex rounded-lg border border-[color:var(--ds-border)] p-0.5">
              {[
                { mode: "type" as const, key: "tabular.source_type" as DashboardKey },
                { mode: "case" as const, key: "tabular.source_case" as DashboardKey },
              ].map(({ mode, key }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSourceMode(mode)}
                  aria-pressed={sourceMode === mode}
                  className={
                    sourceMode === mode
                      ? "brand-bg rounded-md px-3 py-1.5 text-xs font-medium text-white"
                      : "rounded-md px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  }
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {sourceMode === "type" ? (
            <>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                  {t("tabular.doc_type")}
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  aria-label={t("tabular.doc_type")}
                  className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
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
                  type="number" inputMode="numeric"
                  min={1}
                  max={MAX_LIMIT}
                  value={limit}
                  onChange={(e) =>
                    setLimit(Math.min(Math.max(1, Number(e.target.value) || 1), MAX_LIMIT))
                  }
                  aria-label={t("tabular.max_docs")}
                  className="w-24 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
                {t("tabular.source_case")}
              </label>
              <select
                value={caseSlug}
                onChange={(e) => setCaseSlug(e.target.value)}
                disabled={casesQuery.isLoading}
                aria-label={t("tabular.source_case")}
                className="min-w-[220px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 disabled:opacity-60"
              >
                <option value="">
                  {casesQuery.isLoading
                    ? t("tabular.cases_loading")
                    : t("tabular.case_select_placeholder")}
                </option>
                {(casesQuery.data ?? []).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.title_label")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tabular.title_placeholder")}
              aria-label={t("tabular.title_label")}
              maxLength={200}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
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
                className="flex-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
              />
              {questions.length > 1 && (
                <button
                  onClick={() => removeQuestion(i)}
                  aria-label={t("tabular.remove_question").replace("{{n}}", String(i + 1))}
                  className="p-2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-danger-text)]"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          {questions.length < MAX_QUESTIONS && (
            <button
              onClick={addQuestion}
              className="brand-text flex items-center gap-1.5 text-xs hover:underline"
            >
              <Plus size={13} /> {t("tabular.add_question")}
            </button>
          )}
        </div>

        <Button
          onClick={start}
          disabled={startMutation.isPending}
          className="brand-bg brand-bg gap-2 text-white"
        >
          {startMutation.isPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Table2 size={15} />
          )}
          {startMutation.isPending ? t("tabular.btn_starting") : t("tabular.btn_run")}
        </Button>
      </div>

      {formError && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]">
          <AlertTriangle size={16} /> {formError}
        </div>
      )}

      {/* Run-Ansicht: Fortschritt + Ergebnis-Raster */}
      {runSlug && (
        <section className="space-y-4">
          {runQuery.isLoading ? (
            <div
              className="flex items-center justify-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-12 text-sm text-[color:var(--ds-text-muted)]"
              role="status"
              aria-live="polite"
            >
              <Loader2 size={16} className="animate-spin" />
              {t("tabular.run_loading")}
            </div>
          ) : runQuery.isError ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                {t("tabular.run_error_load")}
                {runQuery.error instanceof Error ? ` — ${runQuery.error.message}` : ""}
              </span>
              <Button variant="secondary" size="sm" className="text-xs" onClick={clearRun}>
                {t("tabular.run_clear")}
              </Button>
            </div>
          ) : run ? (
            <>
              <TabularReviewProgress
                run={run}
                onRetryAll={() => retry()}
                retrying={retryMutation.isPending}
              />
              <TabularReviewGrid
                run={run}
                onRetryRow={(slug) => retry([slug])}
                onRetryAll={() => retry()}
                retrying={retryMutation.isPending}
                onExportCsv={exportCsv}
              />
              <p className="text-xs text-[color:var(--ds-text-muted)]">{t("tabular.disclaimer")}</p>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default function TabularReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TabularReviewPageInner />
    </Suspense>
  );
}
