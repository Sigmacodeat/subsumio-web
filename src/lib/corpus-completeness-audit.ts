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

  const rows: SourceAuditRow[] = filtered.map((e) => {
    const db = dbStats.get(e.source_id);
    const pages = db?.pages ?? 0;
    const chunks = db?.chunks ?? 0;
    const embedded = db?.embedded ?? 0;
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
      actual_pages: pages,
      actual_chunks: chunks,
      actual_embedded: embedded,
      embed_pct: embedPct,
      last_updated: db?.last_updated ?? null,
      audit_status: auditStatus,
      notes: e.notes,
    };
  });

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
