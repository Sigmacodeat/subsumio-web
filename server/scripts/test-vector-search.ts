import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { embedBatch } from "../src/core/embedding.ts";

const cfg = loadConfig();
if (!cfg) throw new Error("No gbrain config found — run `gbrain init` first");
configureGateway(buildGatewayConfig(cfg));
const eng = await createEngine(toEngineConfig(cfg));
await eng.connect(toEngineConfig(cfg));

const queries = [
  { q: "Geschäftsführer Haftung GmbH", source: "law-de" },
];

for (const { q, source } of queries) {
  console.log(`\n=== Query: "${q}" (source: ${source}) ===`);
  try {
    const [emb] = await embedBatch([q]);
    const embStr = JSON.stringify(Array.from(emb));
    const results = await eng.executeRaw(
      `SELECT p.slug, p.title,
              c.embedding <=> $1::vector as distance
       FROM content_chunks c
       JOIN pages p ON c.page_id = p.id
       WHERE p.source_id = $2 AND c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT 5`,
      [embStr, source]
    ) as Array<{ slug: string; title: string; distance: number }>;
    if (results.length === 0) {
      console.log("  No results");
    } else {
      for (const r of results) {
        const score = (1 - (r.distance as number)).toFixed(4);
        console.log(`  [${score}] ${r.slug} — ${r.title}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
  }
}

await eng.disconnect();
