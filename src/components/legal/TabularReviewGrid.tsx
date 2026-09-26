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
  /** WP-7.39: Bulk-Retry nur für ausgewählte Zeilen. */
  onRetryRows?: (slugs: string[]) => void;
  /** WP-7.39/44: XLSX-Export (ausgewählte oder gefilterte Zeilen). */
  onExportXlsx?: (rows: TabularReviewRow[]) => void;
}

/** Gruppen-Schlüssel einer Zeile für die Auto-Gruppierung (WP-7.39):
 *  Fehler/Ausstehend/nicht gefunden sind feste Buckets, sonst die
 *  normalisierte Antwort (gekappt). */
function rowGroupKey(row: TabularReviewRow, qIndex: number): string {
  if (row.status === "error") return "__error";
  if (row.status !== "done") return "__pending";
  const cell = row.cells?.[qIndex];
  if (isCellNotFound(cell)) return "__not_found";
  return (cell?.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "__empty";
}

const GROUP_KEY_LABELS: Record<string, string> = {
  __error: "Fehler",
  __pending: "Ausstehend",
  __not_found: "nicht im Dokument",
  __empty: "(leer)",
};

export function TabularReviewGrid({
  run,
  onRetryRow,
  onRetryAll,
  retrying,
  onExportCsv,
  onRetryRows,
  onExportXlsx,
}: TabularReviewGridProps) {
  const { t } = useLang();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [docFilter, setDocFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [colFilters, setColFilters] = useState<Record<number, ColFilter>>({});
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  // WP-7.39: Zeilen-Auswahl (Bulk-Aktionen) + Auto-Gruppierung nach Frage.
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
  const [groupBy, setGroupBy] = useState<number | "">("");

  const terminal = run.status === "done" || run.status === "partial" || run.status === "failed";
  const canRetry = terminal && !retrying;

  // Reset view-local state when a different run is opened.
  useEffect(() => {
    setSorting([]);
    setDocFilter("");
    setErrorsOnly(false);
    setColFilters({});
    setSelected(null);
    setSelectedRows(new Set());
    setGroupBy("");
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

  // WP-7.39: Gruppierung — sortierte Buckets über den aktuellen (gefilterten)
  // Zeilen; bei aktiver Gruppierung wird nicht virtualisiert, damit die
  // Gruppenheader im normalen Tabellenfluss stehen.
  const groupedRows = useMemo(() => {
    if (groupBy === "") return null;
    const buckets = new Map<string, TabularReviewRow[]>();
    for (const r of rows) {
      const key = rowGroupKey(r.original, groupBy);
      const list = buckets.get(key) ?? [];
      list.push(r.original);
      buckets.set(key, list);
    }
    return [...buckets.entries()].sort(([a], [b]) => {
      const order = (k: string) =>
        k === "__error" ? 0 : k === "__pending" ? 1 : k === "__not_found" ? 3 : 2;
      return order(a) - order(b) || a.localeCompare(b);
    });
  }, [groupBy, rows]);

  function toggleRow(slug: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedRows.has(r.slug));

  function toggleAllFiltered() {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredRows.forEach((r) => next.delete(r.slug));
      else filteredRows.forEach((r) => next.add(r.slug));
      return next;
    });
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = rows.length > VIRTUALIZE_ABOVE && groupedRows === null;
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
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selectedRows.has(original.slug)}
              onChange={() => toggleRow(original.slug)}
              aria-label={`Zeile „${original.title}" auswählen`}
              className="mt-0.5 shrink-0 accent-[color:var(--brand-primary)]"
            />
            <Link
              href={`/dashboard/brain/${encodeURIComponent(original.slug)}`}
              className="hover:brand-text font-medium break-words text-[color:var(--ds-text)]"
            >
              {original.title}
            </Link>
          </div>
          {isPending && (
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {t("tabular.row_pending")}
            </p>
          )}
          {isError && (
            <div className="mt-1.5 space-y-1.5">
              <p className="flex items-start gap-1 text-xs break-words text-[color:var(--ds-danger-text)]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>Dieses Dokument konnte nicht ausgewertet werden.</span>
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
              // Zugänglicher Name = sichtbarer Zellinhalt (kein aria-label, das ihn überschreibt).
              role="button"
              tabIndex={0}
              className={cn(
                "max-w-[320px] min-w-[240px] cursor-pointer border-l border-[color:var(--ds-border)]/60 px-4 py-3 align-top transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none",
                !notFound && cell.citations.length === 0 && "bg-[color:var(--ds-warning-bg)]/40"
              )}
              onClick={() => setSelected({ slug: original.slug, qIndex: i })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected({ slug: original.slug, qIndex: i });
                }
              }}
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
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value === "" ? "" : Number(e.target.value))}
          aria-label={t("tabular.group_by_label")}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-2 text-xs text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
        >
          <option value="">{t("tabular.group_by_none")}</option>
          {run.questions.map((q, i) => (
            <option key={i} value={i}>
              {t("tabular.group_by_prefix")} {q.length > 40 ? `${q.slice(0, 40)}…` : q}
            </option>
          ))}
        </select>
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
        {onExportXlsx && (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() =>
              onExportXlsx(
                selectedRows.size > 0
                  ? run.rows.filter((r) => selectedRows.has(r.slug))
                  : filteredRows
              )
            }
          >
            <Download size={12} />
            {t("tabular.xlsx_export")}
          </Button>
        )}
      </div>

      {/* WP-7.39: Bulk-Aktionsleiste für ausgewählte Zeilen */}
      {selectedRows.size > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-2 text-xs"
        >
          <span className="font-medium text-[color:var(--ds-text)]">
            {t("tabular.selected_count").replace("{{n}}", String(selectedRows.size))}
          </span>
          {onRetryRows && canRetry && (
            <button
              onClick={() => onRetryRows([...selectedRows])}
              disabled={retrying}
              className="brand-text inline-flex items-center gap-1 hover:underline disabled:opacity-50"
            >
              <RotateCcw size={11} className={retrying ? "animate-spin" : undefined} />
              {t("tabular.retry_selected")}
            </button>
          )}
          <button
            onClick={() => setSelectedRows(new Set())}
            className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:underline"
          >
            {t("tabular.selection_clear")}
          </button>
        </div>
      )}

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
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    aria-label={t("tabular.select_all")}
                    className="shrink-0 accent-[color:var(--brand-primary)]"
                  />
                  <SortButton label={t("tabular.col_document")} column={table.getColumn("doc")} />
                </div>
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
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td
                  colSpan={run.questions.length + 1}
                  className="px-4 py-10 text-center text-sm text-[color:var(--ds-text-muted)]"
                >
                  {t("tabular.no_rows_match")}
                </td>
              </tr>
            </tbody>
          ) : groupedRows ? (
            groupedRows.map(([key, groupRows]) => (
              <tbody key={key}>
                <tr aria-hidden="true" className="bg-[color:var(--ds-surface-2)]">
                  <td
                    colSpan={run.questions.length + 1}
                    className="px-4 py-2 text-xs font-semibold text-[color:var(--ds-text-muted)]"
                  >
                    {GROUP_KEY_LABELS[key] ?? key}{" "}
                    <span className="font-normal tabular-nums">({groupRows.length})</span>
                  </td>
                </tr>
                {groupRows.map((original) => {
                  const row = rows.find((r) => r.original.slug === original.slug);
                  return row ? renderRow(row) : null;
                })}
              </tbody>
            ))
          ) : (
            <tbody>
              {shouldVirtualize ? (
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
          )}
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
