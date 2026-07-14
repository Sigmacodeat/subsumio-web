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

  // Check what statute slugs exist for AT
  const statutes = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/%' LIMIT 20`,
    []
  )) as any[];
  console.log("=== AT statute slugs (sample) ===");
  for (const r of statutes) console.log(`  ${r.slug}`);

  // Check what the import tries to link to
  // Expected format: legal/statutes/at/ABGB/p-36
  const test1 = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE slug = 'legal/statutes/at/abgb/p-36'`,
    []
  )) as any[];
  console.log(`\n=== ABGB §36 exists? (slug: legal/statutes/at/abgb/p-36) ===`);
  console.log(`  ${test1.length > 0 ? test1[0].slug : "NOT FOUND"}`);

  // Check actual ABGB slugs
  const abgb = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/abgb%' LIMIT 10`,
    []
  )) as any[];
  console.log(`\n=== ABGB slugs (lowercase) ===`);
  for (const r of abgb) console.log(`  ${r.slug}`);

  // Check if there are any links with judikatur-cites
  const links = (await engine.executeRaw(
    `SELECT count(*) as cnt FROM links WHERE link_type = 'judikatur-cites'`,
    []
  )) as any[];
  console.log(`\n=== judikatur-cites links ===`);
  for (const r of links) console.log(`  count: ${r.cnt}`);

  // Check what slug format the statutes actually use
  const slugFormats = (await engine.executeRaw(
    `SELECT 
       CASE 
         WHEN slug LIKE 'legal/statutes/at/%/p-%' THEN 'legal/statutes/at/X/p-N'
         WHEN slug LIKE 'legal/statutes/at/%/s-%' THEN 'legal/statutes/at/X/s-N'
         WHEN slug LIKE 'legal/statutes/at/%' THEN 'other'
         ELSE 'unknown'
       END as pattern,
       count(*) as cnt
     FROM pages WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/%'
     GROUP BY 1`,
    []
  )) as any[];
  console.log(`\n=== Slug patterns ===`);
  for (const r of slugFormats) console.log(`  ${r.pattern}: ${r.cnt}`);

  await engine.disconnect();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
