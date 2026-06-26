"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  type ColumnPinningState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FileText,
  Loader2,
  Pin,
  PinOff,
  type LucideIcon,
} from "lucide-react";

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
  pinLeft?: boolean;
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
  bulkActionLoading?: boolean;
  bulkActions?: BulkAction[];
  rowKey?: (row: T, index: number) => string;
  enableVirtualization?: boolean;
}

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
  bulkActionLoading = false,
  bulkActions,
  rowKey,
  enableVirtualization = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(() => {
    const pinned = columns.filter((c) => c.pinLeft).map((c) => c.key);
    return pinned.length > 0 ? { left: pinned } : {};
  });

  const getKey = useCallback(
    (row: T, index: number) =>
      rowKey ? rowKey(row, index) : String((row as { id?: string }).id ?? index),
    [rowKey]
  );

  const tanstackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        header: col.header,
        cell: ({ row }) => col.cell(row.original),
        enableSorting: col.sortable,
        accessorFn: col.sortAccessor ? (row) => col.sortAccessor!(row) : undefined,
      })),
    [columns]
  );

  const table = useReactTable({
    data,
    columns: tanstackColumns,
    state: { sorting, columnPinning },
    onSortingChange: setSorting,
    onColumnPinningChange: setColumnPinning,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    getRowId: (row, index) => getKey(row, index),
  });

  const rows = table.getRowModel().rows;
  const totalPages = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex;

  const tableBodyRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = enableVirtualization && rows.length > 50;

  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => tableBodyRef.current,
    estimateSize: () => 48,
    overscan: 10,
    enabled: shouldVirtualize,
  });

  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const totalHeight = shouldVirtualize ? rowVirtualizer.getTotalSize() : 0;

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someOnPageSelected = rows.some((row) => selected.has(row.id));

  const toggleAllOnPage = useCallback(() => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      rows.forEach((row) => next.delete(row.id));
    } else {
      rows.forEach((row) => next.add(row.id));
    }
    setSelected(next);
  }, [allOnPageSelected, rows, selected]);

  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)).map((row) => row.original),
    [rows, selected]
  );

  const pinnedLeft = columnPinning.left ?? [];

  const togglePin = useCallback((colKey: string) => {
    setColumnPinning((prev) => {
      const left = prev.left ?? [];
      if (left.includes(colKey)) {
        return { ...prev, left: left.filter((k) => k !== colKey) };
      }
      return { ...prev, left: [...left, colKey] };
    });
  }, []);

  const handleBulkAction = useCallback(() => {
    if (onBulkAction && selectedRows.length > 0) {
      onBulkAction(selectedRows);
      setSelected(new Set());
    }
  }, [onBulkAction, selectedRows]);

  const handleBulkActionClick = useCallback(
    (action: BulkAction) => {
      const selectedIds = Array.from(selected);
      if (action.variant === "destructive" || action.confirmTitle) {
        setConfirmAction(action);
      } else {
        action.onClick(selectedIds);
        setSelected(new Set());
      }
    },
    [selected]
  );

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
        <div className="brand-soft brand-border animate-in fade-in slide-in-from-top-1 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5">
          <span className="brand-text text-xs font-medium">
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
                      "gap-1.5 text-xs",
                      action.variant === "destructive"
                        ? "text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                        : "text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
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
                disabled={bulkActionLoading}
                className="gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
              >
                {bulkActionLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <BulkIcon size={13} />
                )}
                {bulkActionLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog for destructive bulk actions */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bulk-confirm-title"
            aria-describedby="bulk-confirm-desc"
          >
            <h2
              id="bulk-confirm-title"
              className="text-sm font-semibold text-[color:var(--ds-text)]"
            >
              {confirmAction.confirmTitle ?? "Aktion bestätigen"}
            </h2>
            <p id="bulk-confirm-desc" className="text-sm text-[color:var(--ds-text-muted)]">
              {confirmAction.confirmMessage ??
                `Diese Aktion betrifft ${selected.size} ${selected.size === 1 ? "Eintrag" : "Einträge"}. Fortfahren?`}
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
      <div className="card-shadow hidden overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] md:block">
        <div
          ref={tableBodyRef}
          className={cn("overflow-x-auto", shouldVirtualize && "overflow-y-auto")}
          style={shouldVirtualize ? { maxHeight: "70vh" } : undefined}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                {selectable && (
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={
                        allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false
                      }
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Alle auf dieser Seite auswählen"
                    />
                  </th>
                )}
                {columns.map((col) => {
                  const isPinned = pinnedLeft.includes(col.key);
                  const sortEntry = sorting.find((s) => s.id === col.key);
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-left text-[0.6875rem] font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase",
                        col.sortable &&
                          "cursor-pointer transition-colors select-none hover:text-[color:var(--ds-text)]",
                        col.width,
                        isPinned &&
                          "sticky left-0 z-10 bg-[color:var(--ds-surface-2)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                      )}
                      onClick={
                        col.sortable
                          ? () => {
                              const header = table
                                .getHeaderGroups()[0]
                                ?.headers.find((h) => h.id === col.key);
                              header?.column.toggleSorting();
                            }
                          : undefined
                      }
                      aria-sort={
                        sortEntry ? (sortEntry.desc ? "descending" : "ascending") : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {col.sortable && (
                          <span className="shrink-0">
                            {sortEntry ? (
                              sortEntry.desc ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronUp size={12} />
                              )
                            ) : (
                              <ChevronsUpDown
                                size={12}
                                className="text-[color:var(--ds-text-subtle)]"
                              />
                            )}
                          </span>
                        )}
                        {col.sortable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(col.key);
                            }}
                            className="ml-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-[color:var(--ds-text)]"
                            aria-label={isPinned ? "Spalte lösen" : "Spalte anheften"}
                            title={isPinned ? "Spalte lösen" : "Spalte anheften"}
                          >
                            {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
                          </button>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: Math.min(5, pageSize) }).map((_, i) => (
                  <tr key={i} className="border-b border-[color:var(--ds-border)] last:border-0">
                    {selectable && (
                      <td className="px-4 py-4">
                        <Skeleton className="h-4 w-4 rounded" />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-4">
                        <Skeleton className="h-4 w-full max-w-[120px] rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : shouldVirtualize ? (
                <>
                  {virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    const key = row.id;
                    const isSelected = selected.has(key);
                    return (
                      <tr
                        key={key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                          height: `${virtualRow.size}px`,
                        }}
                        onClick={() => onRowClick?.(row.original)}
                        className={cn(
                          "group border-b border-[color:var(--ds-border)] transition-colors duration-120 last:border-0",
                          onRowClick &&
                            !selectable &&
                            "cursor-pointer hover:bg-[color:var(--ds-hover)]",
                          isSelected ? "brand-soft/30" : "border-l-2 border-l-transparent",
                          onRowClick &&
                            !isSelected &&
                            "hover:border-l-2 hover:border-l-[color:var(--brand-primary)]"
                        )}
                      >
                        {selectable && (
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRow(key)}
                              aria-label={`Eintrag ${virtualRow.index + 1} auswählen`}
                            />
                          </td>
                        )}
                        {columns.map((col) => {
                          const isPinned = pinnedLeft.includes(col.key);
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-4 py-3 leading-snug text-[color:var(--ds-text)]",
                                col.width,
                                isPinned &&
                                  "sticky left-0 z-10 bg-[color:var(--ds-surface)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                              )}
                            >
                              {col.cell(row.original)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {totalHeight > 0 && <tr style={{ height: totalHeight }} />}
                </>
              ) : (
                rows.map((row, i) => {
                  const key = row.id;
                  const isSelected = selected.has(key);
                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick?.(row.original)}
                      className={cn(
                        "group border-b border-[color:var(--ds-border)] transition-colors duration-120 last:border-0",
                        onRowClick &&
                          !selectable &&
                          "cursor-pointer hover:bg-[color:var(--ds-hover)]",
                        isSelected ? "brand-soft/30" : "border-l-2 border-l-transparent",
                        onRowClick &&
                          !isSelected &&
                          "hover:border-l-2 hover:border-l-[color:var(--brand-primary)]"
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(key)}
                            aria-label={`Eintrag ${i + 1} auswählen`}
                          />
                        </td>
                      )}
                      {columns.map((col) => {
                        const isPinned = pinnedLeft.includes(col.key);
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "px-4 py-4 leading-snug text-[color:var(--ds-text)]",
                              col.width,
                              isPinned &&
                                "sticky left-0 z-10 bg-[color:var(--ds-surface)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                            )}
                          >
                            {col.cell(row.original)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
              >
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))
          : rows.map((row, i) => {
              const key = row.id;
              const isSelected = selected.has(key);
              return (
                <div
                  key={key}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    "space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-150 duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    onRowClick &&
                      "cursor-pointer hover:border-[color:var(--brand-primary)]/40 active:scale-[0.99]",
                    isSelected && "brand-border brand-soft/30"
                  )}
                >
                  {selectable && (
                    <div
                      className="flex items-center justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                      <div
                        key={col.key}
                        className={cn(
                          colIdx === 0
                            ? "text-sm font-medium text-[color:var(--ds-text)]"
                            : "text-xs text-[color:var(--ds-text-muted)]"
                        )}
                      >
                        {colIdx === 0 ? (
                          col.cell(row.original)
                        ) : (
                          <div className="flex items-start gap-2">
                            <span className="shrink-0 font-medium text-[color:var(--ds-text-subtle)]">
                              {col.header}:
                            </span>
                            <span className="flex-1">{col.cell(row.original)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
      </div>

      {/* Pagination */}
      {rows.length > pageSize && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, data.length)} von{" "}
            {data.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => table.previousPage()}
              className="h-8 w-8 p-0"
              aria-label="Vorherige Seite"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="px-2 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              {currentPage + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages - 1}
              onClick={() => table.nextPage()}
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
