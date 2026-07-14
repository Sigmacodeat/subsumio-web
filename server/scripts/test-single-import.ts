/**
 * Minimal test: can we connect to the engine and import a single §?
 */
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";

async function main() {
  console.log("1. Loading config...");
  const cfg = loadConfig();
  if (!cfg) throw new Error("No config");
  console.log("   Config loaded:", cfg.engine ?? "postgres");

  console.log("2. Configuring gateway...");
  configureGateway(buildGatewayConfig(cfg));

  console.log("3. Creating engine...");
  const engine = await createEngine(toEngineConfig(cfg));

  console.log("4. Connecting engine...");
  await engine.connect(toEngineConfig(cfg));
  console.log("   Connected.");

  console.log("5. Init schema...");
  await engine.initSchema();
  console.log("   Schema ready.");

  console.log("6. Testing single importFromContent...");
  const { importFromContent } = await import("../src/core/import-file.ts");
  const testContent = `---
title: "ABGB § 1 — Test"
type: "law"
jurisdiction: "at"
abbreviation: "ABGB"
paragraph: "1"
statute: "ABGB"
---

# § 1 ABGB — Test

Dies ist ein Test-Paragraph.
`;
  const result = await importFromContent(engine, "legal/statutes/at/abgb/p-1", testContent, {
    noEmbed: true,
    sourceId: "law-at",
  });
  console.log("   Result:", result.status, result.slug, "chunks:", result.chunks);

  console.log("7. Checking DB...");
  const rows = (await engine.executeRaw(
    `SELECT slug, source_id FROM pages WHERE slug = 'legal/statutes/at/abgb/p-1'`,
    []
  )) as any[];
  console.log("   DB:", rows.length > 0 ? `${rows[0].slug} (${rows[0].source_id})` : "NOT FOUND");

  await engine.disconnect();
  console.log("8. Done.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
