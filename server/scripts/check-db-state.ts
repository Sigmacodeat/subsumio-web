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

  // All distinct law abbreviations from DB
  const laws = (await engine.executeRaw(
    `SELECT DISTINCT split_part(slug, '/', 4) as abbr
     FROM pages
     WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/%'
     ORDER BY abbr`, []
  )) as any[];

  console.log(`=== ${laws.length} laws in DB ===`);
  for (const l of laws) console.log(`  ${l.abbr}`);

  // Check existing links
  const links = (await engine.executeRaw(
    `SELECT count(*) as cnt, link_type FROM links GROUP BY link_type`, []
  )) as any[];
  console.log("\n=== Existing links ===");
  for (const l of links) console.log(`  ${l.link_type}: ${l.cnt}`);

  // Check if any judikatur-cites links exist
  const jc = (await engine.executeRaw(
    `SELECT count(*) as cnt FROM links WHERE link_type = 'judikatur-cites'`, []
  )) as any[];
  console.log(`\njudikatur-cites links: ${jc[0].cnt}`);

  // Check judikatur pages count
  const jp = (await engine.executeRaw(
    `SELECT source_id, count(*) as cnt FROM pages
     WHERE source_id LIKE 'law-at-judikatur%'
     GROUP BY source_id ORDER BY source_id`, []
  )) as any[];
  console.log("\n=== Judikatur pages ===");
  for (const p of jp) console.log(`  ${p.source_id}: ${p.cnt}`);

  await engine.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
