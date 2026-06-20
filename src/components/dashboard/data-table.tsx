"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Trash2, FileText, type LucideIcon } from "lucide-react";

export interface BulkAction {
  label: string;
  onClick: (selectedRows: string[]) => void;
  variant?: "default" | "destructive";
  icon?: LucideIcon;
  confirmTitle?: string;
  confirmMessage?: string;
}

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  sortAccessor?: (row: T) => string | number;
  cell: (row: T) => React.ReactNode;
  cardLabel?: (row: T) => string;
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRowClick?: (row: T) => void;
  className?: string;
  pageSize?: number;
  selectable?: boolean;
  onBulkAction?: (selectedRows: T[]) => void;
  bulkActionLabel?: string;
  bulkActionIcon?: LucideIcon;
  bulkActions?: BulkAction[];
  rowKey?: (row: T, index: number) => string;
}

type SortDirection = "asc" | "desc";

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyTitle = "Keine Einträge",
  emptyDescription,
  emptyIcon: EmptyIcon = FileText,
  emptyActionLabel,
  onEmptyAction,
  onRowClick,
  className,
  pageSize = 25,
  selectable = false,
  onBulkAction,
  bulkActionLabel = "Auswahl löschen",
  bulkActionIcon: BulkIcon = Trash2,
  bulkActions,
  rowKey,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);

  const getKey = useCallback((row: T, index: number) => rowKey ? rowKey(row, index) : String((row as { id?: string }).id ?? index), [rowKey]);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortAccessor) return data;
    const accessor = col.sortAccessor;
    const sortedData = [...data].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "de");
    });
    return sortDir === "desc" ? sortedData.reverse() : sortedData;
  }, [data, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const toggleSort = useCallback((key: string) => {
    setSortDir((prev) => {
      if (sortKey !== key) return "asc";
      return prev === "asc" ? "desc" : "asc";
    });
    setSortKey(key);
  }, [sortKey]);

  const allOnPageSelected = pageData.length > 0 && pageData.every((row, i) => selected.has(getKey(row, i)));
  const someOnPageSelected = pageData.some((row, i) => selected.has(getKey(row, i)));

  const toggleAllOnPage = useCallback(() => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      pageData.forEach((row, i) => { next.delete(getKey(row, i)); });
    } else {
      pageData.forEach((row, i) => { next.add(getKey(row, i)); });
    }
    setSelected(next);
  }, [allOnPageSelected, pageData, selected, getKey]);

  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedRows = useMemo(() => {
    return sorted.filter((row, i) => selected.has(getKey(row, i)));
  }, [sorted, selected, getKey]);

  const handleBulkAction = useCallback(() => {
    if (onBulkAction && selectedRows.length > 0) {
      onBulkAction(selectedRows);
      setSelected(new Set());
    }
  }, [onBulkAction, selectedRows]);

  const handleBulkActionClick = useCallback((action: BulkAction) => {
    const selectedIds = Array.from(selected);
    if (action.variant === "destructive" || action.confirmTitle) {
      setConfirmAction(action);
    } else {
      action.onClick(selectedIds);
      setSelected(new Set());
    }
  }, [selected]);

  const executeConfirmedAction = useCallback(() => {
    if (confirmAction) {
      confirmAction.onClick(Array.from(selected));
      setSelected(new Set());
      setConfirmAction(null);
    }
  }, [confirmAction, selected]);

  if (!loading && data.length === 0) {
    return (
      <EmptyState
        icon={EmptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Bulk action bar */}
      {selectable && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl brand-soft brand-border animate-in fade-in slide-in-from-top-1">
          <span className="text-xs font-medium brand-text">
            {selected.size} {selected.size === 1 ? "Eintrag" : "Einträge"} ausgewählt
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              Abbrechen
            </Button>
            {bulkActions ? (
              bulkActions.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleBulkActionClick(action)}
                    className={cn(
                      "text-xs gap-1.5",
                      action.variant === "destructive"
                        ? "text-red-600 hover:text-red-700 hover:bg-red-500/10"
                        : "text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]",
                    )}
                  >
                    {ActionIcon && <ActionIcon size={13} />}
                    {action.label}
                  </Button>
                );
              })
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBulkAction}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-500/10 gap-1.5"
              >
                <BulkIcon size={13} />
                {bulkActionLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog for destructive bulk actions */}
      {confirmAction && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="bg-[color:var(--ds-surface)] rounded-xl border border-[color:var(--ds-border)] p-6 max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-confirm-title"
            aria-describedby="bulk-confirm-desc"
          >
            <h2 id="bulk-confirm-title" className="text-sm font-semibold text-[color:var(--ds-text)]">
              {confirmAction.confirmTitle ?? "Aktion bestätigen"}
            </h2>
            <p id="bulk-confirm-desc" className="text-sm text-[color:var(--ds-text-muted)]">
              {confirmAction.confirmMessage ?? `Diese Aktion betrifft ${selected.size} ${selected.size === 1 ? "Eintrag" : "Einträge"}. Fortfahren?`}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
                Abbrechen
              </Button>
              <Button
                variant={confirmAction.variant === "destructive" ? "danger" : "primary"}
                size="sm"
                onClick={executeConfirmedAction}
                autoFocus
              >
                Bestätigen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] overflow-hidden card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                {selectable && (
                  <th className="px-4 py-3.5 w-10">
                    <Checkbox
                      checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Alle auf dieser Seite auswählen"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3.5 text-left text-[0.6875rem] font-semibold text-[color:var(--ds-text-muted)] uppercase tracking-wider",
                      col.sortable && "cursor-pointer hover:text-[color:var(--ds-text)] select-none transition-colors",
                      col.width
                    )}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                    aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="shrink-0">
                          {sortKey === col.key ? (
                            sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                          ) : (
                            <ChevronsUpDown size={12} className="text-[color:var(--ds-text-subtle)]" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: Math.min(5, pageSize) }).map((_, i) => (
                    <tr key={i} className="border-b border-[color:var(--ds-border)] last:border-0">
                      {selectable && <td className="px-4 py-4"><Skeleton className="h-4 w-4 rounded" /></td>}
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-[120px] rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                : pageData.map((row, i) => {
                    const key = getKey(row, i);
                    const isSelected = selected.has(key);
                    return (
                      <tr
                        key={key}
                        onClick={() => onRowClick?.(row)}
                        className={cn(
                          "border-b border-[color:var(--ds-border)] last:border-0 transition-colors",
                          onRowClick && !selectable && "cursor-pointer hover:bg-[color:var(--ds-hover)]",
                          isSelected && "brand-soft/30"
                        )}
                      >
                        {selectable && (
                          <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRow(key)}
                              aria-label={`Eintrag ${i + 1} auswählen`}
                            />
                          </td>
                        )}
                        {columns.map((col) => (
                          <td key={col.key} className={cn("px-4 py-3.5 text-[color:var(--ds-text)] leading-snug", col.width)}>
                            {col.cell(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-2">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))
          : pageData.map((row, i) => {
              const key = getKey(row, i);
              const isSelected = selected.has(key);
              return (
                <div
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-2 transition-all",
                    onRowClick && "cursor-pointer active:scale-[0.99]",
                    isSelected && "brand-border brand-soft/30"
                  )}
                >
                  {selectable && (
                    <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(key)}
                        aria-label={`Eintrag ${i + 1} auswählen`}
                      />
                    </div>
                  )}
                  {columns
                    .filter((c) => !c.hideOnMobile)
                    .map((col, colIdx) => (
                      <div key={col.key} className={cn(colIdx === 0 ? "text-sm font-medium text-[color:var(--ds-text)]" : "text-xs text-[color:var(--ds-text-muted)]")}>
                        {colIdx === 0 ? (
                          col.cell(row)
                        ) : (
                          <div className="flex items-start gap-2">
                            <span className="text-[color:var(--ds-text-subtle)] font-medium shrink-0">{col.header}:</span>
                            <span className="flex-1">{col.cell(row)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
      </div>

      {/* Pagination */}
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sorted.length)} von {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="h-8 w-8 p-0"
              aria-label="Vorherige Seite"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums px-2">
              {currentPage + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage(currentPage + 1)}
              className="h-8 w-8 p-0"
              aria-label="Nächste Seite"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
