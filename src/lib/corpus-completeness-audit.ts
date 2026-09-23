/**
 * WP-6.38: Corpus-Vollständigkeits-Audit — vergleicht die deklarierte
 * Abdeckungsmatrix (LEGAL_SOURCE_COVERAGE_MATRIX) mit dem tatsächlichen
 * Datenbestand in der DB (pages/chunks/embeddings pro source_id).
 *
 * Erkennt drei Abweichungsklassen:
 *   - „empty_available": Matrix sagt verfügbar, DB ist leer (Import fehlt)
 *   - „unexpected_data": Matrix sagt planned/gap, DB hat Daten (Matrix veraltet)
 *   - „partially_embedded": Daten vorhanden, Embedding-Coverage < 90 %
 */

import type { SourceType, Jurisdiction } from "../../server/src/core/legal/source-lifecycle";
import type { LegalSourceCoverageEntry, LegalArea } from "./legal-source-coverage";

export interface SourceDbStats {
  source_id: string;
  pages: number;
  chunks: number;
  embedded: number;
  last_updated: string | null;
}

export type AuditStatus =
  | "ok"
  | "empty_available"
  | "unexpected_data"
  | "gap"
  | "partially_embedded";

export interface SourceAuditRow {
  source_id: string;
  source_name: string;
  jurisdiction: Jurisdiction;
  source_type: SourceType;
  legal_areas: LegalArea[];
  declared_status: LegalSourceCoverageEntry["status"];
  declared_items: number;
  /** Echte DB-source_ids, deren Bestand dieser Eintrag aggregiert. */
  db_source_ids: string[];
  actual_pages: number;
  actual_chunks: number;
  actual_embedded: number;
  /** embedded / chunks in Prozent, null wenn keine Chunks */
  embed_pct: number | null;
  last_updated: string | null;
  audit_status: AuditStatus;
  notes: string;
}

export interface CoverageAuditResult {
  jurisdiction: Jurisdiction | "all";
  generated_at: string;
  rows: SourceAuditRow[];
  /** DB-Quellen mit Bestand, die kein Matrix-Eintrag abdeckt
   *  (z.B. law-at-gemeinden — echte Daten ohne Deklaration). */
  undeclared: SourceDbStats[];
  summary: {
    total_sources: number;
    ok: number;
    empty_available: number;
    unexpected_data: number;
    gaps: number;
    partially_embedded: number;
    /** Anteil Quellen ohne Abweichung in Prozent */
    completeness_pct: number;
  };
}

const EMBED_THRESHOLD = 0.9;

export function auditCoverage(
  entries: LegalSourceCoverageEntry[],
  dbStats: Map<string, SourceDbStats>,
  jurisdiction: Jurisdiction | "all" = "all"
): CoverageAuditResult {
  const filtered =
    jurisdiction === "all" ? entries : entries.filter((e) => e.jurisdiction === jurisdiction);

  const declaredIds = new Set<string>();
  const rows: SourceAuditRow[] = filtered.map((e) => {
    const ids = e.db_source_ids ?? [e.source_id];
    for (const id of ids) declaredIds.add(id);
    const stats = ids.map((id) => dbStats.get(id)).filter((s): s is SourceDbStats => !!s);
    const pages = stats.reduce((n, s) => n + s.pages, 0);
    const chunks = stats.reduce((n, s) => n + s.chunks, 0);
    const embedded = stats.reduce((n, s) => n + s.embedded, 0);
    const lastUpdated =
      stats
        .map((s) => s.last_updated)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;
    const embedPct = chunks > 0 ? Math.round((embedded / chunks) * 1000) / 10 : null;

    const expectsData = e.status === "available" || e.status === "early_access";
    let auditStatus: AuditStatus;
    if (expectsData && pages === 0) auditStatus = "empty_available";
    else if (!expectsData && pages > 0) auditStatus = "unexpected_data";
    else if (e.status === "gap") auditStatus = "gap";
    else if (pages > 0 && embedPct !== null && embedPct < EMBED_THRESHOLD * 100)
      auditStatus = "partially_embedded";
    else auditStatus = "ok";

    return {
      source_id: e.source_id,
      source_name: e.source_name,
      jurisdiction: e.jurisdiction,
      source_type: e.source_type,
      legal_areas: e.legal_areas,
      declared_status: e.status,
      declared_items: e.item_count,
      db_source_ids: ids,
      actual_pages: pages,
      actual_chunks: chunks,
      actual_embedded: embedded,
      embed_pct: embedPct,
      last_updated: lastUpdated,
      audit_status: auditStatus,
      notes: e.notes,
    };
  });

  // DB-Quellen mit Bestand, die kein Matrix-Eintrag deklariert — werden als
  // eigene Liste ausgewiesen statt still unterzugehen.
  const undeclared = [...dbStats.values()]
    .filter((s) => s.pages > 0 && !declaredIds.has(s.source_id))
    .sort((a, b) => b.pages - a.pages);

  const count = (s: AuditStatus) => rows.filter((r) => r.audit_status === s).length;
  const deviations =
    count("empty_available") + count("unexpected_data") + count("partially_embedded");

  return {
    jurisdiction,
    generated_at: new Date().toISOString(),
    rows: rows.sort((a, b) => {
      // Abweichungen zuerst, dann nach Seitenzahl
      const rank = (r: SourceAuditRow) =>
        r.audit_status === "ok" ? 2 : r.audit_status === "gap" ? 1 : 0;
      return rank(a) - rank(b) || b.actual_pages - a.actual_pages;
    }),
    undeclared,
    summary: {
      total_sources: rows.length,
      ok: count("ok"),
      empty_available: count("empty_available"),
      unexpected_data: count("unexpected_data"),
      gaps: count("gap"),
      partially_embedded: count("partially_embedded"),
      completeness_pct:
        rows.length > 0 ? Math.round(((rows.length - deviations) / rows.length) * 1000) / 10 : 100,
    },
  };
}
