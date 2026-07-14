/**
 * Check for duplicate slugs in law-at source.
 */
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No config");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  // 1. Duplicate slugs within law-at (same slug, different page IDs)
  const dupSlugs = (await engine.executeRaw(
    `SELECT slug, count(*) as cnt
     FROM pages
     WHERE source_id = 'law-at'
     GROUP BY slug
     HAVING count(*) > 1
     ORDER BY cnt DESC
     LIMIT 20`,
    []
  )) as any[];
  console.log("\n=== Duplicate slugs in law-at ===");
  if (dupSlugs.length === 0) {
    console.log("  NONE ✅");
  } else {
    for (const r of dupSlugs) {
      console.log(`  ${r.slug}: ${r.cnt}x`);
    }
  }

  // 2. Duplicate (source_id, slug) pairs
  const dupPairs = (await engine.executeRaw(
    `SELECT source_id, slug, count(*) as cnt
     FROM pages
     WHERE source_id = 'law-at'
     GROUP BY source_id, slug
     HAVING count(*) > 1
     LIMIT 20`,
    []
  )) as any[];
  console.log("\n=== Duplicate (source_id, slug) pairs ===");
  if (dupPairs.length === 0) {
    console.log("  NONE ✅");
  } else {
    for (const r of dupPairs) {
      console.log(`  ${r.source_id}/${r.slug}: ${r.cnt}x`);
    }
  }

  // 3. Check unique constraint exists
  const constraints = (await engine.executeRaw(
    `SELECT conname, pg_get_constraintdef(oid) as def
     FROM pg_constraint
     WHERE conrelid = 'pages'::regclass AND contype = 'u'`,
    []
  )) as any[];
  console.log("\n=== Unique constraints on pages ===");
  for (const c of constraints) {
    console.log(`  ${c.conname}: ${c.def}`);
  }

  // 4. Total law-at pages and distinct slugs
  const stats = (await engine.executeRaw(
    `SELECT
       count(*) as total_pages,
       count(distinct slug) as distinct_slugs
     FROM pages
     WHERE source_id = 'law-at'`,
    []
  )) as any[];
  console.log("\n=== law-at stats ===");
  console.log(`  Total pages: ${stats[0].total_pages}`);
  console.log(`  Distinct slugs: ${stats[0].distinct_slugs}`);
  console.log(`  Duplicates: ${stats[0].total_pages - stats[0].distinct_slugs}`);

  // 5. Check for duplicate chunks per page
  const dupChunks = (await engine.executeRaw(
    `SELECT p.slug, count(cc.id) as chunk_cnt
     FROM pages p
     JOIN content_chunks cc ON cc.page_id = p.id
     WHERE p.source_id = 'law-at'
     GROUP BY p.slug
     HAVING count(cc.id) > (
       SELECT count(*) FROM content_chunks cc2
       JOIN pages p2 ON cc2.page_id = p2.id
       WHERE p2.slug = p.slug AND p2.source_id = 'law-at'
       GROUP BY p2.slug
       LIMIT 1
     )
     LIMIT 10`,
    []
  )) as any[];
  console.log("\n=== Pages with unexpected chunk counts ===");
  if (dupChunks.length === 0) {
    console.log("  NONE ✅");
  } else {
    for (const r of dupChunks) {
      console.log(`  ${r.slug}: ${r.chunk_cnt} chunks`);
    }
  }

  // 6. Check distinct laws (abbreviation from slug pattern)
  const laws = (await engine.executeRaw(
    `SELECT
       split_part(slug, '/', 4) as abbr,
       count(*) as page_cnt,
       count(distinct slug) as slug_cnt
     FROM pages
     WHERE source_id = 'law-at'
       AND slug LIKE 'legal/statutes/at/%'
     GROUP BY split_part(slug, '/', 4)
     ORDER BY abbr`,
    []
  )) as any[];
  console.log(`\n=== ${laws.length} distinct AT laws ===`);
  for (const l of laws) {
    const dup = l.page_cnt !== l.slug_cnt ? ` ⚠️ DUP (${l.page_cnt} vs ${l.slug_cnt})` : "";
    console.log(`  ${l.abbr}: ${l.page_cnt} pages, ${l.slug_cnt} slugs${dup}`);
  }

  await engine.disconnect();
  console.log("\nDone.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
