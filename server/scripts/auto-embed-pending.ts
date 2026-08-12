#!/usr/bin/env bun
/**
 * Auto-Embed Pipeline — Nachbesserung für Pages ohne Embeddings.
 *
 * Läuft nach Bulk-Importen (z.B. --no-embed) oder als Scheduled Job.
 * Findet content_chunks mit embedded_at IS NULL und embedded sie nach.
 *
 * Nutzt die konfigurierte Engine (Postgres oder PGLite) via loadConfig/createEngine.
 *
 * Usage:
 *   bun run scripts/auto-embed-pending.ts
 *   bun run scripts/auto-embed-pending.ts --batch-size 50
 *   bun run scripts/auto-embed-pending.ts --dry-run
 *   bun run scripts/auto-embed-pending.ts --source law-at
 */

import { parseArgs } from "util";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "batch-size": { type: "string", default: "50" },
    "dry-run": { type: "boolean", default: false },
    source: { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Auto-Embed Pipeline — Ungesetzte Embeddings nachholen

Usage:
  bun run scripts/auto-embed-pending.ts [options]

Options:
  --batch-size   Chunks pro Batch (default: 50)
  --dry-run      Nur anzeigen, nicht embedden
  --source       Nur Chunks dieser Source-ID (default: alle)
  --help         Diese Hilfe
`);
  process.exit(0);
}

const BATCH_SIZE = parseInt(String(values["batch-size"]), 10) || 50;
const DRY_RUN = values["dry-run"] as boolean;
const SOURCE_FILTER = values.source as string | undefined;

interface PendingChunk {
  id: string;
  chunk_text: string;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Auto-Embed Pipeline");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Batch-Größe: ${BATCH_SIZE}`);
  console.log(`Dry-Run: ${DRY_RUN ? "JA" : "Nein"}`);
  console.log(`Source-Filter: ${SOURCE_FILTER ?? "alle"}`);
  console.log("");

  // Connect to configured engine (Postgres or PGLite)
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../src/core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  // NO initSchema() — production schema is already up-to-date.
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    /* non-fatal */
  }

  // Count pending — skip metadata chunks (Gericht/Datum/GZ only, no semantic value)
  // and skip chunks < 30 chars (literally useless for semantic search)
  const sourceFilter = SOURCE_FILTER
    ? " AND source_id = $1"
    : "";
  const countParams = SOURCE_FILTER ? [SOURCE_FILTER] : [];
  const countRows = await engine.executeRaw(
    `SELECT count(*)::int as cnt FROM content_chunks
     WHERE embedded_at IS NULL
       AND chunk_role != 'metadata'
       AND LENGTH(chunk_text) >= 30${sourceFilter}`,
    countParams
  );
  const pendingCount = countRows[0].cnt as number;
  console.log(`Pending chunks ohne Embedding (metadata + <30 chars excluded): ${pendingCount}`);

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
    const queryParams = SOURCE_FILTER ? [BATCH_SIZE, SOURCE_FILTER] : [BATCH_SIZE];
    const rows = await engine.executeRaw(
      `SELECT id, chunk_text FROM content_chunks
       WHERE embedded_at IS NULL
         AND chunk_role != 'metadata'
         AND LENGTH(chunk_text) >= 30${sourceFilter}
       ORDER BY id
       LIMIT $1`,
      queryParams
    );
    const chunks = rows as unknown as PendingChunk[];
    if (chunks.length === 0) break;

    const batchNum = Math.floor(processed / BATCH_SIZE) + 1;
    console.log(
      `Embedding Batch ${batchNum} (${chunks.length} chunks)... [${processed}/${pendingCount}]`
    );

    try {
      const texts = chunks.map((c) => c.chunk_text);
      const embeddings = await embedBatch(texts);
      const sig = await currentEmbeddingSignature();

      for (let i = 0; i < chunks.length; i++) {
        await engine.executeRaw(
          `UPDATE content_chunks
           SET embedding = $1, embedded_at = now(), embedding_signature = $2
           WHERE id = $3`,
          [JSON.stringify(Array.from(embeddings[i])), sig, chunks[i].id]
        );
      }
      processed += chunks.length;
    } catch (e) {
      errors += chunks.length;
      console.error(`Batch-Fehler: ${e instanceof Error ? e.message : String(e)}`);
      // Advance past this batch to avoid infinite loop on persistent errors
      for (const c of chunks) {
        await engine.executeRaw(
          `UPDATE content_chunks SET embedded_at = now() WHERE id = $1`,
          [c.id]
        );
      }
      processed += chunks.length;
    }
  }

  console.log("");
  console.log(`Fertig: ${processed} embedded, ${errors} Fehler.`);
  console.log("");

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
