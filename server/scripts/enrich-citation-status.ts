#!/usr/bin/env bun
/**
 * enrich-citation-status — populate frontmatter.citation_status for court
 * decisions using text heuristics. This is the modular Shepard's/KeyCite
 * equivalent — it flags decisions that have been overturned, superseded,
 * or explicitly confirmed by later courts.
 *
 * Heuristics (applied to chunk_text, not frontmatter):
 *   - "aufgehoben" / "aufgehoben durch" → overturned
 *   - "rechtskräftig" / "bestätigt" → confirmed (only if NOT overturned)
 *   - "ersetzt durch" / "nicht mehr anwendbar" → superseded
 *   - Default: good_law (no signal found)
 *
 * The script is idempotent: it only sets citation_status if not already
 * present, OR if --force is passed.
 *
 * Usage:
 *   bun run server/scripts/enrich-citation-status.ts [--dry-run] [--force] [--limit N] [--source ogh|vwgh|...]
 */

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:15432/sigmabrain?sslmode=disable";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const sourceIdx = args.indexOf("--source");
const SOURCE_FILTER = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

interface HeuristicResult {
  status: "good_law" | "overturned" | "superseded" | "confirmed";
  evidence: string;
}

function classifyCitationStatus(chunkTexts: string[]): HeuristicResult {
  const combined = chunkTexts.join(" ").toLowerCase();

  // Check for overturned signals (strongest — checked first)
  if (
    combined.includes("aufgehoben durch") ||
    combined.includes("durch aufhebung") ||
    combined.includes("ausdrücklich aufgehoben") ||
    combined.includes("rechtsprechung aufgehoben")
  ) {
    return { status: "overturned", evidence: "text contains 'aufgehoben durch'" };
  }

  // Check for superseded signals
  if (
    combined.includes("ersetzt durch") ||
    combined.includes("nicht mehr anwendbar") ||
    combined.includes("durch neuere rechtsprechung ersetzt") ||
    combined.includes("überholt durch")
  ) {
    return { status: "superseded", evidence: "text contains 'ersetzt durch' / 'überholt durch'" };
  }

  // Check for confirmed signals (only if NOT overturned/superseded)
  if (
    combined.includes("rechtskräftig") &&
    (combined.includes("bestätigt") || combined.includes("aufrechterhalten"))
  ) {
    return {
      status: "confirmed",
      evidence: "text contains 'rechtskräftig' + 'bestätigt/aufrechterhalten'",
    };
  }

  // Default: good_law
  return { status: "good_law", evidence: "no overturn/supersede signal found" };
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
  const client = await pool.connect();

  try {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Subsumio — Citation Status Enrichment");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Mode: ${DRY ? "DRY-RUN" : "LIVE"} ${FORCE ? "(force)" : ""}`);
    console.log(`Source filter: ${SOURCE_FILTER ?? "all judikatur"}`);
    console.log("");

    // Fetch judikatur pages
    const sourceFilter = SOURCE_FILTER
      ? `AND source_id = 'law-at-judikatur-${SOURCE_FILTER}'`
      : `AND source_id LIKE 'law-at-judikatur%'`;

    const { rows: pages } = await client.query(
      `SELECT id, slug, title, frontmatter
       FROM pages
       WHERE slug LIKE 'legal/judikatur/%'
       ${sourceFilter}
       ${FORCE ? "" : "AND NOT (frontmatter ? 'citation_status')"}
       ORDER BY id
       LIMIT $1`,
      [LIMIT]
    );

    console.log(`Found ${pages.length} pages to enrich`);
    if (pages.length === 0) {
      console.log("Nothing to do. Use --force to re-enrich existing entries.");
      return;
    }

    // For each page, fetch chunk texts and classify
    let updated = 0;
    let skipped = 0;
    const statusCounts = { good_law: 0, overturned: 0, superseded: 0, confirmed: 0 };

    for (const page of pages) {
      const { rows: chunks } = await client.query(
        `SELECT chunk_text FROM content_chunks WHERE page_id = $1 ORDER BY chunk_index`,
        [page.id]
      );

      if (chunks.length === 0) {
        skipped++;
        continue;
      }

      const chunkTexts = chunks.map((c: any) => c.chunk_text as string);
      const result = classifyCitationStatus(chunkTexts);
      statusCounts[result.status]++;

      if (DRY) {
        console.log(`  [DRY] ${page.slug}: ${result.status} (${result.evidence})`);
        continue;
      }

      const fm = page.frontmatter as Record<string, unknown>;
      const newFm = {
        ...fm,
        citation_status: result.status,
        citation_status_evidence: result.evidence,
        citation_status_enriched_at: new Date().toISOString(),
      };

      await client.query(`UPDATE pages SET frontmatter = $1 WHERE id = $2`, [
        JSON.stringify(newFm),
        page.id,
      ]);
      updated++;
    }

    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Results:`);
    console.log(`    Updated: ${updated}`);
    console.log(`    Skipped: ${skipped}`);
    console.log(`    Status distribution:`);
    console.log(`      good_law:   ${statusCounts.good_law}`);
    console.log(`      confirmed:  ${statusCounts.confirmed}`);
    console.log(`      superseded: ${statusCounts.superseded}`);
    console.log(`      overturned: ${statusCounts.overturned}`);
    console.log("═══════════════════════════════════════════════════════════");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
