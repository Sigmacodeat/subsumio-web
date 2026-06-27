#!/usr/bin/env bun
/**
 * Auto-Embed Pipeline — Nachbesserung für Pages ohne Embeddings.
 *
 * Läuft nach Bulk-Importen (z.B. --no-embed) oder als Scheduled Job.
 * Findet content_chunks mit embedded_at IS NULL und embedded sie nach.
 *
 * Usage:
 *   bun run scripts/auto-embed-pending.ts
 *   bun run scripts/auto-embed-pending.ts --batch-size 50
 *   bun run scripts/auto-embed-pending.ts --dry-run
 */

import { parseArgs } from "util";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";

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
Auto-Embed Pipeline — Ungesetzte Embeddings nachholen

Usage:
  bun run scripts/auto-embed-pending.ts [options]

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
  id: string;
  text: string;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Auto-Embed Pipeline");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Batch-Größe: ${BATCH_SIZE}`);
  console.log(`Dry-Run: ${DRY_RUN ? "JA" : "Nein"}`);
  console.log("");

  const engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();

  const db = (
    engine as unknown as {
      db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
    }
  ).db;

  // Count pending
  const { rows: countRows } = await db.query(`
    SELECT count(*) as cnt FROM content_chunks WHERE embedded_at IS NULL
  `);
  const pendingCount = Number((countRows[0] as { cnt: number }).cnt);
  console.log(`Pending chunks ohne Embedding: ${pendingCount}`);

  if (pendingCount === 0) {
    console.log("Alles ist bereits embedded. Nichts zu tun.");
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Würde ${pendingCount} chunks embedden.`);
    return;
  }

  let processed = 0;
  let errors = 0;

  while (processed < pendingCount) {
    const { rows } = await db.query(
      `SELECT id, text FROM content_chunks WHERE embedded_at IS NULL LIMIT $1`,
      [BATCH_SIZE]
    );
    const chunks = rows as PendingChunk[];
    if (chunks.length === 0) break;

    console.log(
      `Embedding Batch ${Math.floor(processed / BATCH_SIZE) + 1} (${chunks.length} chunks)...`
    );

    try {
      const texts = chunks.map((c) => c.text);
      const embeddings = await embedBatch(texts);
      const sig = await currentEmbeddingSignature();

      for (let i = 0; i < chunks.length; i++) {
        await db.query(
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
    }
  }

  console.log("");
  console.log(`Fertig: ${processed} embedded, ${errors} Fehler.`);
  console.log("");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
