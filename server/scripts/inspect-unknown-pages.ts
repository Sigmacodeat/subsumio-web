#!/usr/bin/env bun
/**
 * Quick inspection of placeholder OGH pages to understand why parseMeta fails.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { max: 1, prepare: false });

async function main() {
  // Get 5 sample placeholder pages with all relevant fields
  const rows = await sql`
    SELECT id, slug, title, compiled_truth, frontmatter, effective_date, effective_date_source
    FROM pages
    WHERE source_id = 'law-at-judikatur'
      AND deleted_at IS NULL
      AND slug LIKE 'legal/judikatur/at/2000-01-01-unknown-%'
    LIMIT 5
  `;

  console.log(`Found ${rows.length} sample pages\n`);
  console.log("=".repeat(80));

  for (const row of rows) {
    console.log(`\n--- Page: ${row.slug} ---`);
    console.log(`ID: ${row.id}`);
    console.log(`Title: ${JSON.stringify(row.title)}`);
    console.log(`Effective date: ${row.effective_date}`);
    console.log(`Effective date source: ${row.effective_date_source}`);
    console.log(`compiled_truth is null: ${row.compiled_truth === null}`);
    console.log(`compiled_truth length: ${row.compiled_truth?.length ?? 0}`);
    console.log(`frontmatter: ${JSON.stringify(row.frontmatter)}`);

    if (row.compiled_truth) {
      // Show first 500 chars of compiled_truth
      console.log(`\ncompiled_truth (first 500 chars):`);
      console.log(row.compiled_truth.slice(0, 500));
      // Check for metadata markers
      const hasEntscheidungsdatum = /##\s*Entscheidungsdatum/.test(row.compiled_truth);
      const hasGeschaeftszahl = /##\s*Geschäftszahl/.test(row.compiled_truth);
      const hasEntscheidungsdatumAlt = /Entscheidungsdatum/i.test(row.compiled_truth);
      const hasGeschaeftszahlAlt = /Geschäftszahl/i.test(row.compiled_truth);
      console.log(`\nMarker check (compiled_truth):`);
      console.log(`  ## Entscheidungsdatum: ${hasEntscheidungsdatum}`);
      console.log(`  ## Geschäftszahl: ${hasGeschaeftszahl}`);
      console.log(`  Entscheidungsdatum (any): ${hasEntscheidungsdatumAlt}`);
      console.log(`  Geschäftszahl (any): ${hasGeschaeftszahlAlt}`);
    }

    console.log("\n" + "=".repeat(80));
  }

  // Also check aggregate stats
  const stats = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE compiled_truth IS NULL) as ct_null,
      COUNT(*) FILTER (WHERE compiled_truth IS NOT NULL) as ct_present,
      COUNT(*) FILTER (WHERE compiled_truth = '') as ct_empty,
      COUNT(*) FILTER (WHERE compiled_truth != '') as ct_nonempty,
      COUNT(*) FILTER (WHERE frontmatter = '{}'::jsonb) as fm_empty,
      COUNT(*) FILTER (WHERE frontmatter != '{}'::jsonb) as fm_present
    FROM pages
    WHERE source_id = 'law-at-judikatur'
      AND deleted_at IS NULL
      AND slug LIKE 'legal/judikatur/at/2000-01-01-unknown-%'
  `;
  console.log("\n\n=== AGGREGATE STATS ===");
  console.log(`Total placeholder pages: ${stats[0].total}`);
  console.log(`compiled_truth NULL: ${stats[0].ct_null}`);
  console.log(`compiled_truth present: ${stats[0].ct_present}`);
  console.log(`compiled_truth empty: ${stats[0].ct_empty}`);
  console.log(`compiled_truth non-empty: ${stats[0].ct_nonempty}`);
  console.log(`frontmatter empty: ${stats[0].fm_empty}`);
  console.log(`frontmatter present: ${stats[0].fm_present}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
