/**
 * Embedding Service for Legal Graph — generates vector embeddings for
 * judgement chunks via the engine's /api/embed endpoint.
 *
 * Architecture:
 * - Web app calls ENGINE_URL/api/embed with texts[]
 * - Engine resolves the configured embedding provider (OpenAI, Voyage, etc.)
 * - Engine handles retry, batch splitting, dimension validation
 * - Web app stores embeddings in its own Postgres (subsumio_judgement_chunks)
 *
 * For query-time embedding, uses input_type="query" for asymmetric providers.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { env } from "@/lib/env";
import type { Pool } from "pg";

const LEGAL_GRAPH_BRAIN_ID = "legal-graph";
const EMBED_BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface EmbedResponse {
  embeddings: number[][];
  dimensions: number;
  model: string;
}

/**
 * Call the engine's /api/embed endpoint to generate embeddings.
 * Returns an array of Float32Array vectors.
 */
async function callEngineEmbed(
  texts: string[],
  inputType: "query" | "document" = "document"
): Promise<{ vectors: Float32Array[]; dimensions: number; model: string }> {
  const headers = engineHeadersForBrain(LEGAL_GRAPH_BRAIN_ID);
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${ENGINE_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ texts, input_type: inputType }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Engine embed failed (${res.status}): ${body.error ?? res.statusText}`);
      }

      const data = (await res.json()) as EmbedResponse;
      const vectors = data.embeddings.map((arr) => new Float32Array(arr));

      // Validate: returned count must match input count
      if (vectors.length !== texts.length) {
        throw new Error(
          `Embedding count mismatch: sent ${texts.length} texts, received ${vectors.length} embeddings`
        );
      }

      // Validate: all vectors must have the same dimension
      if (vectors.length > 0 && data.dimensions > 0) {
        for (let i = 0; i < vectors.length; i++) {
          if (vectors[i].length !== data.dimensions) {
            throw new Error(
              `Embedding dimension mismatch at index ${i}: expected ${data.dimensions}, got ${vectors[i].length}`
            );
          }
        }
      }

      return {
        vectors,
        dimensions: data.dimensions,
        model: data.model,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("Embedding failed after retries");
}

/**
 * Embed a single query string (query-side encoding for asymmetric providers).
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const { vectors } = await callEngineEmbed([text], "query");
  return vectors[0];
}

/**
 * Embed a batch of document texts. Automatically splits into sub-batches
 * of EMBED_BATCH_SIZE to stay within engine limits.
 */
export async function embedBatch(
  texts: string[],
  opts?: { onProgress?: (done: number, total: number) => void }
): Promise<Float32Array[]> {
  if (!texts.length) return [];

  const results: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const { vectors } = await callEngineEmbed(batch, "document");
    results.push(...vectors);
    opts?.onProgress?.(results.length, texts.length);
  }
  return results;
}

/**
 * Generate embeddings for all unembedded judgement chunks in the database.
 * Processes in batches and updates the embedding column directly.
 *
 * @param pool - Postgres connection pool
 * @param opts - Optional batch size and progress callback
 */
export async function embedPendingChunks(
  pool: Pool,
  opts?: {
    batchSize?: number;
    maxItems?: number;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<{
  embedded: number;
  skipped: number;
  failed: number;
  model: string;
  dimensions: number;
}> {
  const batchSize = opts?.batchSize ?? 50;
  const maxItems = opts?.maxItems ?? 10000;

  // Count pending chunks
  const countResult = await pool.query(
    `SELECT count(*)::int as count FROM subsumio_judgement_chunks WHERE embedding IS NULL`
  );
  const total = (countResult.rows[0] as { count: number }).count;
  if (total === 0) {
    return { embedded: 0, skipped: 0, failed: 0, model: "", dimensions: 0 };
  }

  let embedded = 0;
  const skipped = 0;
  let failed = 0;
  let model = "";
  let dimensions = 0;

  // Process in batches
  for (let offset = 0; offset < Math.min(total, maxItems); offset += batchSize) {
    // Fetch a batch of unembedded chunks
    const batchResult = await pool.query(
      `SELECT id, chunk_text FROM subsumio_judgement_chunks
       WHERE embedding IS NULL
       ORDER BY id
       LIMIT $1`,
      [batchSize]
    );
    const rows = batchResult.rows as { id: number; chunk_text: string }[];
    if (rows.length === 0) break;

    try {
      const texts = rows.map((r) => r.chunk_text);
      const { vectors, dimensions: dims, model: mdl } = await callEngineEmbed(texts, "document");
      model = mdl;
      dimensions = dims;

      // Update each chunk with its embedding in a single transaction per batch
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < rows.length; i++) {
          const embeddingStr = `[${Array.from(vectors[i]).join(",")}]`;
          await client.query(
            `UPDATE subsumio_judgement_chunks
             SET embedding = $1::vector, embedded_at = NOW()
             WHERE id = $2`,
            [embeddingStr, rows[i].id]
          );
        }
        await client.query("COMMIT");
        embedded += rows.length;
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(
        `[legal-graph] Embedding batch failed at offset ${offset}:`,
        err instanceof Error ? err.message : err
      );
      failed += rows.length;
    }

    opts?.onProgress?.(embedded + skipped + failed, total);
  }

  return { embedded, skipped, failed, model, dimensions };
}

/**
 * Check if the engine has an embedding provider configured.
 */
export async function checkEmbeddingAvailability(): Promise<{
  available: boolean;
  model?: string;
  dimensions?: number;
  error?: string;
}> {
  try {
    const headers = engineHeadersForBrain(LEGAL_GRAPH_BRAIN_ID);
    const apiKey = env("SUBSUMIO_WEB_API_KEY");
    if (apiKey) headers["x-subsumio-api-key"] = apiKey;

    const res = await fetch(`${ENGINE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ texts: ["test"], input_type: "query" }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      return { available: false, error: body.message ?? "No embedding provider configured" };
    }

    if (!res.ok) {
      return { available: false, error: `Engine returned ${res.status}` };
    }

    const data = (await res.json()) as EmbedResponse;
    return {
      available: true,
      model: data.model,
      dimensions: data.dimensions,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
