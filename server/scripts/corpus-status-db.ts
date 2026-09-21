/**
 * Persisted corpus status — so "wo stehen wir" is one instant read, not a
 * 4-minute rescan every time it's asked. Self-provisioned (CREATE TABLE IF
 * NOT EXISTS, corpus-pipeline.ts's own pattern for operational-only tables
 * that aren't part of the product schema) rather than a formal migration,
 * since nothing in src/ ever queries this — only the audit scripts that
 * write it and corpus-status-report.ts that reads it.
 *
 * Plausibilität only (audit-plausibility-full.ts): is what's already in
 * the DB structurally correct, per the same rule the normalizer gates new
 * imports with? Nullable until that audit has run for a source.
 *
 * Vollständigkeit against RIS deliberately lives elsewhere —
 * corpus_reconciliation (reconcile-ris.ts, migration 142), the
 * pre-existing, dashboard-integrated table (/ops/corpus reads it via
 * /api/admin/corpus-overview). It already handles the Rechtssatz-vs-
 * Volltext distinction for OGH/VwGH/VfGH that a naive page-count
 * comparison misses. corpus-status-report.ts reads it directly rather
 * than this module keeping a second, driftable copy.
 * A source can be 100% plausible and still incomplete (nothing wrong with
 * what's there, just not all of it fetched yet) — that's why the two
 * never collapse into one merged "% done".
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

let verifiedEnsured = false;

export async function ensureVerifiedTable(engine: RawExecutor): Promise<void> {
  if (verifiedEnsured) return;
  await engine.executeRaw(`
    CREATE TABLE IF NOT EXISTS corpus_page_verified (
      page_id BIGINT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  verifiedEnsured = true;
}

/**
 * Writes one audit batch into the positive list embedding is gated on
 * (verifiedSql() in core/embedding-run.ts): confirmed pages in with the
 * content_hash they were confirmed at, failed pages out. A page without a
 * content_hash cannot be bound to its text and stays out.
 */
export async function recordVerdicts(
  engine: RawExecutor,
  ok: Array<{ pageId: number; contentHash: string | null }>,
  failedPageIds: number[]
): Promise<void> {
  await ensureVerifiedTable(engine);
  const bindable = ok.filter((r) => r.contentHash);
  if (bindable.length > 0) {
    // As text, parsed in SQL: postgres.js double-encodes a string handed to
    // a jsonb parameter, and would turn a JS array into a Postgres array.
    await engine.executeRaw(
      `INSERT INTO corpus_page_verified (page_id, content_hash, verified_at)
       SELECT (e->>'id')::bigint, e->>'h', now()
         FROM jsonb_array_elements(($1::text)::jsonb) e
       ON CONFLICT (page_id) DO UPDATE SET
         content_hash = EXCLUDED.content_hash, verified_at = EXCLUDED.verified_at`,
      [JSON.stringify(bindable.map((r) => ({ id: r.pageId, h: r.contentHash })))]
    );
  }
  const out = [...failedPageIds, ...ok.filter((r) => !r.contentHash).map((r) => r.pageId)];
  if (out.length > 0) {
    await engine.executeRaw(
      `DELETE FROM corpus_page_verified
        WHERE page_id IN (SELECT (e)::text::bigint FROM jsonb_array_elements(($1::text)::jsonb) e)`,
      [JSON.stringify(out)]
    );
  }
}

let lawEnsured = false;

async function ensureLawTable(engine: RawExecutor): Promise<void> {
  if (lawEnsured) return;
  await engine.executeRaw(`
    CREATE TABLE IF NOT EXISTS law_completeness (
      source_id TEXT NOT NULL,
      gnr TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      have INT NOT NULL,
      wanted INT NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (source_id, gnr)
    )
  `);
  lawEnsured = true;
}

/** One row per Gesetz — the per-law breakdown corpus_status can't show (it only aggregates per source). */
export async function upsertLawCompleteness(
  engine: RawExecutor,
  rows: Array<{
    sourceId: string;
    gnr: string;
    title: string | null;
    status: "complete" | "partial" | "missing";
    have: number;
    wanted: number;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  await ensureLawTable(engine);
  await engine.executeRaw(
    `INSERT INTO law_completeness (source_id, gnr, title, status, have, wanted, checked_at)
     SELECT (e->>'sourceId'), (e->>'gnr'), (e->>'title'), (e->>'status'), (e->>'have')::int, (e->>'wanted')::int, now()
       FROM jsonb_array_elements(($1::text)::jsonb) e
     ON CONFLICT (source_id, gnr) DO UPDATE SET
       title = EXCLUDED.title, status = EXCLUDED.status, have = EXCLUDED.have,
       wanted = EXCLUDED.wanted, checked_at = EXCLUDED.checked_at`,
    [JSON.stringify(rows)]
  );
}

/** Rows this run's index no longer lists at all (repealed/renumbered) — stale unless removed. */
export async function pruneLawCompleteness(
  engine: RawExecutor,
  sourceId: string,
  keepGnrs: string[]
): Promise<number> {
  await ensureLawTable(engine);
  const deleted = (await engine.executeRaw(
    `DELETE FROM law_completeness
      WHERE source_id = $1 AND NOT (gnr = ANY($2::text[]))
      RETURNING gnr`,
    [sourceId, keepGnrs]
  )) as unknown[];
  return deleted.length;
}
