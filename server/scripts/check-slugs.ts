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

  const abgb = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/abgb/%' ORDER BY slug LIMIT 10`, []
  )) as any[];
  console.log("ABGB slugs (first 10):");
  for (const r of abgb) console.log(`  ${r.slug}`);

  for (const ref of ["1", "36", "125", "268", "1249", "1311", "1489"]) {
    const r = (await engine.executeRaw(
      `SELECT slug FROM pages WHERE source_id = 'law-at' AND slug = 'legal/statutes/at/abgb/p-${ref}'`, []
    )) as any[];
    console.log(`ABGB p-${ref}: ${r.length > 0 ? "YES" : "NO"}`);
  }

  const stgb = (await engine.executeRaw(
    `SELECT slug FROM pages WHERE source_id = 'law-at' AND slug LIKE 'legal/statutes/at/stgb/%' ORDER BY slug LIMIT 5`, []
  )) as any[];
  console.log("\nStGB slugs (first 5):");
  for (const r of stgb) console.log(`  ${r.slug}`);

  await engine.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
