/**
 * Gap 9: Chronology Builder UI — interaktive Timeline.
 *
 * Harvey-Feature: "Create chronologies" als Kern-Feature.
 *
 * Rendert eine Chronologie als vertikale Timeline mit:
 * - Farbcodierung nach Wichtigkeit (rot/gelb/grün)
 * - Kategorien-Icons
 * - Aufklappbare Zitate
 * - Export als Markdown/JSON/Word
 */

"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  FileText,
  Gavel,
  AlertTriangle,
  DollarSign,
  Clock,
  Download,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Chronology, ChronologyEntry } from "@/lib/legal/chronology-builder";
import { exportChronologyMarkdown } from "@/lib/legal/chronology-builder";

const CATEGORY_ICONS: Record<string, typeof Calendar> = {
  procedure: Gavel,
  hearing: FileText,
  filing: FileText,
  deadline: Clock,
  payment: DollarSign,
  other: Calendar,
};

const IMPORTANCE_COLORS: Record<string, string> = {
  high: "border-l-red-500 bg-red-50",
  medium: "border-l-yellow-500 bg-yellow-50",
  low: "border-l-green-500 bg-green-50",
};

const SOURCE_LABELS: Record<string, string> = {
  forensic: "Forensischer Bericht",
  on_table: "ON-Tabelle",
  damage: "Schadensliste",
  deadline: "Fristenkalender",
  manual: "Manuell",
};

interface ChronologyTimelineProps {
  chronology: Chronology;
}

export function ChronologyTimeline({ chronology }: ChronologyTimelineProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [filterImportance, setFilterImportance] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const filteredEntries = useMemo(() => {
    return chronology.entries.filter((e) => {
      if (filterImportance !== "all" && e.importance !== filterImportance) return false;
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      return true;
    });
  }, [chronology.entries, filterImportance, filterCategory]);

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportMarkdown = () => {
    const md = exportChronologyMarkdown(chronology);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Chronologie_${chronology.case_slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(chronology, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Chronologie_${chronology.case_slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportWord = async () => {
    const md = exportChronologyMarkdown(chronology);
    try {
      const res = await fetch("/api/word-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: md,
          title: `Chronologie — ${chronology.case_slug}`,
        }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Chronologie_${chronology.case_slug}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Word export failed:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[color:var(--ds-text)]">{chronology.title}</h3>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {chronology.entries.length} Einträge · Generiert am{" "}
            {new Date(chronology.generated_at).toLocaleDateString("de-AT")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-hover)]"
            title="Als Markdown exportieren"
          >
            <Download size={12} /> MD
          </button>
          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--ds-border)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-surface-hover)]"
            title="Als JSON exportieren"
          >
            <Download size={12} /> JSON
          </button>
          <button
            onClick={handleExportWord}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            title="Als Word-Dokument exportieren"
          >
            <Download size={12} /> Word
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterImportance}
          onChange={(e) => setFilterImportance(e.target.value)}
          className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
        >
          <option value="all">Alle Wichtigkeiten</option>
          <option value="high">🔴 Hoch</option>
          <option value="medium">🟡 Mittel</option>
          <option value="low">🟢 Niedrig</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
        >
          <option value="all">Alle Kategorien</option>
          <option value="procedure">Verfahren</option>
          <option value="hearing">Vernehmung</option>
          <option value="filing">Einreichung</option>
          <option value="deadline">Frist</option>
          <option value="payment">Zahlung</option>
          <option value="other">Sonstiges</option>
        </select>
        <span className="text-xs text-[color:var(--ds-text-muted)]">
          {filteredEntries.length} von {chronology.entries.length} Einträgen
        </span>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {filteredEntries.length === 0 && (
          <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] p-8 text-center text-sm text-[color:var(--ds-text-muted)]">
            Keine Einträge mit den aktuellen Filtern
          </div>
        )}
        {filteredEntries.map((entry) => (
          <ChronologyEntry
            key={entry.id}
            entry={entry}
            expanded={expandedEntries.has(entry.id)}
            onToggle={() => toggleEntry(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ChronologyEntry({
  entry,
  expanded,
  onToggle,
}: {
  entry: ChronologyEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = CATEGORY_ICONS[entry.category ?? "other"] ?? Calendar;
  const colorClass = IMPORTANCE_COLORS[entry.importance ?? "low"] ?? IMPORTANCE_COLORS.low;

  return (
    <div
      className={`rounded-md border-l-4 ${colorClass} hover:bg-opacity-70 p-3 transition-colors`}
    >
      <button onClick={onToggle} className="flex w-full items-start gap-3 text-left">
        {expanded ? (
          <ChevronDown size={14} className="mt-1 shrink-0 text-[color:var(--ds-text-muted)]" />
        ) : (
          <ChevronRight size={14} className="mt-1 shrink-0 text-[color:var(--ds-text-muted)]" />
        )}
        <Icon size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[color:var(--ds-text)]">{entry.date}</span>
            {entry.on_reference && (
              <span className="rounded bg-[color:var(--ds-surface-hover)] px-1.5 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                {entry.on_reference}
              </span>
            )}
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {SOURCE_LABELS[entry.source] ?? entry.source}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-[color:var(--ds-text)]">{entry.event}</p>
          {expanded && entry.quote && (
            <div className="mt-2 rounded border-l-2 border-blue-300 bg-blue-50 px-2 py-1.5 text-xs text-[color:var(--ds-text-muted)] italic">
              &ldquo;{entry.quote}&rdquo;
            </div>
          )}
        </div>
        {entry.importance === "high" && (
          <AlertTriangle size={14} className="mt-1 shrink-0 text-red-500" />
        )}
      </button>
    </div>
  );
}
