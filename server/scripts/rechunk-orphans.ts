/**
 * Re-chunk orphaned pages (pages with compiled_truth but no content_chunks).
 *
 * Root cause: parseMarkdown strips `type` from frontmatter, so
 * isCourtDecisionPage/isLegalPage returned false for all legal pages.
 * The generic chunker was used instead of the legal-specific ones.
 * For some pages the generic chunker also produced 0 chunks (e.g. empty
 * compiled_truth after stripping), leaving 86k+ orphaned pages.
 *
 * This script:
 * 1. Finds all pages with compiled_truth but no chunks
 * 2. Re-runs importFromContent with forceRechunk: true
 * 3. Skips embedding (chunks will be embedded by auto-embed-pg.ts)
 *
 * Uses pg_advisory_lock (shared key 84001 with rechunk-missing.ts and
 * simple-rechunk.ts) to prevent concurrent rechunk processes.
 *
 * Usage:
 *   bun run scripts/rechunk-orphans.ts [--dry-run] [--limit N] [--source SOURCE]
 */
import { join } from "path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const sourceIdx = args.indexOf("--source");
const SOURCE_FILTER = sourceIdx >= 0 ? args[sourceIdx + 1] : null;

/** Shared advisory lock key for all rechunk scripts. Prevents concurrent execution. */
const RECHUNK_LOCK_KEY = 84001;

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Re-Chunk Orphaned Pages");
  console.log(`  Mode: ${DRY ? "DRY-RUN" : "LIVE"}`);
  console.log(`  Limit: ${LIMIT === Infinity ? "none" : LIMIT}`);
  console.log(`  Source filter: ${SOURCE_FILTER ?? "all"}`);
  console.log("═══════════════════════════════════════════════════════════");

  const { importFromContent } = await import("../src/core/import-file.ts");
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway } = await import("../src/core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  // Acquire advisory lock — prevents concurrent rechunk processes
  const lockRows: Array<{ acquired: boolean }> = await engine.executeRaw(
    `SELECT pg_try_advisory_lock(${RECHUNK_LOCK_KEY}) AS acquired`
  );
  if (!lockRows[0]?.acquired) {
    console.error(
      `⚠️  Another rechunk process is already running (advisory lock ${RECHUNK_LOCK_KEY} held). Exiting.`
    );
    await engine.disconnect();
    process.exit(1);
  }
  console.log(`Advisory lock acquired (${RECHUNK_LOCK_KEY})`);

  // Get list of sources with orphans
  const sources: Array<{ source_id: string; cnt: string }> = await engine.executeRaw(`
    SELECT p.source_id, count(*)::text as cnt
    FROM pages p
    WHERE NOT EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id)
    AND p.compiled_truth != ''
    ${SOURCE_FILTER ? `AND p.source_id = '${SOURCE_FILTER.replace(/'/g, "''")}'` : ""}
    GROUP BY p.source_id
    ORDER BY cnt DESC
  `);

  const totalOrphans = sources.reduce((s, r) => s + parseInt(r.cnt), 0);
  console.log(`\nSources with orphans: ${sources.length}`);
  console.log(`Total orphaned pages: ${totalOrphans}\n`);

  if (DRY) {
    for (const s of sources) {
      console.log(`  [DRY] ${s.source_id}: ${s.cnt} orphans`);
    }
    await engine.disconnect();
    return;
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let totalProcessed = 0;
  const startTime = Date.now();

  for (const src of sources) {
    const srcCount = parseInt(src.cnt);
    console.log(`\n--- Processing ${src.source_id} (${srcCount} pages) ---`);

    // Process in batches of 200 to avoid loading all into memory
    const BATCH_QUERY = 200;
    const BATCH_PROCESS = 25;
    let offset = 0;

    while (offset < srcCount) {
      const remaining =
        LIMIT === Infinity ? srcCount - offset : Math.min(BATCH_QUERY, LIMIT - totalProcessed);
      if (remaining <= 0) break;

      const batch: Array<{
        slug: string;
        compiled_truth: string;
        source_id: string;
        type: string;
        title: string;
        frontmatter: Record<string, unknown>;
      }> = await engine.executeRaw(`
          SELECT slug, compiled_truth, source_id, type, title, frontmatter
          FROM pages
          WHERE source_id = '${src.source_id.replace(/'/g, "''")}'
          AND compiled_truth != ''
          AND NOT EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = pages.id)
          ORDER BY slug
          LIMIT ${BATCH_QUERY}
        `);

      if (batch.length === 0) break;

      // Process in smaller concurrent batches
      for (let i = 0; i < batch.length; i += BATCH_PROCESS) {
        const subBatch = batch.slice(i, i + BATCH_PROCESS);
        const promises = subBatch.map(async (p) => {
          try {
            const fm: Record<string, unknown> = {
              ...(p.frontmatter ?? {}),
              type: p.type,
              title: p.title,
            };
            const yamlFm = Object.entries(fm)
              .filter(([_, v]) => v !== null && v !== undefined)
              .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
              .join("\n");
            const markdown = `---\n${yamlFm}\n---\n\n${p.compiled_truth}`;

            const result = await importFromContent(engine, p.slug, markdown, {
              noEmbed: true,
              sourceId: p.source_id,
              forceRechunk: true,
            });
            if (result.status === "imported") success++;
            else if (result.status === "skipped") skipped++;
            else failed++;
          } catch (e) {
            console.error(`  ERROR ${p.slug}: ${e instanceof Error ? e.message : String(e)}`);
            failed++;
          }
        });
        await Promise.all(promises);
      }

      offset += batch.length;
      totalProcessed += batch.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (totalProcessed / parseFloat(elapsed || "1")).toFixed(1);
      console.log(
        `  [${totalProcessed}/${totalOrphans}] ${elapsed}s (${rate}/s) — ok=${success} skip=${skipped} fail=${failed}`
      );
    }

    if (LIMIT !== Infinity && totalProcessed >= LIMIT) break;
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Done in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log(`  Success: ${success}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  // Release advisory lock
  try {
    await engine.executeRaw(`SELECT pg_advisory_unlock(${RECHUNK_LOCK_KEY})`);
    console.log(`Advisory lock released`);
  } catch {}

  await engine.disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
