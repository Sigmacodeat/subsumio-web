/**
 * Embed stale judikatur chunks — generates embeddings for chunks that
 * were imported with --no-embed.
 *
 * Usage: bun run scripts/embed-judikatur.ts [--source ogh|vfgh|vwgh|all]
 */
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import { runEmbedCore } from "../src/commands/embed.ts";

const args = process.argv.slice(2);
const sourceIdx = args.indexOf("--source");
const sourceKey = sourceIdx >= 0 ? args[sourceIdx + 1] : "all";

const SOURCE_MAP: Record<string, string> = {
  ogh: "law-at-judikatur",
  vfgh: "law-at-judikatur-vfgh",
  vwgh: "law-at-judikatur-vwgh",
};

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try { await reconfigureGatewayWithEngine(engine); } catch {}

  const sources = sourceKey === "all"
    ? Object.values(SOURCE_MAP)
    : [SOURCE_MAP[sourceKey]];

  for (const sourceId of sources) {
    console.log(`\n═══ Embedding stale chunks for ${sourceId} ═══`);
    const result = await runEmbedCore(engine, {
      stale: true,
      sourceId,
      catchUp: true,
    });
    console.log(`  Embedded: ${result.embedded} chunks`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Would embed: ${result.would_embed}`);
    console.log(`  Total chunks: ${result.total_chunks}`);
  }

  await engine.disconnect();
  console.log("\n✅ Done.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
