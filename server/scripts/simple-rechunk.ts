/**
 * Simple SQL-based re-chunker for pages without chunks.
 * Uses only pg client — no external imports that might fail.
 * Chunks by simple paragraph/sentence splitting (good enough for re-indexing).
 *
 * Uses pg_advisory_lock (shared key 84001 with rechunk-missing.ts and
 * rechunk-orphans.ts) to prevent concurrent rechunk processes.
 *
 * Usage on server:
 *   docker exec hetzner-web-1 bash -c "cd /app/server && bun scripts/simple-rechunk.ts --limit 100"
 *   docker exec hetzner-web-1 bash -c "cd /app/server && bun scripts/simple-rechunk.ts"
 */
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string", default: "0" },
    "batch-size": { type: "string", default: "200" },
  },
});

const DRY_RUN = values["dry-run"] as boolean;
const LIMIT = parseInt((values.limit as string) || "0", 10) || 0;
const BATCH_SIZE = parseInt((values["batch-size"] as string) || "200", 10) || 200;
const DB_URL = process.env.DATABASE_URL!;

/** Shared advisory lock key for all rechunk scripts. Prevents concurrent execution. */
const RECHUNK_LOCK_KEY = 84001;

function ts(): string {
  return new Date().toISOString().split("T")[1].split(".")[0];
}

// Simple chunker: split by double-newline (paragraphs), group to ~300-600 chars
function simpleChunk(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length < 200) return [trimmed];

  // Split by double newline (paragraph boundaries)
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const p = para.trim();
    if (current.length + p.length + 2 > 600 && current.length > 0) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
    if (current.length > 1200) {
      // Split very long paragraphs by sentences
      const sentences = current.split(/(?<=[.!?])\s+/);
      let buf = "";
      for (const s of sentences) {
        if (buf.length + s.length + 1 > 600 && buf.length > 0) {
          chunks.push(buf);
          buf = s;
        } else {
          buf = buf ? buf + " " + s : s;
        }
      }
      current = buf;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function main() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Acquire advisory lock — prevents concurrent rechunk processes
  const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock($1) AS acquired`, [
    RECHUNK_LOCK_KEY,
  ]);
  if (!lockRows[0]?.acquired) {
    console.error(
      `[${ts()}] ⚠️  Another rechunk process is already running (advisory lock ${RECHUNK_LOCK_KEY} held). Exiting.`
    );
    await client.end();
    process.exit(1);
  }
  console.log(`[${ts()}] Advisory lock acquired (${RECHUNK_LOCK_KEY})`);

  console.log(
    `[${ts()}] Simple re-chunk — mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}, batch: ${BATCH_SIZE}${LIMIT > 0 ? `, limit: ${LIMIT}` : ""}`
  );

  // Count
  const { rows: countRows } = await client.query(
    `SELECT count(*) AS total FROM pages p
     WHERE p.deleted_at IS NULL
       AND length(COALESCE(p.compiled_truth, '')) >= 200
       AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id)`
  );
  const total = parseInt(countRows[0].total, 10);
  console.log(`[${ts()}] Found ${total} pages without chunks (content >= 200 chars)`);
  if (total === 0) {
    await client.end();
    return;
  }

  let processed = 0;
  let chunked = 0;
  let totalChunks = 0;
  let errors = 0;
  let lastId = 0;
  const limitClause =
    LIMIT > 0
      ? ` AND p.id <= (SELECT id FROM pages WHERE id > $1 ORDER BY id LIMIT 1 OFFSET ${LIMIT})`
      : "";

  while (true) {
    const { rows: batch } = await client.query(
      `SELECT p.id, p.slug, p.type, p.compiled_truth
       FROM pages p
       WHERE p.deleted_at IS NULL
         AND p.id > $1
         AND length(COALESCE(p.compiled_truth, '')) >= 200
         AND NOT EXISTS (SELECT 1 FROM content_chunks cc WHERE cc.page_id = p.id)
       ORDER BY p.id
       LIMIT $2`,
      [lastId, BATCH_SIZE]
    );

    if (batch.length === 0) break;

    for (const page of batch) {
      processed++;
      lastId = page.id as number;

      try {
        const body = page.compiled_truth as string;
        const chunks = simpleChunk(body);

        if (chunks.length === 0) continue;

        if (DRY_RUN) {
          totalChunks += chunks.length;
          chunked++;
          continue;
        }

        // Build INSERT
        const vals: string[] = [];
        const params: unknown[] = [];
        let pi = 1;
        for (let i = 0; i < chunks.length; i++) {
          vals.push(`($${pi}, $${pi + 1}, $${pi + 2}, $${pi + 3})`);
          params.push(page.id, i, chunks[i], "compiled_truth");
          pi += 4;
        }

        await client.query(
          `INSERT INTO content_chunks (page_id, chunk_index, chunk_text, chunk_source)
           VALUES ${vals.join(", ")}
           ON CONFLICT (page_id, chunk_index) DO NOTHING`,
          params
        );

        totalChunks += chunks.length;
        chunked++;
      } catch (e) {
        errors++;
        if (errors <= 10) {
          console.error(`[${ts()}] Error page ${page.id}: ${(e as Error).message.slice(0, 100)}`);
        }
      }
    }

    console.log(
      `[${ts()}] Progress: ${processed}/${total} (${chunked} chunked, ${totalChunks} chunks, ${errors} errors) lastId=${lastId}`
    );
  }

  console.log(
    `\n[${ts()}] Done: ${processed} processed, ${chunked} chunked, ${totalChunks} chunks created, ${errors} errors`
  );
  if (DRY_RUN) console.log("DRY RUN — no changes applied");

  // Release advisory lock
  await client.query(`SELECT pg_advisory_unlock($1)`, [RECHUNK_LOCK_KEY]);
  console.log(`[${ts()}] Advisory lock released`);
  await client.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
