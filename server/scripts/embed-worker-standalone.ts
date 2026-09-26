#!/usr/bin/env bun
/**
 * Standalone Embed Worker — fills `content_chunks.embedding IS NULL` without
 * the engine abstraction (direct Postgres connection).
 *
 * The DB side is engine-free; the embedding call is NOT: every batch goes
 * through the gateway (`embedBatch`), so the same rules as every other
 * embedding path apply — OpenRouter privacy preferences (`zdr: true`,
 * `data_collection: "deny"`, recipes/openrouter.ts), the EU-only policy
 * (ai/eu-policy.ts, including a firm's "Nur EU" registry) and the noise /
 * plausibility gates of embedding-run.ts.
 *
 * Scope: by default ONLY the public statute/case-law corpus (`law-*`
 * sources). A firm's source needs `--source <id> --allow-firm-source`; its
 * text is client data and is refused under EU-only on a non-EU provider.
 *
 * Parallel workers are safe: the batch is claimed with FOR UPDATE SKIP LOCKED
 * inside a transaction that lasts until its vectors are written.
 *
 * Usage:
 *   bun run scripts/embed-worker-standalone.ts --batch-size 50
 *   bun run scripts/embed-worker-standalone.ts --source law-at-judikatur-bvwg
 *   bun run scripts/embed-worker-standalone.ts --source <firm> --allow-firm-source
 */

import { parseArgs } from "util";
import { embeddingOriginOfSource, EuResidencyError } from "../src/core/ai/eu-policy.ts";
import { runEuScopedForSource } from "../src/core/ai/request-eu-policy.ts";
import { embedBatch } from "../src/core/embedding.ts";
import { embeddableSql, toVectorStr, verifiedSql } from "../src/core/embedding-run.ts";

export interface WorkerArgs {
  batchSize: number;
  maxErrors: number;
  maxChunks: number;
  source: string | null;
  allowFirmSource: boolean;
  help: boolean;
}

export function parseWorkerArgs(argv: string[]): WorkerArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      "batch-size": { type: "string", default: "50" },
      "max-errors": { type: "string", default: "10" },
      "max-chunks": { type: "string", default: "0" },
      source: { type: "string" },
      "allow-firm-source": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  return {
    batchSize: parseInt(String(values["batch-size"]), 10) || 50,
    maxErrors: parseInt(String(values["max-errors"]), 10) || 10,
    maxChunks: parseInt(String(values["max-chunks"]), 10) || 0,
    source: (values.source as string | undefined) || null,
    allowFirmSource: values["allow-firm-source"] === true,
    help: values.help === true,
  };
}

/** Which chunks a run may touch. */
export type SourceScope = { kind: "corpus" } | { kind: "source"; sourceId: string; firm: boolean };

/**
 * Default: the public corpus only. A firm source must be named AND
 * explicitly allowed — its text is client data.
 */
export function resolveSourceScope(
  args: Pick<WorkerArgs, "source" | "allowFirmSource">
): SourceScope {
  if (!args.source) return { kind: "corpus" };
  const firm = embeddingOriginOfSource(args.source) !== "public_corpus";
  if (firm && !args.allowFirmSource) {
    throw new Error(
      `Quelle "${args.source}" ist keine Korpus-Quelle (law-*): Kanzleidaten werden nur mit ` +
        `--allow-firm-source eingebettet (EU-only-Regeln der Kanzlei gelten).`
    );
  }
  return { kind: "source", sourceId: args.source, firm };
}

/**
 * Claim query for one batch ($1 = batch size, $2 = source id when scoped).
 * Same noise rule as every write path; the plausibility gate (verifiedSql)
 * applies to corpus pages — firm documents never pass through that audit.
 */
export function candidateQuery(scope: SourceScope): string {
  const sourceClause =
    scope.kind === "corpus"
      ? `p.source_id LIKE 'law-%' AND ${verifiedSql("p")}`
      : scope.firm
        ? `p.source_id = $2`
        : `p.source_id = $2 AND ${verifiedSql("p")}`;
  return (
    `SELECT c.id, c.chunk_text, p.source_id FROM content_chunks c` +
    ` JOIN pages p ON p.id = c.page_id` +
    ` WHERE c.embedding IS NULL AND p.deleted_at IS NULL` +
    ` AND ${embeddableSql("c", "p")} AND ${sourceClause}` +
    ` FOR UPDATE OF c SKIP LOCKED LIMIT $1`
  );
}

export function candidateParams(scope: SourceScope, batchSize: number): unknown[] {
  return scope.kind === "corpus" ? [batchSize] : [batchSize, scope.sourceId];
}

interface ConfigReader {
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
}

/**
 * Embed one source's texts through the gateway. A firm that demanded
 * "Nur EU" gets its scope here too, so a non-EU provider is refused
 * (EuResidencyError, nothing sent).
 */
export async function embedForSource(
  config: ConfigReader,
  sourceId: string,
  texts: string[]
): Promise<Float32Array[]> {
  return runEuScopedForSource(config, sourceId, () =>
    // NO RETRIES: a lost response after OpenRouter processed the request
    // would bill the batch again; failed chunks stay NULL for the next run.
    embedBatch(texts, { sourceId, maxRetries: 0 })
  );
}

interface PendingRow {
  id: number;
  chunk_text: string;
  source_id: string;
}

async function main() {
  const args = parseWorkerArgs(Bun.argv.slice(2));
  if (args.help) {
    console.log(`
Standalone Embed Worker

Usage:
  bun run scripts/embed-worker-standalone.ts [options]

Options:
  --batch-size          Chunks per batch (default: 50)
  --max-errors          Max consecutive batch errors before exit (default: 10)
  --max-chunks          Max chunks to embed (0 = unlimited)
  --source              Only this source (default: every law-* corpus source)
  --allow-firm-source   Required for a non-corpus (firm) --source
  --help                Show help
`);
    process.exit(0);
  }
  const scope = resolveSourceScope(args);

  const { loadConfig } = await import("../src/core/config.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway } = await import("../src/core/ai/gateway.ts");
  const { currentEmbeddingSignature } = await import("../src/core/embedding.ts");
  const cfg = loadConfig();
  if (!cfg?.database_url) throw new Error("DATABASE_URL (or a Postgres config) is required");
  configureGateway(buildGatewayConfig(cfg));
  const signature = currentEmbeddingSignature();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Standalone Embed Worker");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Batch-Größe: ${args.batchSize}`);
  console.log(`Modell:      ${signature}`);
  console.log(
    `Quellen:     ${scope.kind === "corpus" ? "Korpus (law-*)" : `${scope.sourceId}${scope.firm ? " (Kanzlei)" : ""}`}`
  );
  console.log(`Max chunks:  ${args.maxChunks || "unlimited"}`);
  console.log("");

  const { default: postgres } = await import("postgres");
  const sql = postgres(cfg.database_url, { max: 5, idle_timeout: 30, connect_timeout: 10 });
  const config: ConfigReader = {
    getConfig: async (key) => {
      const rows = await sql<{ value: string }[]>`SELECT value FROM config WHERE key = ${key}`;
      return rows[0]?.value ?? null;
    },
    // Read-only here: the registry is written by the web API only.
    setConfig: async () => {},
  };

  const query = candidateQuery(scope);
  const params = candidateParams(scope, args.batchSize);
  let processed = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  let batchNum = 0;
  const t0 = Date.now();

  while (true) {
    if (args.maxChunks > 0 && processed >= args.maxChunks) {
      console.log(`\nReached max-chunks limit (${args.maxChunks}). Stopping.`);
      break;
    }
    batchNum++;
    let claimed = 0;
    try {
      await sql.begin(async (tx) => {
        const rows = (await tx.unsafe(query, params as never[])) as unknown as PendingRow[];
        claimed = rows.length;
        if (rows.length === 0) return;
        const bySource = new Map<string, PendingRow[]>();
        for (const r of rows) {
          const list = bySource.get(r.source_id);
          if (list) list.push(r);
          else bySource.set(r.source_id, [r]);
        }
        for (const [sourceId, list] of bySource) {
          const vectors = (
            await embedForSource(
              config,
              sourceId,
              list.map((r) => r.chunk_text)
            )
          ).map(toVectorStr);
          await tx`
            UPDATE content_chunks AS c
            SET embedding = v.vec::vector, embedded_at = now(), model = ${signature}
            FROM (
              SELECT * FROM unnest(${tx.array(list.map((r) => r.id))}::int[], ${tx.array(vectors)}::text[])
              AS t(id, vec)
            ) AS v
            WHERE c.id = v.id
          `;
        }
      });
      if (claimed === 0) {
        console.log("\nNo more pending chunks. Done!");
        break;
      }
      processed += claimed;
      consecutiveErrors = 0;
      console.log(
        `Batch ${batchNum}: ✅ ${processed} chunks embedded (${((Date.now() - t0) / 1000).toFixed(1)}s, errors: ${errors})`
      );
    } catch (e: unknown) {
      if (e instanceof EuResidencyError) {
        // Policy, not a transient failure: retrying would refuse again.
        console.error(`\n⛔ EU-only: ${e.message}`);
        break;
      }
      errors += claimed;
      consecutiveErrors++;
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ Batch ${batchNum} FAILED (skipped, will retry next run): ${errMsg}`);
    }
    if (consecutiveErrors >= args.maxErrors) {
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

if (import.meta.main) {
  main().catch((err) => {
    console.error("FATAL:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
