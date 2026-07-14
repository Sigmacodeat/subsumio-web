/**
 * Comprehensive DB audit — shows exactly what's in the database.
 * No guessing, just facts.
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

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DB AUDIT — Complete Database Inventory");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. ALL sources with page counts
  const sources = (await engine.executeRaw(
    `SELECT s.id, s.name, count(p.id) as page_count
     FROM sources s
     LEFT JOIN pages p ON p.source_id = s.id
     WHERE s.id LIKE 'law-%' OR s.id LIKE 'default' OR s.id = 'demo'
     GROUP BY s.id, s.name
     ORDER BY s.id`,
    []
  )) as any[];
  console.log("=== Sources with page counts ===");
  for (const r of sources) console.log(`  ${r.id}: ${r.page_count} pages`);

  // 2. ALL pages by source_id (including null)
  const allPages = (await engine.executeRaw(
    `SELECT source_id, count(*) as cnt FROM pages GROUP BY source_id ORDER BY cnt DESC LIMIT 20`,
    []
  )) as any[];
  console.log("\n=== Top 20 sources by page count ===");
  for (const r of allPages) console.log(`  ${r.source_id}: ${r.cnt} pages`);

  // 3. Slug patterns for law-at
  const atSlugs = (await engine.executeRaw(
    `SELECT 
       substring(slug from '^legal/[^/]+/[^/]+') as slug_prefix,
       count(*) as cnt
     FROM pages 
     WHERE source_id = 'law-at'
     GROUP BY 1
     ORDER BY cnt DESC`,
    []
  )) as any[];
  console.log("\n=== law-at slug patterns ===");
  if (atSlugs.length === 0) console.log("  (no pages with source_id='law-at')");
  for (const r of atSlugs) console.log(`  ${r.slug_prefix}: ${r.cnt}`);

  // 4. Check if AT statutes exist under different source_id
  const atStatutes = (await engine.executeRaw(
    `SELECT source_id, count(*) as cnt 
     FROM pages 
     WHERE slug LIKE 'legal/statutes/at/%'
     GROUP BY source_id`,
    []
  )) as any[];
  console.log("\n=== Pages with slug 'legal/statutes/at/%' ===");
  if (atStatutes.length === 0) console.log("  (none found)");
  for (const r of atStatutes) console.log(`  source_id=${r.source_id}: ${r.cnt} pages`);

  // 5. Sample AT statute slugs (if any)
  const sampleAt = (await engine.executeRaw(
    `SELECT slug, source_id FROM pages WHERE slug LIKE 'legal/statutes/at/%' LIMIT 10`,
    []
  )) as any[];
  console.log("\n=== Sample AT statute slugs ===");
  if (sampleAt.length === 0) console.log("  (none found)");
  for (const r of sampleAt) console.log(`  ${r.slug} (source: ${r.source_id})`);

  // 6. Check what slug patterns exist for ALL legal pages
  const legalPatterns = (await engine.executeRaw(
    `SELECT 
       substring(slug from '^legal/[^/]+/[^/]+') as slug_prefix,
       source_id,
       count(*) as cnt
     FROM pages 
     WHERE slug LIKE 'legal/%'
     GROUP BY 1, 2
     ORDER BY cnt DESC
     LIMIT 30`,
    []
  )) as any[];
  console.log("\n=== All legal slug patterns (top 30) ===");
  for (const r of legalPatterns) console.log(`  ${r.slug_prefix} (source: ${r.source_id}): ${r.cnt}`);

  // 7. Total page count
  const total = (await engine.executeRaw(
    `SELECT count(*) as cnt FROM pages`,
    []
  )) as any[];
  console.log(`\n=== Total pages in DB ===`);
  for (const r of total) console.log(`  ${r.cnt}`);

  // 8. Total chunks and embeddings
  const chunks = (await engine.executeRaw(
    `SELECT count(*) as total, count(embedding) as with_emb FROM content_chunks`,
    []
  )) as any[];
  console.log(`\n=== Chunks ===`);
  for (const r of chunks) console.log(`  total: ${r.total}, with embeddings: ${r.with_emb}`);

  // 9. Links/judikatur-cites
  const links = (await engine.executeRaw(
    `SELECT link_type, link_source, count(*) as cnt FROM links GROUP BY 1, 2 ORDER BY cnt DESC LIMIT 10`,
    []
  )) as any[];
  console.log(`\n=== Links by type ===`);
  if (links.length === 0) console.log("  (no links)");
  for (const r of links) console.log(`  ${r.link_type}/${r.link_source}: ${r.cnt}`);

  // 10. Check what brains exist
  const brains = (await engine.executeRaw(
    `SELECT id, name FROM sources WHERE id LIKE 'brain_%' LIMIT 5`,
    []
  )) as any[];
  console.log(`\n=== Active brains (sample) ===`);
  for (const r of brains) console.log(`  ${r.id}: ${r.name}`);

  await engine.disconnect();
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AUDIT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
