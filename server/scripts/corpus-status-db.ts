/**
 * Persisted corpus status — so "wo stehen wir" is one instant read, not a
 * 4-minute rescan every time it's asked. Self-provisioned (CREATE TABLE IF
 * NOT EXISTS, corpus-pipeline.ts's own pattern for operational-only tables
 * that aren't part of the product schema) rather than a formal migration,
 * since nothing in src/ ever queries this — only the audit scripts that
 * write it and corpus-status-report.ts that reads it.
 *
 * Two independent axes, each written by a different tool, each nullable
 * until that tool has actually run for that source:
 *   - Plausibilität (audit-plausibility-full.ts): is what's already in the
 *     DB structurally correct, per the same rule the normalizer gates new
 *     imports with?
 *   - Vollständigkeit (judikatur-completeness-check.ts /
 *     audit-completeness-vs-ris.ts): does the DB have everything RIS lists?
 * A source can be 100% plausible and still incomplete (nothing wrong with
 * what's there, just not all of it fetched yet) — that distinction is the
 * whole point of keeping them separate columns, not one merged "% done".
 */

interface RawExecutor {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

let ensured = false;

async function ensureTable(engine: RawExecutor): Promise<void> {
  if (ensured) return;
  await engine.executeRaw(`
    CREATE TABLE IF NOT EXISTS corpus_status (
      source_id TEXT PRIMARY KEY,
      doc_class TEXT NOT NULL,
      db_pages INT NOT NULL,
      plausible_pages INT,
      implausible_pages INT,
      issue_breakdown JSONB,
      unembedded_ok_pages INT,
      ris_total INT,
      completeness_pct NUMERIC,
      last_plausibility_check TIMESTAMPTZ,
      last_completeness_check TIMESTAMPTZ
    )
  `);
  ensured = true;
}

export async function upsertPlausibility(
  engine: RawExecutor,
  args: {
    sourceId: string;
    docClass: string;
    dbPages: number;
    plausiblePages: number;
    issueBreakdown: Record<string, number>;
    unembeddedOkPages: number;
  }
): Promise<void> {
  await ensureTable(engine);
  await engine.executeRaw(
    `INSERT INTO corpus_status (source_id, doc_class, db_pages, plausible_pages, implausible_pages, issue_breakdown, unembedded_ok_pages, last_plausibility_check)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
     ON CONFLICT (source_id) DO UPDATE SET
       doc_class = EXCLUDED.doc_class,
       db_pages = EXCLUDED.db_pages,
       plausible_pages = EXCLUDED.plausible_pages,
       implausible_pages = EXCLUDED.implausible_pages,
       issue_breakdown = EXCLUDED.issue_breakdown,
       unembedded_ok_pages = EXCLUDED.unembedded_ok_pages,
       last_plausibility_check = EXCLUDED.last_plausibility_check`,
    [
      args.sourceId,
      args.docClass,
      args.dbPages,
      args.plausiblePages,
      args.dbPages - args.plausiblePages,
      args.issueBreakdown,
      args.unembeddedOkPages,
    ]
  );
}

export async function upsertCompleteness(
  engine: RawExecutor,
  args: { sourceId: string; docClass: string; dbPages: number; risTotal: number }
): Promise<void> {
  await ensureTable(engine);
  const pct = args.risTotal > 0 ? Math.round((args.dbPages / args.risTotal) * 1000) / 10 : null;
  await engine.executeRaw(
    `INSERT INTO corpus_status (source_id, doc_class, db_pages, ris_total, completeness_pct, last_completeness_check)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (source_id) DO UPDATE SET
       doc_class = EXCLUDED.doc_class,
       db_pages = EXCLUDED.db_pages,
       ris_total = EXCLUDED.ris_total,
       completeness_pct = EXCLUDED.completeness_pct,
       last_completeness_check = EXCLUDED.last_completeness_check`,
    [args.sourceId, args.docClass, args.dbPages, args.risTotal, pct]
  );
}
