#!/usr/bin/env bun
/**
 * Devalues the vector, not the page. audit-plausibility-full.ts found 56,085
 * pages that already carry an embedding_qwen vector despite failing the same
 * plausibility check the normalizer gates new imports with (known-bad fetch
 * generation, legacy pre-canonical frontmatter, or a body issue like a
 * screenreader-copy duplicate or a missing content section). A vector built
 * on wrong or stub text is worse than no vector — it ranks confidently for
 * queries it should never answer.
 *
 * This nulls embedding_qwen (+ its model/timestamp columns) for exactly
 * those chunks, using the SAME assessPage() the audit ran — no separate,
 * driftable selection logic. It does NOT touch pages.compiled_truth or
 * delete anything: once a page's underlying text is actually fixed (RIS
 * re-fetch, schema repair), it re-embeds normally. Until then it correctly
 * falls out of "already done" counts instead of silently overstating them.
 *
 * Usage:
 *   bun run scripts/invalidate-implausible-embeddings.ts --dry-run
 *   bun run scripts/invalidate-implausible-embeddings.ts
 */

import { parseArgs } from "util";
import { assessPage, DOC_CLASS_OF_SOURCE, type PageRow } from "./audit-plausibility-full.ts";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

interface DbRow extends PageRow {
  embedded_chunk_count: string;
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const DRY = values["dry-run"] as boolean;
  const sources = values.source ? [values.source as string] : Object.keys(DOC_CLASS_OF_SOURCE);

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const PAGE_SIZE = 2000;
  let totalPages = 0;
  let totalChunks = 0;

  try {
    for (const source of sources) {
      const docClass = DOC_CLASS_OF_SOURCE[source]!;
      let lastId = 0;
      let sourcePages = 0;
      let sourceChunks = 0;

      for (;;) {
        const batch = (await engine.executeRaw(
          `SELECT p.id, p.frontmatter, p.compiled_truth,
                  (SELECT count(*) FROM content_chunks c WHERE c.page_id = p.id AND c.embedding_qwen IS NOT NULL) AS embedded_chunk_count
             FROM pages p
            WHERE p.deleted_at IS NULL AND p.source_id = $1 AND p.id > $2
            ORDER BY p.id
            LIMIT $3`,
          [source, lastId, PAGE_SIZE]
        )) as DbRow[];
        if (batch.length === 0) break;

        for (const row of batch) {
          const embeddedCount = Number(row.embedded_chunk_count);
          if (embeddedCount === 0) continue;
          const verdict = assessPage(row, docClass);
          if (verdict.ok) continue;

          sourcePages++;
          sourceChunks += embeddedCount;
          if (!DRY) {
            await engine.executeRaw(
              `UPDATE content_chunks
                  SET embedding_qwen = NULL, embedding_qwen_model = NULL, embedding_qwen_embedded_at = NULL
                WHERE page_id = $1 AND embedding_qwen IS NOT NULL`,
              [row.id]
            );
          }
        }
        lastId = batch[batch.length - 1]!.id;
      }

      if (sourcePages > 0) {
        console.log(
          `${source}: ${sourcePages.toLocaleString("de-AT")} Seiten, ${sourceChunks.toLocaleString("de-AT")} Chunks ${DRY ? "würden entwertet" : "entwertet"}`
        );
      }
      totalPages += sourcePages;
      totalChunks += sourceChunks;
    }
  } finally {
    await engine.disconnect();
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(
    `  ${DRY ? "TROCKENLAUF — " : ""}Gesamt: ${totalPages.toLocaleString("de-AT")} Seiten, ${totalChunks.toLocaleString("de-AT")} Chunks ${DRY ? "würden entwertet" : "entwertet"}`
  );
  console.log("═══════════════════════════════════════════════════════════");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
