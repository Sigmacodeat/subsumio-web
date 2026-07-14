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

  // What sources exist?
  const sources = (await engine.executeRaw(
    `SELECT id FROM sources ORDER BY id`,
    []
  )) as any[];
  console.log("=== All sources ===");
  for (const r of sources) console.log(`  ${r.id}`);

  // Check pages with law-at source
  const atPages = (await engine.executeRaw(
    `SELECT count(*) as cnt FROM pages WHERE source_id = 'law-at'`,
    []
  )) as any[];
  console.log(`\n=== law-at pages ===`);
  for (const r of atPages) console.log(`  count: ${r.cnt}`);

  // Check any statute pages
  const statutes = (await engine.executeRaw(
    `SELECT source_id, slug, count(*) as cnt FROM pages WHERE slug LIKE 'legal/statutes/%' GROUP BY source_id, slug LIMIT 20`,
    []
  )) as any[];
  console.log(`\n=== Statute pages (sample) ===`);
  for (const r of statutes) console.log(`  ${r.source_id}: ${r.slug} (${r.cnt})`);

  // Check pages with 'at' in slug  
  const atSlugs = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE slug LIKE '%/at/%' LIMIT 10`,
    []
  )) as any[];
  console.log(`\n=== Pages with /at/ in slug ===`);
  for (const r of atSlugs) console.log(`  ${r.slug}`);

  await engine.disconnect();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
