#!/usr/bin/env bun
/**
 * Re-embed content_chunks that were embedded with the wrong model.
 *
 * Resets all chunks where model != the configured embedding signature
 * (embedded_at = NULL, embedding = NULL, model = NULL), then re-embeds
 * them using the same logic as embed-pending-at.ts.
 *
 * Usage:
 *   bun scripts/reembed-wrong-model.ts [--batch-size 200] [--source law-at]
 *   bun scripts/reembed-wrong-model.ts --batch-size 200  # all sources
 */
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";

const args = Bun.argv.slice(2);
const batchSizeIdx = args.indexOf("--batch-size");
const BATCH_SIZE = batchSizeIdx !== -1 ? parseInt(args[batchSizeIdx + 1], 10) || 200 : 200;
const sourceIdx = args.indexOf("--source");
const SOURCE_FILTER = sourceIdx !== -1 ? args[sourceIdx + 1] : null;

// ── Bootstrap engine + gateway (same as embed-pending-at.ts) ──────────
const cfg = loadConfig();
if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or config.json.");
configureGateway(buildGatewayConfig(cfg));
const engine = await createEngine(toEngineConfig(cfg));
await engine.connect(toEngineConfig(cfg));
await reconfigureGatewayWithEngine(engine);

const sig = currentEmbeddingSignature();
console.log(`Configured embedding signature: ${sig}`);

// ── Find all sources with wrong-model chunks ───────────────────────────
const wrongSources: Array<{ source_id: string; cnt: number }> = await engine.executeRaw(
  `SELECT p.source_id, count(*) as cnt
   FROM content_chunks c
   JOIN pages p ON c.page_id = p.id
   WHERE c.embedded_at IS NOT NULL AND c.model != $1
   ${SOURCE_FILTER ? "AND p.source_id = $2" : ""}
   GROUP BY p.source_id
   ORDER BY cnt DESC`,
  SOURCE_FILTER ? [sig, SOURCE_FILTER] : [sig]
);

if (wrongSources.length === 0) {
  console.log("No wrong-model chunks found. Nothing to do.");
  process.exit(0);
}

console.log(`\nFound ${wrongSources.length} source(s) with wrong-model chunks:`);
for (const s of wrongSources) {
  console.log(`  ${s.source_id}: ${s.cnt} chunks`);
}
console.log("");

// ── Phase 1: Reset wrong-model chunks per source ──────────────────────
let totalReset = 0;
for (const { source_id, cnt } of wrongSources) {
  console.log(`[reset] ${source_id}: resetting ${cnt} chunks...`);
  const resetResult: Array<{ id: string }> = await engine.executeRaw(
    `UPDATE content_chunks
     SET embedded_at = NULL, embedding = NULL
     WHERE model != $1
       AND page_id IN (SELECT id FROM pages WHERE source_id = $2)
     RETURNING id`,
    [sig, source_id]
  );
  const resetCount = resetResult.length;
  totalReset += resetCount;
  console.log(`[reset] ${source_id}: ${resetCount} chunks reset to pending`);
}
console.log(`\n[reset] Total: ${totalReset} chunks reset\n`);

// ── Phase 2: Re-embed all pending chunks per source ───────────────────
let totalEmbedded = 0;
let totalErrors = 0;

for (const { source_id } of wrongSources) {
  // Count pending for this source (includes the reset chunks + any pre-existing pending)
  const countRows: Array<{ cnt: number }> = await engine.executeRaw(
    `SELECT count(*) as cnt FROM content_chunks c
     JOIN pages p ON c.page_id = p.id
     WHERE p.source_id = $1 AND c.embedded_at IS NULL`,
    [source_id]
  );
  const pendingCount = Number(countRows[0].cnt);
  console.log(`[embed] ${source_id}: ${pendingCount} pending chunks`);

  if (pendingCount === 0) {
    console.log(`[embed] ${source_id}: nothing to do`);
    continue;
  }

  let processed = 0;
  let errors = 0;
  while (true) {
    const rows: Array<{ id: string; chunk_text: string }> = await engine.executeRaw(
      `SELECT c.id, c.chunk_text FROM content_chunks c
       JOIN pages p ON c.page_id = p.id
       WHERE p.source_id = $1 AND c.embedded_at IS NULL
       ORDER BY c.id LIMIT $2`,
      [source_id, BATCH_SIZE]
    );
    if (rows.length === 0) break;

    const texts = rows.map((r) => r.chunk_text);
    try {
      const embeddings = await embedBatch(texts);
      for (let i = 0; i < rows.length; i++) {
        const emb = embeddings[i];
        const vecStr =
          "[" + (Array.isArray(emb) ? emb : Array.from(emb as Float32Array)).join(",") + "]";
        await engine.executeRaw(
          `UPDATE content_chunks SET embedding = $1::vector, embedded_at = now(), model = $2 WHERE id = $3`,
          [vecStr, sig, rows[i].id]
        );
      }
      processed += rows.length;
      if (processed % 500 === 0 || processed === pendingCount) {
        console.log(`[embed] ${source_id}: ${processed}/${pendingCount} chunks...`);
      }
    } catch (e) {
      errors += rows.length;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[embed] ${source_id}: ❌ Batch error at offset ${processed}: ${msg.slice(0, 200)}`);
    }
  }

  totalEmbedded += processed;
  totalErrors += errors;
  console.log(`[embed] ${source_id}: done (${processed} embedded, ${errors} errors)\n`);
}

console.log("═══════════════════════════════════════════════════════════");
console.log(`  GESAMT: ${totalReset} reset, ${totalEmbedded} re-embedded, ${totalErrors} errors`);
console.log("═══════════════════════════════════════════════════════════");
process.exit(0);
