#!/usr/bin/env bun
/**
 * Asks the same legal questions of two embedding columns and reports which
 * one puts the right provision on the page.
 *
 * The bake-off that chose Qwen ran on a sample. Before the promotion drops
 * the live vectors for good, the claim is worth re-testing against the real
 * corpus — same questions, same chunks, only the embedding space differs.
 *
 * The measure is deliberately blunt and hard to fool: for each question, a
 * lawyer named the provision that answers it. A column scores when that
 * provision is among the first `--k` results. Nothing here can be tuned
 * after the fact.
 *
 * Usage:
 *   bun run scripts/compare-embedding-columns.ts --a embedding --b embedding_qwen
 *   bun run scripts/compare-embedding-columns.ts --b embedding_qwen --k 5 --verbose
 */

import { parseArgs } from "util";
import { loadConfig, loadConfigWithEngine, toEngineConfig } from "../src/core/config.ts";
import type { GBrainConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, embedQuery as gatewayEmbedQuery } from "../src/core/ai/gateway.ts";
import { resolveEmbeddingColumn } from "../src/core/search/embedding-column.ts";
import { QUERY_PROBES, type QueryProbe, probeHit } from "../src/core/embedding-probes.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    a: { type: "string", default: "embedding" },
    b: { type: "string" },
    k: { type: "string", default: "10" },
    limit: { type: "string", default: "40" },
    verbose: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help || !values.b) {
  console.log(
    "Usage: compare-embedding-columns.ts --b <spalte> [--a embedding] [--k 10] [--verbose]"
  );
  process.exit(values.help ? 0 : 1);
}

const K = Number(values.k);
const LIMIT = Math.max(Number(values.limit), K);

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

interface Hit {
  canonical_label: string | null;
  statute_abbr: string | null;
  paragraph_ref: string | null;
  title: string | null;
  distance: number;
}

/** Everything one column needs to answer a question in its own space. */
interface Side {
  name: string;
  model: string;
  dims: number;
  hits: number;
  ranks: number[];
}

async function search(engine: Engine, column: string, vector: Float32Array): Promise<Hit[]> {
  const literal = "[" + Array.from(vector).join(",") + "]";
  return (await engine.executeRaw(
    `SELECT c.canonical_label, c.statute_abbr, c.paragraph_ref, p.title,
            (c."${column}" <=> $1::vector) AS distance
       FROM content_chunks c JOIN pages p ON p.id = c.page_id
      WHERE c."${column}" IS NOT NULL AND p.deleted_at IS NULL
      ORDER BY c."${column}" <=> $1::vector
      LIMIT $2`,
    [literal, LIMIT]
  )) as Hit[];
}

async function runSide(
  engine: Engine,
  cfg: GBrainConfig,
  column: string,
  probes: QueryProbe[]
): Promise<Side> {
  const resolved = resolveEmbeddingColumn({ embeddingColumn: column }, cfg);
  // Each column is asked in its own space: the query goes through that
  // column's model, with that model's query instruction. Asking Qwen
  // vectors with an OpenAI query is the exact mistake this run exists to
  // make impossible.
  configureGateway(
    buildGatewayConfig({
      ...cfg,
      embedding_model: resolved.embeddingModel,
      embedding_dimensions: resolved.dimensions,
    } as GBrainConfig)
  );

  const side: Side = {
    name: column,
    model: resolved.embeddingModel,
    dims: resolved.dimensions,
    hits: 0,
    ranks: [],
  };

  for (const probe of probes) {
    const vector = await gatewayEmbedQuery(probe.question);
    const results = await search(engine, column, vector);
    const rank = results.findIndex((r) => probeHit(probe, r));
    const found = rank >= 0 && rank < K;
    if (found) {
      side.hits++;
      side.ranks.push(rank + 1);
    }
    const mark = found ? `✓ Platz ${rank + 1}` : rank >= 0 ? `~ Platz ${rank + 1}` : "✗";
    console.log(`  ${mark.padEnd(12)} ${probe.question}`);
    if (values.verbose) {
      for (const r of results.slice(0, 3)) {
        console.log(
          `        ${r.distance.toFixed(3)}  ${(r.canonical_label ?? r.title ?? "—").slice(0, 70)}`
        );
      }
    }
  }
  return side;
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engineCfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(engineCfg)) as unknown as Engine;
  await engine.connect(engineCfg);
  const cfg = ((await loadConfigWithEngine(engine as never).catch(() => null)) ??
    fileCfg) as GBrainConfig;

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${QUERY_PROBES.length} Rechtsfragen, Treffer unter den ersten ${K}`);
  console.log("═══════════════════════════════════════════════════════════");

  const sides: Side[] = [];
  for (const column of [values.a as string, values.b as string]) {
    console.log(`\n── ${column} ${"─".repeat(Math.max(0, 50 - column.length))}`);
    sides.push(await runSide(engine, cfg, column, QUERY_PROBES));
  }

  console.log("\n═══ Ergebnis ═══");
  for (const s of sides) {
    const share = ((s.hits / QUERY_PROBES.length) * 100).toFixed(0);
    const avg = s.ranks.length
      ? (s.ranks.reduce((a, b) => a + b, 0) / s.ranks.length).toFixed(1)
      : "—";
    console.log(
      `  ${s.name.padEnd(18)} ${String(s.hits).padStart(2)}/${QUERY_PROBES.length} (${share} %)` +
        `  mittlerer Platz ${avg}   ${s.model}`
    );
  }
  const [a, b] = sides;
  if (a && b) {
    const diff = b.hits - a.hits;
    console.log(
      diff > 0
        ? `\n→ ${b.name} trifft ${diff} Frage(n) mehr.`
        : diff < 0
          ? `\n→ ${a.name} trifft ${-diff} Frage(n) mehr — das Umschalten wäre ein Rückschritt.`
          : `\n→ Gleichstand.`
    );
  }
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
