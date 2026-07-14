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

  // What are the 14 law-at pages?
  const atPages = (await engine.executeRaw(
    `SELECT slug, title FROM pages WHERE source_id = 'law-at' ORDER BY slug`,
    []
  )) as any[];
  console.log("=== law-at pages (14) ===");
  for (const r of atPages) console.log(`  ${r.slug} — ${r.title}`);

  // What are the 4 default pages?
  const defPages = (await engine.executeRaw(
    `SELECT slug, title, source_id FROM pages WHERE source_id = 'default' ORDER BY slug`,
    []
  )) as any[];
  console.log("\n=== default pages (4) ===");
  for (const r of defPages) console.log(`  ${r.slug} — ${r.title}`);

  // Check if there's a config table with brain info
  const configRows = (await engine.executeRaw(
    `SELECT key, value FROM config WHERE key IN ('embedding_model', 'embedding_dimensions', 'chunk_strategy', 'version') ORDER BY key`,
    []
  )) as any[];
  console.log("\n=== DB config ===");
  for (const r of configRows) console.log(`  ${r.key}: ${r.value}`);

  // Check what the slug format looks like for law-at pages
  const slugSample = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE source_id = 'law-at' LIMIT 14`,
    []
  )) as any[];
  console.log("\n=== All law-at slugs ===");
  for (const r of slugSample) console.log(`  ${r.slug}`);

  // Check if statutes exist under a different slug pattern
  const allLegalSlugs = (await engine.executeRaw(
    `SELECT DISTINCT substring(slug from '^legal/[^/]+') as top_level, count(*) as cnt
     FROM pages WHERE slug LIKE 'legal/%'
     GROUP BY 1 ORDER BY 1`,
    []
  )) as any[];
  console.log("\n=== Legal slug top-levels ===");
  for (const r of allLegalSlugs) console.log(`  ${r.top_level}: ${r.cnt}`);

  // Check if there are any statute pages at all
  const statuteCheck = (await engine.executeRaw(
    `SELECT count(*) as cnt FROM pages WHERE slug LIKE '%statutes%'`,
    []
  )) as any[];
  console.log(`\n=== Pages with 'statutes' in slug ===`);
  for (const r of statuteCheck) console.log(`  ${r.cnt}`);

  await engine.disconnect();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
