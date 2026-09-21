#!/usr/bin/env bun
/**
 * Asks the only question that settles whether a stored vector is still right:
 * does the chunk, as it reads today, embed to the same vector?
 *
 * Every other staleness test is a proxy. `pages.updated_at` misses the write
 * paths that change a title or frontmatter without touching it — and three of
 * those exist (enrich-at-judikatur, enrich-citation-status, schema-pack sync).
 * Title and frontmatter feed the context prefix, so a vector can be stale
 * without any timestamp saying so.
 *
 * This takes a random sample of embedded chunks, rebuilds the exact text the
 * run would send today (shared builder, core/embedding-run.ts), embeds it again
 * and measures the distance to what is stored. A fresh vector comes back at
 * ~0; one made from other text comes back far off. Before trusting that, it
 * embeds the same text twice to confirm the provider is deterministic — if it
 * is not, a nonzero distance means nothing and the run says so.
 *
 * Cost: one embedding per sampled chunk, a few cents for thousands.
 *
 * Usage:
 *   bun run scripts/verify-embedding-freshness.ts --column embedding_qwen --sample 2000
 */

import { parseArgs } from "util";
import { loadConfig, loadConfigWithEngine, toEngineConfig } from "../src/core/config.ts";
import type { GBrainConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";
import { wrapWithPageContext, type PendingChunk } from "../src/core/embedding-run.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    column: { type: "string", default: "embedding_qwen" },
    sample: { type: "string", default: "2000" },
    threshold: { type: "string", default: "0.02" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log("Usage: verify-embedding-freshness.ts [--column embedding_qwen] [--sample 2000] [--threshold 0.02]");
  process.exit(0);
}

const COLUMN = values.column as string;
if (!/^[a-z_][a-z0-9_]*$/.test(COLUMN)) {
  console.error(`Spaltenname unzulässig: ${COLUMN}`);
  process.exit(1);
}
const SAMPLE = Number(values.sample);
// A sample over a four-million-row table needs more than the default
// connection timeout; set before the pool opens so it applies to it.
process.env.GBRAIN_STATEMENT_TIMEOUT = "15min";
const THRESHOLD = Number(values.threshold);

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

function cosineDistance(a: Float32Array, b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engineCfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(engineCfg)) as unknown as Engine;
  await engine.connect(engineCfg);
  const cfg = ((await loadConfigWithEngine(engine as never).catch(() => null)) ??
    fileCfg) as GBrainConfig;

  // The model the column holds, read off the column itself.
  const sig = (await engine.executeRaw(
    `SELECT col_description(a.attrelid, a.attnum) AS c
       FROM pg_attribute a JOIN pg_class cl ON cl.oid = a.attrelid
      WHERE cl.relname = 'content_chunks' AND a.attname = $1`,
    [COLUMN]
  )) as Array<{ c: string | null }>;
  const tag = "subsumio:embedding-signature=";
  const signature = (sig[0]?.c ?? "").startsWith(tag) ? sig[0]!.c!.slice(tag.length) : "";
  if (!signature) {
    console.error(`Spalte ${COLUMN} trägt keine Signatur.`);
    process.exit(1);
  }
  const model = signature.slice(0, signature.lastIndexOf(":"));
  const dims = Number(signature.slice(signature.lastIndexOf(":") + 1));

  configureGateway(
    buildGatewayConfig({ ...cfg, embedding_model: model, embedding_dimensions: dims } as GBrainConfig)
  );
  if (currentEmbeddingSignature() !== signature) {
    console.error(`Gateway arbeitet mit ${currentEmbeddingSignature()}, Spalte hält ${signature}.`);
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Frische der Vektoren in ${COLUMN}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Modell ${signature}, Stichprobe ${SAMPLE}, Schwelle ${THRESHOLD}\n`);

  // ── 1. Ist der Anbieter deterministisch? ─────────────────────────────
  const probe = "Wer einen anderen am Körper verletzt oder an der Gesundheit schädigt, ist zu bestrafen.";
  const [p1, p2] = await embedBatch([probe, probe]);
  const [p3] = await embedBatch([probe]);
  const self = Math.max(
    cosineDistance(p1!, Array.from(p2!)),
    cosineDistance(p1!, Array.from(p3!))
  );
  console.log(`  Gleicher Text, dreimal eingebettet: größter Abstand ${self.toExponential(2)}`);
  if (self > THRESHOLD / 4) {
    console.log(
      `  ⚠ Der Anbieter liefert für gleichen Text schwankende Vektoren. Abstände unter\n` +
        `    ${(self * 4).toFixed(4)} sind Rauschen, nicht Veraltung — die Schwelle wird angehoben.`
    );
  }
  const effective = Math.max(THRESHOLD, self * 4);

  // ── 2. Stichprobe neu einbetten und vergleichen ──────────────────────
  // TABLESAMPLE reads a random share of the table's pages instead of sorting
  // four million rows by random() — which ran into the statement timeout.
  // BERNOULLI keeps the choice row-by-row, so the sample stays unbiased.
  const rows = (await engine.executeRaw(
    `SELECT c.id, c.chunk_text, c.chunk_source, c.page_id, c."${COLUMN}"::text AS vec
       FROM content_chunks c TABLESAMPLE BERNOULLI (0.3)
       JOIN pages p ON p.id = c.page_id
      WHERE c."${COLUMN}" IS NOT NULL AND p.deleted_at IS NULL
      LIMIT $1`,
    [SAMPLE]
  )) as Array<PendingChunk & { vec: string }>;

  let fresh = 0;
  let stale = 0;
  const worst: Array<{ id: number; d: number }> = [];
  const BATCH = 64;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const texts = await wrapWithPageContext(engine, slice);
    const now = await embedBatch(texts);
    for (let j = 0; j < slice.length; j++) {
      const stored = JSON.parse(slice[j]!.vec) as number[];
      const d = cosineDistance(now[j]!, stored);
      if (d <= effective) fresh++;
      else {
        stale++;
        worst.push({ id: slice[j]!.id, d });
      }
    }
    process.stdout.write(`\r  geprüft ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log("\n");

  const share = rows.length > 0 ? (stale / rows.length) * 100 : 0;
  console.log(`  frisch:   ${fresh}`);
  console.log(`  veraltet: ${stale}  (${share.toFixed(2)} %)`);
  if (worst.length > 0) {
    worst.sort((a, b) => b.d - a.d);
    console.log(`\n  Weiteste Abweichungen:`);
    for (const w of worst.slice(0, 5)) console.log(`    Chunk ${w.id}: Abstand ${w.d.toFixed(4)}`);
    const total = (await engine.executeRaw(
      `SELECT count(*)::text AS cnt FROM content_chunks WHERE "${COLUMN}" IS NOT NULL`
    )) as Array<{ cnt: string }>;
    const est = Math.round((stale / rows.length) * Number(total[0]?.cnt ?? 0));
    console.log(`\n  Hochgerechnet auf die Spalte: rund ${est.toLocaleString("de-AT")} veraltete Vektoren.`);
  }

  await engine.disconnect();
  process.exit(stale > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
