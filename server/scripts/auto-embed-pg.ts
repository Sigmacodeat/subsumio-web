#!/usr/bin/env bun
/**
 * Auto-Embed Pipeline (Postgres) — Nachbesserung für Pages ohne Embeddings.
 *
 * Läuft nach Bulk-Importen (z.B. --no-embed) oder als Scheduled Job.
 * Findet content_chunks mit embedding IS NULL und embedded sie nach.
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
import { assertChunkModelConsistency } from "../src/core/embedding-consistency-guard.ts";
import { randomUUID } from "node:crypto";

// pgvector expects "[1,2,3,...]" string format, not JSON
function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "batch-size": { type: "string", default: "100" },
    "dry-run": { type: "boolean", default: false },
    "max-errors": { type: "string", default: "10" },
    "error-log": { type: "string", default: "/tmp/embed-errors.log" },
    "allow-mixed-models": { type: "boolean", default: false },
    source: { type: "string" },
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
  --max-errors   Max consecutive batch errors before exit (default: 10)
  --error-log    Path to error log file (default: /tmp/embed-errors.log)
  --allow-mixed-models  Repair-only override; permits adding vectors to a mixed index
  --source       Nur chunks einer bestimmten Quelle embedden (z.B. law-at-judikatur-bvwg)
  --help         Diese Hilfe
`);
  process.exit(0);
}

const BATCH_SIZE = parseInt(String(values["batch-size"]), 10) || 50;
const DRY_RUN = values["dry-run"] as boolean;
const MAX_ERRORS = parseInt(String(values["max-errors"]), 10) || 10;
const ERROR_LOG = String(values["error-log"] || "/tmp/embed-errors.log");
const ALLOW_MIXED_MODELS = values["allow-mixed-models"] as boolean;
const SOURCE_FILTER = (values["source"] as string) || null;
const CLAIM_TTL_MINUTES = 30;

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate.?limit|429|timeout|timed.?out|503|502|500|connection|ECONNRESET|ETIMEDOUT|fetch.?failed|abort/i.test(
    msg
  );
}

function logError(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    const f = Bun.file(ERROR_LOG);
    const writer = f.writer();
    writer.write(line);
    writer.flush();
  } catch {}
  console.error(msg);
}

interface PendingChunk {
  id: number;
  chunk_text: string;
}

async function releaseClaim(
  engine: Awaited<ReturnType<typeof createEngine>>,
  claim: string,
  ids: number[],
  targetSignature: string
): Promise<void> {
  if (ids.length === 0) return;
  await engine.executeRaw(
    `UPDATE content_chunks
     SET model = $3, embedded_at = NULL
     WHERE id = ANY($1::int[]) AND model = $2 AND embedding IS NULL`,
    [ids, claim, targetSignature]
  );
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Auto-Embed Pipeline (Postgres)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Batch-Größe: ${BATCH_SIZE}`);
  console.log(`Dry-Run: ${DRY_RUN ? "JA" : "Nein"}`);
  console.log(`Source-Filter: ${SOURCE_FILTER ?? "alle"}`);
  console.log("");

  const tStart = Date.now();
  console.log(`[init] loadConfig...`);
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  console.log(`[init] configureGateway... (${Date.now() - tStart}ms)`);
  configureGateway(buildGatewayConfig(cfg));
  console.log(`[init] createEngine... (${Date.now() - tStart}ms)`);
  const engine = await createEngine(toEngineConfig(cfg));
  console.log(`[init] engine.connect... (${Date.now() - tStart}ms)`);
  await engine.connect(toEngineConfig(cfg));
  console.log(`[init] connected! (${Date.now() - tStart}ms)`);
  // Skip initSchema — schema already exists, avoids blocking during parallel workers

  const targetSignature = currentEmbeddingSignature();
  console.log(`[init] target embedding space: ${targetSignature}`);
  if (!ALLOW_MIXED_MODELS) {
    await assertChunkModelConsistency(engine, targetSignature);
  } else {
    console.warn("⚠️  Mixed-model guard bypassed for controlled repair.");
  }

  // Skip slow count(*) — it blocks on large corpora during parallel startup.
  // Just try to fetch a batch; if empty, we're done.
  console.log("Skipping pending count (fast startup mode)...");

  if (DRY_RUN) {
    const countResult = SOURCE_FILTER
      ? await engine.executeRaw(
          `SELECT count(*) as cnt FROM content_chunks c JOIN pages p ON c.page_id = p.id WHERE c.embedding IS NULL AND p.source_id = $1`,
          [SOURCE_FILTER]
        )
      : await engine.executeRaw(
          `SELECT count(*) as cnt FROM content_chunks WHERE embedding IS NULL`
        );
    const pendingCount = Number((countResult[0] as { cnt: number }).cnt);
    console.log(
      `[DRY-RUN] Würde ${pendingCount} chunks embedden${SOURCE_FILTER ? ` (source: ${SOURCE_FILTER})` : ""}.`
    );
    await engine.disconnect();
    return;
  }

  let processed = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  const t0 = Date.now();
  const claim = `embedding-claim:${randomUUID()}`;

  while (true) {
    // Claim and return a batch in ONE statement. A plain SELECT ... FOR
    // UPDATE through executeRaw releases its row locks as soon as that
    // statement commits, before the network embedding call starts. The claim
    // marker survives that boundary and prevents parallel workers from doing
    // the same paid work. Crashed claims become eligible after the TTL.
    const rows = SOURCE_FILTER
      ? await engine.executeRaw(
          `WITH candidates AS (
             SELECT c.id
             FROM content_chunks c
             JOIN pages p ON c.page_id = p.id
             WHERE c.embedding IS NULL
               AND p.source_id = $4
               AND (
                 c.model NOT LIKE 'embedding-claim:%'
                 OR c.embedded_at IS NULL
                 OR c.embedded_at < now() - ($3::int * interval '1 minute')
               )
             ORDER BY c.id
             FOR UPDATE SKIP LOCKED
             LIMIT $1
           )
           UPDATE content_chunks AS c
           SET model = $2, embedded_at = now()
           FROM candidates
           WHERE c.id = candidates.id
           RETURNING c.id, c.chunk_text`,
          [BATCH_SIZE, claim, CLAIM_TTL_MINUTES, SOURCE_FILTER]
        )
      : await engine.executeRaw(
          `WITH candidates AS (
             SELECT id
             FROM content_chunks
             WHERE embedding IS NULL
               AND (
                 model NOT LIKE 'embedding-claim:%'
                 OR embedded_at IS NULL
                 OR embedded_at < now() - ($3::int * interval '1 minute')
               )
             ORDER BY id
             FOR UPDATE SKIP LOCKED
             LIMIT $1
           )
           UPDATE content_chunks AS c
           SET model = $2, embedded_at = now()
           FROM candidates
           WHERE c.id = candidates.id
           RETURNING c.id, c.chunk_text`,
          [BATCH_SIZE, claim, CLAIM_TTL_MINUTES]
        );
    const chunks = rows as unknown as PendingChunk[];
    if (chunks.length === 0) break;

    const batchNum = Math.floor(processed / BATCH_SIZE) + 1;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `Batch ${batchNum} (${chunks.length} chunks, ${elapsed}s elapsed, errors: ${errors})...`
    );

    let success = false;
    const maxRetries = 3;
    const backoffMs = [5000, 15000, 45000];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const texts = chunks.map((c) => c.chunk_text);
        const embeddings = await embedBatch(texts);
        const ids = chunks.map((c) => c.id);
        const vectors = embeddings.map((e) => toVectorStr(e));
        const models = new Array(chunks.length).fill(targetSignature);
        await engine.executeRaw(
          `UPDATE content_chunks AS c
           SET embedding = v.vec::vector, embedded_at = now(), model = v.model
           FROM (SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS t(id, vec, model)) AS v
           WHERE c.id = v.id AND c.model = $4`,
          [ids, vectors, models, claim]
        );
        processed += chunks.length;
        consecutiveErrors = 0;
        success = true;
        console.log(`  ✅ ${processed} chunks embedded (errors: ${errors})`);
        break;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (attempt < maxRetries && isTransientError(e)) {
          console.error(
            `  ⚠️ Batch ${batchNum} attempt ${attempt + 1}/${maxRetries + 1} failed (transient): ${errMsg}`
          );
          console.log(`  Retrying in ${backoffMs[attempt] / 1000}s...`);
          await new Promise((r) => setTimeout(r, backoffMs[attempt]));
        } else {
          errors += chunks.length;
          consecutiveErrors++;
          const chunkIds = chunks.map((c) => c.id);
          await releaseClaim(engine, claim, chunkIds, targetSignature).catch(() => {});
          logError(
            `Batch ${batchNum} FAILED permanently: ${errMsg} | chunk IDs: [${chunkIds[0]}..${chunkIds[chunkIds.length - 1]}] (${chunkIds.length} chunks)`
          );
          console.error(`  ❌ Batch ${batchNum} FAILED: ${errMsg}`);
          break;
        }
      }
    }

    if (!success && consecutiveErrors >= MAX_ERRORS) {
      logError(`Exiting: ${consecutiveErrors} consecutive batch failures (max: ${MAX_ERRORS})`);
      console.error(`\n⚠️ Exiting after ${consecutiveErrors} consecutive batch failures.`);
      break;
    }
  }

  console.log("");
  console.log(
    `Fertig: ${processed} embedded, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(1)}s total.`
  );
  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
