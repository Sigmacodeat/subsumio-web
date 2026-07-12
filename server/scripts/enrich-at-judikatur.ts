#!/usr/bin/env bun
/**
 * AT Judikatur Enrichment Script
 *
 * Updates existing law-at-judikatur pages in the DB to:
 * 1. Add `title` to frontmatter (derived from court + case_number)
 * 2. Add `decision_date` as alias for `date` in frontmatter
 *
 * This fixes the issue where titles were just "2025 07 31 1ob49 57" (from filename)
 * instead of "OGH — 1Ob49/57" (from court + case_number).
 *
 * Usage: bun scripts/enrich-at-judikatur.ts
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:15432/sigmabrain?sslmode=disable";

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  const client = await pool.connect();

  try {
    console.log("[enrich-at-judikatur] Fetching law-at-judikatur pages...");

    const { rows } = await client.query(
      `SELECT id, title, frontmatter FROM pages WHERE source_id = 'law-at-judikatur'`
    );

    console.log(`[enrich-at-judikatur] Found ${rows.length} pages to enrich`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const fm = row.frontmatter as Record<string, unknown>;
      const court = fm.court as string | undefined;
      const caseNumber = fm.case_number as string | undefined;
      const date = fm.date as string | undefined;

      if (!court || !caseNumber) {
        skipped++;
        continue;
      }

      const newTitle = `${court} — ${caseNumber}`;
      const updates: Record<string, unknown> = { title: newTitle };
      if (date && !fm.decision_date) {
        updates.decision_date = date;
      }

      const newFm = { ...fm, ...updates };
      await client.query(
        `UPDATE pages SET title = $1, frontmatter = $2 WHERE id = $3`,
        [newTitle, JSON.stringify(newFm), row.id]
      );
      updated++;
    }

    console.log(`[enrich-at-judikatur] Done: ${updated} updated, ${skipped} skipped`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[enrich-at-judikatur] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
