/**
 * Amendment Report Generator
 *
 * Produces structured reports from corpus amendment data.
 * Used by the incremental update pipeline and dashboard widgets.
 *
 * @module server/src/core/legal/amendment-report
 */

import type { Pool } from "pg";
import { SnapshotStore, type CorpusAmendment } from "./snapshot-store.ts";
import type { Jurisdiction } from "./corpus-receipt.ts";

// ─── Types ───────────────────────────────────────────────────────────────

export interface AmendmentReport {
  /** ISO date range covered */
  from: string;
  to: string;
  /** Total amendments detected */
  total_amendments: number;
  /** Amendments by change type */
  by_change_type: {
    added: number;
    modified: number;
    removed: number;
  };
  /** Amendments by jurisdiction */
  by_jurisdiction: Record<
    string,
    {
      total: number;
      statutes_affected: number;
      by_change_type: { added: number; modified: number; removed: number };
    }
  >;
  /** Per-statute breakdown */
  by_statute: Array<{
    slug: string;
    statute_code: string;
    jurisdiction: Jurisdiction;
    total: number;
    paragraphs_affected: string[];
    change_types: { added: number; modified: number; removed: number };
    latest_detected_at: string;
  }>;
  /** Slugs that had at least one change (for re-import) */
  changed_slugs: string[];
  /** Generated at */
  generated_at: string;
}

export interface AmendmentReportOpts {
  startDate?: string;
  endDate?: string;
  jurisdiction?: Jurisdiction;
}

// ─── Report Generator ────────────────────────────────────────────────────

/**
 * Generate an amendment report for a date range.
 *
 * Usage:
 *   const report = await generateAmendmentReport(pool, {
 *     startDate: "2026-07-01",
 *     endDate: "2026-07-16",
 *   });
 *
 *   // Get slugs that need re-import
 *   for (const slug of report.changed_slugs) {
 *     await reImportStatute(slug);
 *   }
 */
export async function generateAmendmentReport(
  pool: Pool,
  opts: AmendmentReportOpts = {}
): Promise<AmendmentReport> {
  const store = new SnapshotStore(pool);

  const now = new Date().toISOString();
  const to = opts.endDate ?? now;
  const from = opts.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let amendments: CorpusAmendment[];
  if (opts.jurisdiction) {
    amendments = await store.getAmendmentsByJurisdiction(opts.jurisdiction, from, to);
  } else {
    amendments = await store.getAmendmentsBetween(from, to);
  }

  // Aggregate by change type
  const byChangeType = { added: 0, modified: 0, removed: 0 };
  for (const a of amendments) {
    byChangeType[a.change_type]++;
  }

  // Aggregate by jurisdiction
  const byJurisdiction: AmendmentReport["by_jurisdiction"] = {};
  for (const a of amendments) {
    const jur = a.jurisdiction;
    if (!byJurisdiction[jur]) {
      byJurisdiction[jur] = {
        total: 0,
        statutes_affected: 0,
        by_change_type: { added: 0, modified: 0, removed: 0 },
      };
    }
    byJurisdiction[jur].total++;
    byJurisdiction[jur].by_change_type[a.change_type]++;
  }

  // Aggregate by statute
  const byStatuteMap = new Map<
    string,
    {
      slug: string;
      statute_code: string;
      jurisdiction: Jurisdiction;
      total: number;
      paragraphs_affected: Set<string>;
      change_types: { added: number; modified: number; removed: number };
      latest_detected_at: string;
    }
  >();

  for (const a of amendments) {
    const key = a.slug;
    let entry = byStatuteMap.get(key);
    if (!entry) {
      entry = {
        slug: a.slug,
        statute_code: a.statute_code,
        jurisdiction: a.jurisdiction,
        total: 0,
        paragraphs_affected: new Set(),
        change_types: { added: 0, modified: 0, removed: 0 },
        latest_detected_at: a.detected_at,
      };
      byStatuteMap.set(key, entry);
    }
    entry.total++;
    entry.paragraphs_affected.add(a.paragraph);
    entry.change_types[a.change_type]++;
    if (a.detected_at > entry.latest_detected_at) {
      entry.latest_detected_at = a.detected_at;
    }
  }

  // Convert Sets to arrays and compute statutes_affected per jurisdiction
  const byStatute = Array.from(byStatuteMap.values())
    .map((e) => ({
      ...e,
      paragraphs_affected: Array.from(e.paragraphs_affected).sort(),
    }))
    .sort((a, b) => b.total - a.total);

  for (const [jur, data] of Object.entries(byJurisdiction)) {
    data.statutes_affected = byStatute.filter((s) => s.jurisdiction === jur).length;
  }

  const changedSlugs = Array.from(byStatuteMap.keys()).sort();

  return {
    from,
    to,
    total_amendments: amendments.length,
    by_change_type: byChangeType,
    by_jurisdiction: byJurisdiction,
    by_statute: byStatute,
    changed_slugs: changedSlugs,
    generated_at: now,
  };
}

/**
 * Format an amendment report as a human-readable summary (German).
 */
export function formatAmendmentReport(report: AmendmentReport): string {
  const lines: string[] = [];
  lines.push(`Novellen-Report (${report.from.slice(0, 10)} bis ${report.to.slice(0, 10)})`);
  lines.push(`${"=".repeat(60)}`);
  lines.push(`Gesamt: ${report.total_amendments} Änderungen`);
  lines.push(`  - Geändert: ${report.by_change_type.modified}`);
  lines.push(`  - Neu: ${report.by_change_type.added}`);
  lines.push(`  - Entfernt: ${report.by_change_type.removed}`);
  lines.push(`Betroffene Gesetze: ${report.changed_slugs.length}`);
  lines.push("");

  // By jurisdiction
  for (const [jur, data] of Object.entries(report.by_jurisdiction)) {
    lines.push(
      `  ${jur.toUpperCase()}: ${data.total} Änderungen in ${data.statutes_affected} Gesetzen`
    );
  }
  lines.push("");

  // Per-statute details
  if (report.by_statute.length > 0) {
    lines.push("Einzelheiten:");
    for (const s of report.by_statute.slice(0, 20)) {
      const paras = s.paragraphs_affected.slice(0, 5).join(", ");
      const more =
        s.paragraphs_affected.length > 5 ? ` (+${s.paragraphs_affected.length - 5})` : "";
      lines.push(
        `  ${s.statute_code} (${s.jurisdiction.toUpperCase()}): ` +
          `§§ ${paras}${more} ` +
          `[${s.change_types.modified}× geändert, ${s.change_types.added}× neu, ${s.change_types.removed}× entfernt]`
      );
    }
    if (report.by_statute.length > 20) {
      lines.push(`  ... und ${report.by_statute.length - 20} weitere`);
    }
  } else {
    lines.push("Keine Änderungen im Zeitraum.");
  }

  return lines.join("\n");
}
