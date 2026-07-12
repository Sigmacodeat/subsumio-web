#!/usr/bin/env bun
/**
 * Auto-Embed Pipeline (Postgres) — Nachbesserung für Pages ohne Embeddings.
 *
 * Läuft nach Bulk-Importen (z.B. --no-embed) oder als Scheduled Job.
 * Findet content_chunks mit embedded_at IS NULL und embedded sie nach.
 *
 * Usage:
 *   bun run server/scripts/auto-embed-pg.ts
 *   bun run server/scripts/auto-embed-pg.ts --batch-size 50
 *   bun run server/scripts/auto-embed-pg.ts --dry-run
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";

// pgvector expects "[1,2,3,...]" string format, not JSON
function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "batch-size": { type: "string", default: "50" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Auto-Embed Pipeline (Postgres) — Ungesetzte Embeddings nachholen

Usage:
  bun run server/scripts/auto-embed-pg.ts [options]

Options:
  --batch-size   Chunks pro Batch (default: 50)
  --dry-run      Nur anzeigen, nicht embedden
  --help         Diese Hilfe
`);
  process.exit(0);
}

const BATCH_SIZE = parseInt(String(values["batch-size"]), 10) || 50;
const DRY_RUN = values["dry-run"] as boolean;

interface PendingChunk {
  id: number;
  chunk_text: string;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Auto-Embed Pipeline (Postgres)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Batch-Größe: ${BATCH_SIZE}`);
  console.log(`Dry-Run: ${DRY_RUN ? "JA" : "Nein"}`);
  console.log("");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  await engine.initSchema();

  // Count pending
  const countResult = await engine.executeRaw(
    `SELECT count(*) as cnt FROM content_chunks WHERE embedded_at IS NULL`
  );
  const pendingCount = Number((countResult[0] as { cnt: number }).cnt);
  console.log(`Pending chunks ohne Embedding: ${pendingCount}`);

  if (pendingCount === 0) {
    console.log("Alles ist bereits embedded. Nichts zu tun.");
    await engine.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Würde ${pendingCount} chunks embedden.`);
    await engine.disconnect();
    return;
  }

  let processed = 0;
  let errors = 0;

  while (processed < pendingCount) {
    const rows = await engine.executeRaw(
      `SELECT id, chunk_text FROM content_chunks WHERE embedded_at IS NULL LIMIT $1`,
      [BATCH_SIZE]
    );
    const chunks = rows as unknown as PendingChunk[];
    if (chunks.length === 0) break;

    console.log(
      `Embedding Batch ${Math.floor(processed / BATCH_SIZE) + 1} (${chunks.length} chunks)...`
    );

    try {
      const texts = chunks.map((c) => c.chunk_text);
      const embeddings = await embedBatch(texts);
      const sig = await currentEmbeddingSignature();

      for (let i = 0; i < chunks.length; i++) {
        await engine.executeRaw(
          `UPDATE content_chunks
           SET embedding = $1::vector, embedded_at = now(), model = $2
           WHERE id = $3`,
          [toVectorStr(embeddings[i]), sig, chunks[i].id]
        );
      }
      processed += chunks.length;
      console.log(`  ✅ ${processed}/${pendingCount} done`);
    } catch (e) {
      errors += chunks.length;
      console.error(`Batch-Fehler: ${e instanceof Error ? e.message : String(e)}`);
      // Skip these chunks by marking them with a dummy signature to avoid infinite loop
      for (const c of chunks) {
        await engine.executeRaw(
          `UPDATE content_chunks SET model = 'FAILED' WHERE id = $1 AND embedded_at IS NULL`,
          [c.id]
        ).catch(() => {});
      }
    }
  }

  console.log("");
  console.log(`Fertig: ${processed} embedded, ${errors} Fehler.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
