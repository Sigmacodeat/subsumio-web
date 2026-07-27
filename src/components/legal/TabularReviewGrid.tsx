"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type Column,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  FileText,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { TabularReviewCell, TabularReviewRow, TabularReviewRun } from "@/lib/types";

/**
 * Result grid for an async tabular review run: first column = document
 * (sticky, linked), then one column per question. Supports column sorting,
 * a document text filter, an errors-only toggle, per-question
 * found / not-found quick filters, row virtualization (>50 rows), per-row
 * retry for failed documents, and a cell detail dialog with the full answer
 * plus all verified verbatim citations (adapts the ReviewTable quote style).
 */

/**
 * "Not found" detection — mirrors the server contract. The async review
 * prompt (server/src/core/legal/tabular-review.ts, QUOTE_SYSTEM_PROMPT)
 * instructs the model to answer exactly "nicht im Dokument" when the document
 * does not answer a question; the server-side grounding check treats
 * /^nicht im dokument$/i (trimmed) and the "—" placeholder (documents without
 * analyzable text) as non-substantive. Keep in sync with that file.
 */
const NOT_FOUND_RE = /^nicht im dokument$/i;

export function isCellNotFound(cell: TabularReviewCell | undefined): boolean {
  if (!cell) return false;
  const answer = cell.answer.trim();
  return answer === "" || answer === "—" || NOT_FOUND_RE.test(answer);
}

/** Virtualization threshold (same convention as the dashboard DataTable). */
const VIRTUALIZE_ABOVE = 50;

type ColFilter = "all" | "found" | "not_found";

interface SelectedCell {
  slug: string;
  qIndex: number;
}

interface TabularReviewGridProps {
  run: TabularReviewRun;
  onRetryRow: (slug: string) => void;
  onRetryAll: () => void;
  retrying: boolean;
  onExportCsv: () => void;
}

export function TabularReviewGrid({
  run,
  onRetryRow,
  onRetryAll,
  retrying,
  onExportCsv,
}: TabularReviewGridProps) {
  const { t } = useLang();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [docFilter, setDocFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [colFilters, setColFilters] = useState<Record<number, ColFilter>>({});
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  const terminal = run.status === "done" || run.status === "partial" || run.status === "failed";
  const canRetry = terminal && !retrying;

  // Reset view-local state when a different run is opened.
  useEffect(() => {
    setSorting([]);
    setDocFilter("");
    setErrorsOnly(false);
    setColFilters({});
    setSelected(null);
  }, [run.run_slug]);

  const filteredRows = useMemo(() => {
    const docQuery = docFilter.trim().toLowerCase();
    const activeColFilters = Object.entries(colFilters).filter(([, mode]) => mode !== "all");
    return run.rows.filter((row) => {
      if (errorsOnly && row.status !== "error") return false;
      if (docQuery && !`${row.title} ${row.slug}`.toLowerCase().includes(docQuery)) return false;
      for (const [qIdx, mode] of activeColFilters) {
        // Pending/error rows carry no cells — they never match a column filter.
        if (row.status !== "done") return false;
        const notFound = isCellNotFound(row.cells?.[Number(qIdx)]);
        if (mode === "found" && notFound) return false;
        if (mode === "not_found" && !notFound) return false;
      }
      return true;
    });
  }, [run.rows, docFilter, errorsOnly, colFilters]);

  const columns = useMemo<ColumnDef<TabularReviewRow>[]>(
    () => [
      { id: "doc", accessorFn: (r) => r.title.toLowerCase(), header: "" },
      ...run.questions.map((_, i) => ({
        id: `q${i}`,
        accessorFn: (r: TabularReviewRow) => r.cells?.[i]?.answer.toLowerCase() ?? "",
        header: "",
      })),
    ],
    [run.questions]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.slug,
  });

  const rows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = rows.length > VIRTUALIZE_ABOVE;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 8,
    enabled: shouldVirtualize,
    getItemKey: (index) => rows[index]?.id ?? index,
  });
  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  // Re-measure row heights whenever the visible row set changes (live polls
  // replace pending skeletons with real answers of different height).
  useEffect(() => {
    if (shouldVirtualize) rowVirtualizer.measure();
  }, [shouldVirtualize, rows, rowVirtualizer]);

  const filtersActive =
    docFilter.trim() !== "" || errorsOnly || Object.values(colFilters).some((m) => m !== "all");

  function resetFilters() {
    setDocFilter("");
    setErrorsOnly(false);
    setColFilters({});
  }

  function renderRow(row: (typeof rows)[number], virtual?: { index: number; start: number }) {
    const original = row.original;
    const isError = original.status === "error";
    const isPending = original.status === "pending";
    return (
      <tr
        key={row.id}
        data-index={virtual?.index}
        ref={virtual ? rowVirtualizer.measureElement : undefined}
        style={
          virtual
            ? {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtual.start}px)`,
              }
            : undefined
        }
        className={cn(
          "border-b border-[color:var(--ds-border)] last:border-0",
          isError && "bg-[color:var(--ds-danger-bg)]/60",
          isPending && "opacity-60"
        )}
      >
        {/* Document column (sticky) */}
        <td
          className={cn(
            "sticky left-0 z-10 max-w-[280px] min-w-[220px] px-4 py-3 align-top shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]",
            isError ? "bg-[color:var(--ds-danger-bg)]" : "bg-[color:var(--ds-surface)]"
          )}
        >
          <Link
            href={`/dashboard/brain/${encodeURIComponent(original.slug)}`}
            className="hover:brand-text font-medium break-words text-[color:var(--ds-text)]"
          >
            {original.title}
          </Link>
          {isPending && (
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.row_pending")}
            </p>
          )}
          {isError && (
            <div className="mt-1.5 space-y-1.5">
              <p className="flex items-start gap-1 text-xs break-words text-[color:var(--ds-danger-text)]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{original.error ?? t("tabular.row_error_label")}</span>
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={!canRetry}
                onClick={() => onRetryRow(original.slug)}
              >
                {retrying ? (
                  <RotateCcw size={11} className="animate-spin" />
                ) : (
                  <RotateCcw size={11} />
                )}
                {t("tabular.retry_row")}
              </Button>
            </div>
          )}
        </td>

        {/* Question columns */}
        {run.questions.map((_, i) => {
          if (isPending) {
            return (
              <td
                key={i}
                className="max-w-[320px] min-w-[240px] border-l border-[color:var(--ds-border)]/60 px-4 py-3 align-top"
              >
                <Skeleton className="h-4 w-full max-w-[180px] rounded" />
              </td>
            );
          }
          if (isError) {
            return (
              <td
                key={i}
                className="max-w-[320px] min-w-[240px] border-l border-[color:var(--ds-border)]/60 px-4 py-3 align-top text-[color:var(--ds-text-muted)]"
              >
                —
              </td>
            );
          }
          const cell = original.cells?.[i];
          if (!cell) {
            return (
              <td
                key={i}
                className="max-w-[320px] min-w-[240px] border-l border-[color:var(--ds-border)]/60 px-4 py-3 align-top text-[color:var(--ds-text-muted)]"
              >
                —
              </td>
            );
          }
          const notFound = isCellNotFound(cell);
          return (
            <td
              key={i}
              className={cn(
                "max-w-[320px] min-w-[240px] cursor-pointer border-l border-[color:var(--ds-border)]/60 px-4 py-3 align-top transition-colors hover:bg-[color:var(--ds-hover)]",
                !notFound && cell.citations.length === 0 && "bg-[color:var(--ds-warning-bg)]/40"
              )}
              onClick={() => setSelected({ slug: original.slug, qIndex: i })}
            >
              {notFound ? (
                <span className="inline-flex items-center rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)] italic">
                  {t("tabular.cell_not_found_chip")}
                </span>
              ) : (
                <div className="space-y-1">
                  <span className="line-clamp-3 block text-sm leading-relaxed break-words text-[color:var(--ds-text)]">
                    {cell.answer}
                  </span>
                  {cell.citations.length > 0 ? (
                    <span className="brand-text/80 block text-xs">
                      ↳{" "}
                      {t("tabular.cell_citations_count").replace(
                        "{{count}}",
                        String(cell.citations.length)
                      )}
                    </span>
                  ) : (
                    <span className="block text-xs text-[color:var(--ds-warning-text)]">
                      ↳ {t("tabular.cell_no_quote_chip")}
                    </span>
                  )}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
          />
          <input
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
            placeholder={t("tabular.filter_doc_placeholder")}
            aria-label={t("tabular.filter_doc_placeholder")}
            className="w-52 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2 pr-3 pl-8 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text)]">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
            className="accent-[color:var(--brand-primary)]"
          />
          {t("tabular.filter_errors_only")}
        </label>
        {filtersActive && (
          <button onClick={resetFilters} className="brand-text text-xs hover:underline">
            {t("tabular.filters_reset")}
          </button>
        )}
        <span className="ml-auto text-xs text-[color:var(--ds-text-muted)] tabular-nums">
          {t("tabular.rows_shown")
            .replace("{{shown}}", String(filteredRows.length))
            .replace("{{total}}", String(run.rows.length))}
        </span>
        {run.progress.failed > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!canRetry}
            onClick={onRetryAll}
          >
            <RotateCcw size={12} className={retrying ? "animate-spin" : undefined} />
            {t("tabular.retry_all")}
          </Button>
        )}
        <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={onExportCsv}>
          <Download size={12} />
          {t("tabular.csv_export")}
        </Button>
      </div>

      {/* Grid */}
      <div
        ref={scrollRef}
        className={cn("overflow-x-auto rounded-xl border border-[color:var(--ds-border)]")}
        style={shouldVirtualize ? { maxHeight: "70vh", overflowY: "auto" } : undefined}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-[color:var(--ds-border)]">
              {/* Document header */}
              <th
                className="sticky left-0 z-30 max-w-[280px] min-w-[220px] bg-[color:var(--ds-surface-2)] px-4 py-3 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                aria-sort={sortAria(sorting, "doc")}
              >
                <SortButton label={t("tabular.col_document")} column={table.getColumn("doc")} />
              </th>
              {run.questions.map((q, i) => (
                <th
                  key={i}
                  className="max-w-[320px] min-w-[240px] border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 align-top"
                  aria-sort={sortAria(sorting, `q${i}`)}
                >
                  <SortButton label={q} column={table.getColumn(`q${i}`)} clamp />
                  <select
                    value={colFilters[i] ?? "all"}
                    onChange={(e) =>
                      setColFilters((prev) => ({ ...prev, [i]: e.target.value as ColFilter }))
                    }
                    aria-label={t("tabular.filter_col_label").replace("{{question}}", q)}
                    className="mt-1.5 w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-1 text-[0.6875rem] text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                  >
                    <option value="all">{t("tabular.filter_col_all")}</option>
                    <option value="found">{t("tabular.filter_col_found")}</option>
                    <option value="not_found">{t("tabular.filter_col_not_found")}</option>
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={run.questions.length + 1}
                  className="px-4 py-10 text-center text-sm text-[color:var(--ds-text-muted)]"
                >
                  {t("tabular.no_rows_match")}
                </td>
              </tr>
            ) : shouldVirtualize ? (
              <>
                {virtualRows.map((vr) => {
                  const row = rows[vr.index];
                  if (!row) return null;
                  return renderRow(row, { index: vr.index, start: vr.start });
                })}
                {rowVirtualizer.getTotalSize() > 0 && (
                  <tr aria-hidden="true" style={{ height: rowVirtualizer.getTotalSize() }} />
                )}
              </>
            ) : (
              rows.map((row) => renderRow(row))
            )}
          </tbody>
        </table>
      </div>

      {/* Cell detail dialog */}
      <CellDetailDialog run={run} selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ── Header sort button ─────────────────────────────────────────────

function sortAria(sorting: SortingState, id: string): "ascending" | "descending" | undefined {
  const entry = sorting.find((s) => s.id === id);
  return entry ? (entry.desc ? "descending" : "ascending") : undefined;
}

interface SortButtonProps {
  label: string;
  column: Column<TabularReviewRow, unknown> | undefined;
  clamp?: boolean;
}

function SortButton({ label, column, clamp }: SortButtonProps) {
  const sorted = column?.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column?.toggleSorting()}
      title={label}
      className="hover:brand-text flex w-full cursor-pointer items-start gap-1 text-left text-xs font-semibold text-[color:var(--ds-text)] select-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
    >
      <span className={clamp ? "line-clamp-2 break-words" : undefined}>{label}</span>
      <span className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]">
        {sorted === "desc" ? (
          <ChevronDown size={12} />
        ) : sorted === "asc" ? (
          <ChevronUp size={12} />
        ) : (
          <ChevronsUpDown size={12} className="text-[color:var(--ds-text-subtle)]" />
        )}
      </span>
    </button>
  );
}

// ── Cell detail dialog (ReviewTable quote pattern, adapted) ────────

interface CellDetailDialogProps {
  run: TabularReviewRun;
  selected: SelectedCell | null;
  onClose: () => void;
}

function CellDetailDialog({ run, selected, onClose }: CellDetailDialogProps) {
  const { t } = useLang();
  const row = selected ? run.rows.find((r) => r.slug === selected.slug) : undefined;
  const qIndex = selected?.qIndex ?? 0;
  const question = run.questions[qIndex] ?? "";
  const cell = row?.cells?.[qIndex];
  const notFound = isCellNotFound(cell);

  return (
    <Dialog open={!!selected} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{question}</DialogTitle>
          <DialogDescription className="break-words">{row?.title ?? ""}</DialogDescription>
        </DialogHeader>
        {cell && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                {t("tabular.cell_answer_label")}
              </p>
              {notFound ? (
                <span className="inline-flex items-center rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] italic">
                  {t("tabular.cell_not_found_chip")}
                </span>
              ) : (
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-[color:var(--ds-text)]">
                  {cell.answer}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                {t("tabular.cell_quotes_label")}
              </p>
              {cell.citations.length > 0 ? (
                <ul className="space-y-2">
                  {cell.citations.map((quote, i) => (
                    <li
                      key={i}
                      className="rounded-md border-l-2 border-[color:var(--brand-primary)]/60 bg-[color:var(--ds-hover)] px-3 py-2 text-xs leading-relaxed break-words text-[color:var(--ds-text-muted)] italic"
                    >
                      &bdquo;{quote}&ldquo;
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[color:var(--ds-warning-text)]">
                  {t("tabular.cell_no_quotes")}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--ds-border)] pt-3">
              <Link
                href={`/dashboard/brain/${encodeURIComponent(row?.slug ?? "")}`}
                className="brand-text inline-flex items-center gap-1.5 text-xs hover:underline"
              >
                <FileText size={12} />
                {t("tabular.cell_open_document")}
              </Link>
              <span className="text-xs text-[color:var(--ds-text-subtle)]">
                {t("tabular.cell_citations_count").replace(
                  "{{count}}",
                  String(cell.citations.length)
                )}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
