#!/usr/bin/env bun
/**
 * Embed pending content_chunks for law-at source using the configured Postgres engine.
 * Usage: bun scripts/embed-pending-at.ts [--batch-size 50] [--source law-at]
 */
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";

const args = Bun.argv.slice(2);
const batchSizeIdx = args.indexOf("--batch-size");
const BATCH_SIZE = batchSizeIdx !== -1 ? parseInt(args[batchSizeIdx + 1], 10) || 50 : 50;
const sourceIdx = args.indexOf("--source");
const SOURCE_ID = sourceIdx !== -1 ? args[sourceIdx + 1] : "law-at";

const cfg = loadConfig();
if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or config.json.");
configureGateway(buildGatewayConfig(cfg));
const engine = await createEngine(toEngineConfig(cfg));
await engine.connect(toEngineConfig(cfg));

// CRITICAL: without this, the gateway keeps its DEFAULT embedding model
// (zeroentropyai:zembed-1) instead of the brain's configured one — the DB
// config key `embedding_model` only loads via reconfigureGatewayWithEngine.
// This exact omission wrote ~68K zembed-1 vectors into a brain configured
// for openrouter:openai/text-embedding-3-small (found 2026-07-14).
await reconfigureGatewayWithEngine(engine);

const sig = currentEmbeddingSignature();

// Count pending
const countRows = await engine.executeRaw(
  `SELECT count(*) as cnt FROM content_chunks c
   JOIN pages p ON c.page_id = p.id
   WHERE p.source_id = $1 AND c.embedded_at IS NULL`,
  [SOURCE_ID]
);
const pendingCount = Number((countRows[0] as { cnt: number }).cnt);
console.log(`Pending chunks for ${SOURCE_ID}: ${pendingCount}`);
if (pendingCount === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

let processed = 0;
let errors = 0;
while (true) {
  const rows: Array<{ id: string; chunk_text: string }> = await engine.executeRaw(
    `SELECT c.id, c.chunk_text FROM content_chunks c
     JOIN pages p ON c.page_id = p.id
     WHERE p.source_id = $1 AND c.embedded_at IS NULL
     ORDER BY c.id LIMIT $2`,
    [SOURCE_ID, BATCH_SIZE]
  );
  if (rows.length === 0) break;

  const texts = rows.map((r) => r.chunk_text);
  try {
    const embeddings = await embedBatch(texts);
    for (let i = 0; i < rows.length; i++) {
      const emb = embeddings[i];
      const vecStr = "[" + (Array.isArray(emb) ? emb : Array.from(emb as Float32Array)).join(",") + "]";
      await engine.executeRaw(
        `UPDATE content_chunks SET embedding = $1::vector, embedded_at = now(), model = $2 WHERE id = $3`,
        [vecStr, sig, rows[i].id]
      );
    }
    processed += rows.length;
    if (processed % 500 === 0 || processed === pendingCount) {
      console.log(`  Embedded ${processed}/${pendingCount} chunks...`);
    }
  } catch (e) {
    errors += rows.length;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ❌ Batch error at offset ${processed}: ${msg.slice(0, 200)}`);
    // Do NOT mark as embedded — leave embedded_at NULL so we can retry
  }
}

console.log("");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  GESAMT: ${processed} chunks embedded, ${errors} errors`);
console.log("═══════════════════════════════════════════════════════════");
process.exit(0);
