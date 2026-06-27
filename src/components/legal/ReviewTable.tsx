/**
 * Gap 6: Review Table — strukturierte Tabellen-Extraktion mit Zellen-Level-Zitaten.
 *
 * Harvey-Feature: "Extract and compare key data points from thousands of documents
 * at once in a structured, tabular format" with "sentence-level citations" and
 * "multi-color flagging".
 *
 * This component renders a structured review table from Brain page data
 * with per-cell citations, flags, and an "Ask Over Review" input.
 */

"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Flag, MessageSquare, Loader2 } from "lucide-react";
import { csrfFetch } from "@/lib/csrf";

export interface ReviewCell {
  value: string;
  quote?: string;
  source_slug?: string;
  flag?: "red" | "yellow" | "green" | null;
}

export interface ReviewRow {
  id: string;
  cells: Record<string, ReviewCell>;
}

export interface ReviewTableData {
  columns: Array<{ key: string; label: string; width?: string }>;
  rows: ReviewRow[];
  title: string;
  case_ref?: string;
}

interface ReviewTableProps {
  data: ReviewTableData;
  caseSlug?: string;
}

const FLAG_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700 border-red-300",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-300",
  green: "bg-green-100 text-green-700 border-green-300",
};

const FLAG_LABELS: Record<string, string> = {
  red: "Kritisch",
  yellow: "Warnung",
  green: "OK",
};

export function ReviewTable({ data, caseSlug }: ReviewTableProps) {
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [askQuery, setAskQuery] = useState("");
  const [askResponse, setAskResponse] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  const toggleCell = useCallback((rowId: string, colKey: string) => {
    const key = `${rowId}:${colKey}`;
    setExpandedCell((prev) => (prev === key ? null : key));
  }, []);

  const handleAsk = useCallback(async () => {
    if (!askQuery.trim() || !caseSlug) return;
    setAskLoading(true);
    setAskResponse(null);
    try {
      const res = await csrfFetch("/api/review-table/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: caseSlug,
          table_title: data.title,
          query: askQuery,
          columns: data.columns.map((c) => c.label),
          rows: data.rows.map((r) => ({
            id: r.id,
            cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, v.value])),
          })),
        }),
      });
      if (!res.ok) throw new Error(`Ask failed: ${res.status}`);
      const result = await res.json();
      setAskResponse(result.answer ?? result.error ?? "Keine Antwort");
    } catch (err) {
      setAskResponse(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAskLoading(false);
    }
  }, [askQuery, caseSlug, data]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[color:var(--ds-text)]">{data.title}</h3>
        {data.case_ref && (
          <span className="text-xs text-[color:var(--ds-text-muted)]">Akte: {data.case_ref}</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[color:var(--ds-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-hover)]">
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left font-medium text-[color:var(--ds-text)]"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[color:var(--ds-border)] last:border-0 hover:bg-[color:var(--ds-surface-hover)]/50"
              >
                {data.columns.map((col) => {
                  const cell = row.cells[col.key];
                  if (!cell) return <td key={col.key} className="px-3 py-2" />;
                  const cellKey = `${row.id}:${col.key}`;
                  const isExpanded = expandedCell === cellKey;
                  return (
                    <td key={col.key} className="px-3 py-2 align-top">
                      <div className="flex items-start gap-1.5">
                        <button
                          onClick={() => toggleCell(row.id, col.key)}
                          className="mt-0.5 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                          aria-label={isExpanded ? "Zitat ausblenden" : "Zitat anzeigen"}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <div className="flex-1">
                          <span className="text-[color:var(--ds-text)]">{cell.value}</span>
                          {cell.flag && (
                            <span
                              className={`ml-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${FLAG_COLORS[cell.flag]}`}
                            >
                              <Flag size={10} />
                              {FLAG_LABELS[cell.flag]}
                            </span>
                          )}
                          {isExpanded && cell.quote && (
                            <div className="mt-1.5 rounded border-l-2 border-blue-300 bg-blue-50 px-2 py-1.5 text-xs text-[color:var(--ds-text-muted)]">
                              <div className="flex items-start gap-1">
                                <MessageSquare size={12} className="mt-0.5 shrink-0" />
                                <div>
                                  <p className="italic">&ldquo;{cell.quote}&rdquo;</p>
                                  {cell.source_slug && (
                                    <p className="mt-1 text-[10px] text-[color:var(--ds-text-muted)]">
                                      Quelle: {cell.source_slug}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          {isExpanded && !cell.quote && (
                            <div className="mt-1.5 text-xs text-[color:var(--ds-text-muted)]">
                              Kein Zitat verfügbar
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ask Over Review */}
      {caseSlug && (
        <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] p-3">
          <label className="text-sm font-medium text-[color:var(--ds-text)]">
            Frage über die Tabelle stellen (Ask Over Review)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder="z.B. Welche Schadensposition ist am höchsten?"
              className="flex-1 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              onClick={handleAsk}
              disabled={askLoading || !askQuery.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {askLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <MessageSquare size={14} />
              )}
              Fragen
            </button>
          </div>
          {askResponse && (
            <div className="rounded-md bg-[color:var(--ds-surface-hover)] px-3 py-2 text-sm text-[color:var(--ds-text)]">
              {askResponse}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
