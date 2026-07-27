#!/usr/bin/env bun
/**
 * Re-Embed Pipeline — Migrates chunks from one embedding model to another.
 *
 * Phase 6: Re-embed all chunks with model='zeroentropyai:zembed-1' to
 * 'openrouter:openai/text-embedding-3-small' (1536d).
 *
 * Features:
 *   - Batch processing with configurable batch size
 *   - Rate limiting (sleep between batches)
 *   - Progress tracking with ETA
 *   - Guard: skips chunks already on target model
 *   - Error handling: failed chunks marked, not retried in same run
 *   - Dry-run mode
 *   - Resume capability: tracks progress in /tmp/re-embed-progress.json
 *
 * Usage:
 *   bun run server/scripts/re-embed-model.ts --from "zeroentropyai:zembed-1" --to "openrouter:openai/text-embedding-3-small"
 *   bun run server/scripts/re-embed-model.ts --from "zeroentropyai:zembed-1" --batch-size 100 --sleep-ms 500
 *   bun run server/scripts/re-embed-model.ts --dry-run
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";
import { writeFileSync, readFileSync, existsSync } from "fs";

function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    from: { type: "string", default: "zeroentropyai:zembed-1" },
    to: { type: "string", default: "openrouter:openai/text-embedding-3-small" },
    "batch-size": { type: "string", default: "100" },
    "sleep-ms": { type: "string", default: "300" },
    "dry-run": { type: "boolean", default: false },
    "progress-file": { type: "string", default: "/tmp/re-embed-progress.json" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Re-Embed Pipeline — Migrate chunks from one embedding model to another

Usage:
  bun run server/scripts/re-embed-model.ts [options]

Options:
  --from           Source model to re-embed (default: zeroentropyai:zembed-1)
  --to             Target model (default: openrouter:openai/text-embedding-3-small)
  --batch-size     Chunks per batch (default: 100)
  --sleep-ms       Sleep between batches in ms (default: 300)
  --dry-run        Only count, don't embed
  --progress-file  Progress tracking file (default: /tmp/re-embed-progress.json)
  --help           This help
`);
  process.exit(0);
}

const FROM_MODEL = values["from"] as string;
const TO_MODEL = values["to"] as string;
const BATCH_SIZE = parseInt(String(values["batch-size"]), 10) || 100;
const SLEEP_MS = parseInt(String(values["sleep-ms"]), 10) || 300;
const DRY_RUN = values["dry-run"] as boolean;
const PROGRESS_FILE = values["progress-file"] as string;

interface Progress {
  total: number;
  done: number;
  errors: number;
  lastChunkId: number;
  startedAt: string;
  updatedAt: string;
}

function loadProgress(): Progress | null {
  if (!existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveProgress(p: Progress) {
  p.updatedAt = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Re-Embed Pipeline (Model Migration)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`From: ${FROM_MODEL}`);
  console.log(`To:   ${TO_MODEL}`);
  console.log(`Batch: ${BATCH_SIZE} | Sleep: ${SLEEP_MS}ms | Dry-Run: ${DRY_RUN ? "JA" : "Nein"}`);
  console.log("");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  await engine.initSchema();

  // Count chunks to re-embed
  const countResult = await engine.executeRaw(
    `SELECT count(*) as cnt FROM content_chunks WHERE model = $1 AND embedded_at IS NOT NULL`,
    [FROM_MODEL]
  );
  const totalCount = Number((countResult[0] as { cnt: number }).cnt);
  console.log(`Chunks to re-embed (${FROM_MODEL}): ${totalCount.toLocaleString()}`);

  if (totalCount === 0) {
    console.log("Nichts zu tun — alle chunks bereits auf Ziel-Modell.");
    await engine.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] Würde ${totalCount.toLocaleString()} chunks re-embedden.`);
    await engine.disconnect();
    return;
  }

  // Load or init progress
  let progress = loadProgress();
  if (!progress || progress.total !== totalCount) {
    progress = {
      total: totalCount,
      done: 0,
      errors: 0,
      lastChunkId: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveProgress(progress);
    console.log(`Progress: fresh start`);
  } else {
    console.log(
      `Progress: resuming from ${progress.done}/${progress.total} (last ID: ${progress.lastChunkId})`
    );
  }

  const targetSig = await currentEmbeddingSignature();
  console.log(`Target embedding signature: ${targetSig}`);
  console.log("");

  let processed = progress.done;
  let errors = progress.errors;
  let lastId = progress.lastChunkId;
  const startTime = Date.now();

  while (processed < progress.total) {
    // Fetch next batch — ordered by ID for resume capability
    const rows = await engine.executeRaw(
      `SELECT id, chunk_text FROM content_chunks
       WHERE model = $1 AND embedded_at IS NOT NULL AND id > $2
       ORDER BY id LIMIT $3`,
      [FROM_MODEL, lastId, BATCH_SIZE]
    );
    const chunks = rows as unknown as Array<{ id: number; chunk_text: string }>;
    if (chunks.length === 0) break;

    const batchStart = Date.now();

    try {
      const texts = chunks.map((c) => c.chunk_text);
      const embeddings = await embedBatch(texts);

      // Update each chunk
      for (let i = 0; i < chunks.length; i++) {
        await engine.executeRaw(
          `UPDATE content_chunks
           SET embedding = $1::vector, model = $2, embedded_at = now()
           WHERE id = $3`,
          [toVectorStr(embeddings[i]), TO_MODEL, chunks[i].id]
        );
      }

      processed += chunks.length;
      lastId = chunks[chunks.length - 1].id;

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (progress.total - processed) / rate;
      const batchMs = Date.now() - batchStart;

      console.log(
        `  ✅ ${processed.toLocaleString()}/${progress.total.toLocaleString()} ` +
          `(${((processed / progress.total) * 100).toFixed(1)}%) ` +
          `| ${rate.toFixed(1)}/s ETA ${formatETA(remaining)} ` +
          `| batch ${batchMs}ms`
      );

      // Save progress
      progress.done = processed;
      progress.errors = errors;
      progress.lastChunkId = lastId;
      saveProgress(progress);
    } catch (e) {
      errors += chunks.length;
      lastId = chunks[chunks.length - 1].id;
      processed += chunks.length;

      console.error(
        `  ❌ Batch-Fehler bei ID ${lastId}: ${e instanceof Error ? e.message : String(e)}`
      );

      // Mark failed chunks to skip them in future
      for (const c of chunks) {
        await engine
          .executeRaw(`UPDATE content_chunks SET model = 'FAILED_REEMBED' WHERE id = $1`, [c.id])
          .catch(() => {});
      }

      progress.done = processed;
      progress.errors = errors;
      progress.lastChunkId = lastId;
      saveProgress(progress);
    }

    // Rate limit
    if (SLEEP_MS > 0) {
      await Bun.sleep(SLEEP_MS);
    }
  }

  const totalElapsed = (Date.now() - startTime) / 1000;
  console.log("");
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`Fertig: ${processed.toLocaleString()} re-embedded, ${errors} Fehler.`);
  console.log(`Zeit: ${formatETA(totalElapsed)}`);
  console.log(`Rate: ${(processed / totalElapsed).toFixed(1)} chunks/s`);
  console.log(`═══════════════════════════════════════════════════════════`);

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
