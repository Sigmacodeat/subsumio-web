#!/usr/bin/env bun
/**
 * Standalone Embed Worker — bypasses engine abstractions.
 *
 * Directly connects to PostgreSQL, fetches chunks with embedding IS NULL,
 * calls OpenRouter embeddings API, and writes vectors back.
 *
 * Uses FOR UPDATE SKIP LOCKED for parallel worker safety.
 *
 * Usage:
 *   bun run scripts/embed-worker-standalone.ts --batch-size 50
 */

import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "batch-size": { type: "string", default: "50" },
    "max-errors": { type: "string", default: "10" },
    "max-chunks": { type: "string", default: "0" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Standalone Embed Worker

Usage:
  bun run scripts/embed-worker-standalone.ts [options]

Options:
  --batch-size   Chunks per batch (default: 50)
  --max-errors   Max consecutive batch errors before exit (default: 10)
  --max-chunks   Max chunks to embed (0 = unlimited)
  --help         Show help
`);
  process.exit(0);
}

const BATCH_SIZE = parseInt(String(values["batch-size"]), 10) || 50;
const MAX_ERRORS = parseInt(String(values["max-errors"]), 10) || 10;
const MAX_CHUNKS = parseInt(String(values["max-chunks"]), 10) || 0;

const DATABASE_URL = process.env.DATABASE_URL!;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const EMBEDDING_MODEL =
  process.env.SUBSUMIO_EMBEDDING_MODEL || "openrouter:openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = parseInt(process.env.SUBSUMIO_EMBEDDING_DIMENSIONS || "1536", 10);

// Extract the actual model name (strip "openrouter:" prefix)
const MODEL_NAME = EMBEDDING_MODEL.replace(/^openrouter:/, "");

interface PendingChunk {
  id: number;
  chunk_text: string;
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`OpenRouter embeddings API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as {
      data: { embedding: number[] }[];
    };

    return data.data.map((d) => new Float32Array(d.embedding));
  } finally {
    clearTimeout(timeout);
  }
}

function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Standalone Embed Worker");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Batch-Größe: ${BATCH_SIZE}`);
  console.log(`Model: ${MODEL_NAME} (${EMBEDDING_DIMENSIONS}d)`);
  console.log(`Max chunks: ${MAX_CHUNKS || "unlimited"}`);
  console.log("");

  const { default: postgres } = await import("postgres");
  const sql = postgres(DATABASE_URL, { max: 5, idle_timeout: 30, connect_timeout: 10 });

  // Test connection
  const testResult = await sql`SELECT 1 as ok`;
  if (!testResult[0]?.ok) {
    throw new Error("Database connection test failed");
  }
  console.log("[init] Database connected!");

  let processed = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  const t0 = Date.now();

  while (true) {
    if (MAX_CHUNKS > 0 && processed >= MAX_CHUNKS) {
      console.log(`\nReached max-chunks limit (${MAX_CHUNKS}). Stopping.`);
      break;
    }

    // FOR UPDATE SKIP LOCKED: parallel workers don't pick same chunks
    // No ORDER BY — avoids slow sort on 194k+ NULL rows. Random order is fine
    // for embedding backfill.
    const chunks: PendingChunk[] = await sql`
      SELECT id, chunk_text FROM content_chunks
      WHERE embedding IS NULL
      FOR UPDATE SKIP LOCKED
      LIMIT ${BATCH_SIZE}
    `;

    if (chunks.length === 0) {
      console.log("\nNo more pending chunks. Done!");
      break;
    }

    const batchNum = Math.floor(processed / BATCH_SIZE) + 1;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(
      `Batch ${batchNum} (${chunks.length} chunks, ${elapsed}s elapsed, errors: ${errors})...`
    );

    // NO RETRIES. If a batch fails, chunks stay NULL and get picked up next run.
    // Retries caused 5-12x duplicate API billing when OpenRouter processed the
    // request but the response was lost (CONNECTION_CLOSED).
    try {
      const texts = chunks.map((c) => c.chunk_text);
      const embeddings = await embedBatch(texts);

      const chunkIds = chunks.map((c) => c.id);
      const vectors = embeddings.map((e) => toVectorStr(e));
      const model = MODEL_NAME;

      await sql`
        UPDATE content_chunks AS c
        SET embedding = v.vec::vector, embedded_at = now(), model = ${model}
        FROM (
          SELECT * FROM unnest(${sql.array(chunkIds)}::int[], ${sql.array(vectors)}::text[])
          AS t(id, vec)
        ) AS v
        WHERE c.id = v.id
      `;

      processed += chunks.length;
      consecutiveErrors = 0;
      console.log(`  ✅ ${processed} chunks embedded (errors: ${errors})`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      errors += chunks.length;
      consecutiveErrors++;
      console.error(`  ❌ Batch ${batchNum} FAILED (skipped, will retry next run): ${errMsg}`);
    }

    if (consecutiveErrors >= MAX_ERRORS) {
      console.error(`\n⚠️ Exiting after ${consecutiveErrors} consecutive batch failures.`);
      break;
    }
  }

  console.log("");
  console.log(
    `Fertig: ${processed} embedded, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(1)}s total.`
  );
  await sql.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
