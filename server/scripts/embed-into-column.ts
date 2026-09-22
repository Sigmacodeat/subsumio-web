#!/usr/bin/env bun
/**
 * Fills a second embedding column, so a model switch costs no downtime.
 *
 * Vectors of two models in one column are not comparable — a cosine
 * distance between them is noise, not similarity. So a switch cannot
 * overwrite the live column while the product is answering questions. This
 * run writes into a scaffold column next to it: search keeps using the old
 * vectors until the new column is complete, verified and promoted
 * (`promote-embedding-column.ts`), which is a catalog rename, not a copy.
 *
 * Three columns are filled together, because the UPDATE rewrites the row
 * anyway and the model that produced a vector must travel with it:
 *   <col>              the vector
 *   <col>_model        its embedding signature
 *   <col>_embedded_at  when it was written
 * The promotion swaps all three against embedding / model / embedded_at.
 *
 * Usage:
 *   # once: create the columns, the index and the registry entry
 *   bun run scripts/embed-into-column.ts --column embedding_qwen \
 *       --model openrouter:qwen/qwen3-embedding-8b --dims 1536 --create
 *
 *   # then, resumable, as often as needed
 *   bun run scripts/embed-into-column.ts --column embedding_qwen
 *   bun run scripts/embed-into-column.ts --column embedding_qwen --dry-run
 */

import { parseArgs } from "util";
import { loadConfig, loadConfigWithEngine, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";
import { resolveEmbeddingColumn } from "../src/core/search/embedding-column.ts";
import {
  embeddableSql,
  toVectorStr,
  wrapWithPageContext,
  type PendingChunk,
} from "../src/core/embedding-run.ts";
import type { GBrainConfig } from "../src/core/config.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    column: { type: "string" },
    model: { type: "string" },
    dims: { type: "string" },
    "batch-size": { type: "string", default: "128" },
    "id-from": { type: "string" },
    "id-to": { type: "string" },
    create: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "max-errors": { type: "string", default: "10" },
    source: { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help || !values.column) {
  console.log(
    "Usage: embed-into-column.ts --column <name> [--model <provider:model> --dims <n> --create]\n" +
      "                            [--batch-size 128] [--source <id>] [--dry-run]\n" +
      "                            [--id-from N --id-to M]   # ein Arbeiter je Id-Fenster"
  );
  process.exit(values.help ? 0 : 1);
}

const COLUMN = values.column as string;
const BATCH_SIZE = Number(values["batch-size"]);
const MAX_ERRORS = Number(values["max-errors"]);
const DRY_RUN = values["dry-run"] as boolean;
const SOURCE_FILTER = values.source;
/** Id window, so several workers can share the table without claiming rows. */
const ID_FROM = values["id-from"] ? Number(values["id-from"]) : 0;
const ID_TO = values["id-to"] ? Number(values["id-to"]) : undefined;

/** Registry keys are SQL identifiers; refuse anything that is not. */
if (!/^[a-z_][a-z0-9_]*$/.test(COLUMN)) {
  console.error(`Spaltenname unzulässig: ${COLUMN}`);
  process.exit(1);
}

const MODEL_COL = `${COLUMN}_model`;
const AT_COL = `${COLUMN}_embedded_at`;
/** Marks the column as ours and records which model's space it holds. */
const COMMENT_TAG = "subsumio:embedding-signature=";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

async function one<T>(engine: Engine, sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = (await engine.executeRaw(sql, params)) as T[];
  return rows[0];
}

/** The signature recorded on the column, or undefined when it has none. */
async function columnSignature(engine: Engine): Promise<string | undefined> {
  const row = await one<{ c: string | null }>(
    engine,
    `SELECT col_description(a.attrelid, a.attnum) AS c
       FROM pg_attribute a JOIN pg_class cl ON cl.oid = a.attrelid
      WHERE cl.relname = 'content_chunks' AND a.attname = $1`,
    [COLUMN]
  );
  const comment = row?.c ?? "";
  return comment.startsWith(COMMENT_TAG) ? comment.slice(COMMENT_TAG.length) : undefined;
}

/** The column's declared type as Postgres reports it, e.g. "vector(1536)". */
async function columnType(engine: Engine): Promise<string | undefined> {
  const row = await one<{ t: string }>(
    engine,
    `SELECT format_type(a.atttypid, a.atttypmod) AS t
       FROM pg_attribute a JOIN pg_class cl ON cl.oid = a.attrelid
      WHERE cl.relname = 'content_chunks' AND a.attname = $1 AND NOT a.attisdropped`,
    [COLUMN]
  );
  return row?.t;
}

async function createColumns(engine: Engine, dims: number, signature: string): Promise<void> {
  console.log(`[create] Spalten anlegen (vector(${dims}))…`);
  // engine.transaction, not a hand-written BEGIN: executeRaw takes a fresh
  // pooled connection per call, and postgres.js refuses a bare BEGIN on a
  // pooled connection for exactly that reason.
  //
  // Adding nullable columns is a catalog change, but it still needs a brief
  // exclusive lock. The corpus pipeline writes to this table all day, so the
  // timeout makes the ALTER give up rather than queue — with every later
  // write queueing behind it.
  await engine.transaction(async (tx) => {
    await tx.executeRaw(`SET LOCAL lock_timeout = '5s'`);
    await tx.executeRaw(
      `ALTER TABLE content_chunks
         ADD COLUMN IF NOT EXISTS "${COLUMN}" vector(${dims}),
         ADD COLUMN IF NOT EXISTS "${MODEL_COL}" text,
         ADD COLUMN IF NOT EXISTS "${AT_COL}" timestamptz`
    );
    await tx.executeRaw(
      `COMMENT ON COLUMN content_chunks."${COLUMN}" IS '${COMMENT_TAG}${signature}'`
    );
  });
  // The run walks ids ascending and only looks at rows still empty; without
  // this, every batch would re-scan the rows that stay empty on purpose
  // (noise, deleted pages). CONCURRENTLY — and therefore outside any
  // transaction — so the pipeline keeps writing.
  console.log(`[create] Teilindex für die offenen Zeilen (nebenläufig)…`);
  await engine.executeRaw(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chunks_${COLUMN}_null"
       ON content_chunks (id) WHERE "${COLUMN}" IS NULL`
  );
  console.log(`[create] fertig.`);
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engineCfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(engineCfg)) as unknown as Engine;
  await engine.connect(engineCfg);

  const cfg = ((await loadConfigWithEngine(engine as never).catch(() => null)) ??
    fileCfg) as GBrainConfig;

  // What the column holds, in order of authority: what it already says,
  // then what the caller declares. A column that already carries vectors of
  // one model must never receive another's.
  const recorded = await columnSignature(engine);
  const declaredModel = values.model;
  const declaredDims = values.dims ? Number(values.dims) : undefined;

  let signature: string;
  if (recorded) {
    signature = recorded;
    if (declaredModel || declaredDims) {
      const wanted = `${declaredModel ?? ""}:${declaredDims ?? ""}`;
      if (declaredModel && declaredDims && wanted !== recorded) {
        console.error(
          `Spalte "${COLUMN}" hält bereits den Vektorraum ${recorded}.\n` +
            `Verlangt wurde ${wanted}. Zwei Modelle in einer Spalte sind nicht vergleichbar.\n` +
            `Entweder die Spalte leeren und den Kommentar setzen, oder eine andere Spalte wählen.`
        );
        process.exit(1);
      }
    }
  } else {
    if (!declaredModel || !declaredDims) {
      console.error(
        `Spalte "${COLUMN}" trägt noch keine Signatur.\n` +
          `Beim ersten Lauf --model und --dims angeben (zusammen mit --create).`
      );
      process.exit(1);
    }
    signature = `${declaredModel}:${declaredDims}`;
  }

  const [model, dimsStr] = [
    signature.slice(0, signature.lastIndexOf(":")),
    signature.slice(signature.lastIndexOf(":") + 1),
  ];
  const dims = Number(dimsStr);
  if (!model || !Number.isInteger(dims) || dims < 1) {
    console.error(`Signatur unlesbar: ${signature}`);
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Embedding in eine zweite Spalte");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Spalte:      ${COLUMN}`);
  console.log(`Modell:      ${model}`);
  console.log(`Dimensionen: ${dims}`);
  console.log(`Quelle:      ${SOURCE_FILTER ?? "alle"}`);
  if (ID_FROM || ID_TO !== undefined)
    console.log(`Id-Fenster:  ${ID_FROM + 1} … ${ID_TO ?? "Ende"}`);
  console.log(`Probelauf:   ${DRY_RUN ? "ja" : "nein"}`);
  console.log("");

  if (values.create && !DRY_RUN) await createColumns(engine, dims, signature);

  // The column must exist and have exactly the declared width, or every
  // insert fails halfway through the run.
  const type = await columnType(engine);
  if (!type) {
    console.error(`Spalte "${COLUMN}" existiert nicht. Erst mit --create anlegen.`);
    process.exit(1);
  }
  if (type.replace(/\s/g, "") !== `vector(${dims})`) {
    console.error(`Spalte "${COLUMN}" ist ${type}, erwartet wurde vector(${dims}).`);
    process.exit(1);
  }

  // Go through the canonical resolver rather than trusting the flags: it
  // validates key, type, dimensions and the provider string the same way
  // search will when the column is promoted.
  const resolved = resolveEmbeddingColumn({ embeddingColumn: COLUMN }, {
    ...cfg,
    embedding_columns: {
      ...(cfg.embedding_columns ?? {}),
      [COLUMN]: { provider: model, dimensions: dims, type: "vector" },
    },
  } as GBrainConfig);

  // Point this process's gateway at the column's model. Only this process —
  // web and engine keep answering from the live column.
  configureGateway(
    buildGatewayConfig({
      ...cfg,
      embedding_model: resolved.embeddingModel,
      embedding_dimensions: resolved.dimensions,
    } as GBrainConfig)
  );

  // The signature the consistency guard will compute at read time must be
  // the one we stamp on every row. If the gateway quietly kept its own
  // model, this is where it shows — before anything is written.
  const runtime = currentEmbeddingSignature();
  if (runtime !== signature) {
    console.error(
      `Das Gateway arbeitet mit "${runtime}", die Spalte hält "${signature}".\n` +
        `Die Modellvorgabe ist nicht angekommen — Lauf abgebrochen, bevor etwas geschrieben wurde.`
    );
    await engine.disconnect();
    process.exit(1);
  }

  const NOISE = embeddableSql("c", "p");
  // Deliberately without the join to pages: counting 5.4 million chunks
  // against their pages took over three minutes at every start, and this
  // number only drives the progress line. It is an upper bound — it still
  // counts the rows that stay empty on purpose (noise, deleted pages).
  const open = await one<{ cnt: string }>(
    engine,
    `SELECT count(*) AS cnt FROM content_chunks c
      WHERE c."${COLUMN}" IS NULL AND c.id > $1 ${ID_TO !== undefined ? "AND c.id <= $2" : ""}`,
    ID_TO !== undefined ? [ID_FROM, ID_TO] : [ID_FROM]
  );
  const done = await one<{ cnt: string }>(
    engine,
    `SELECT count(*) AS cnt FROM content_chunks WHERE "${COLUMN}" IS NOT NULL`
  );
  const total = Number(open?.cnt ?? 0);
  console.log(`Offen: höchstens ${total.toLocaleString("de-AT")} Chunks`);
  console.log(`Bereits in dieser Spalte: ${Number(done?.cnt ?? 0).toLocaleString("de-AT")}`);

  if (DRY_RUN || total === 0) {
    if (DRY_RUN) console.log("Probelauf — nichts eingebettet.");
    await engine.disconnect();
    return;
  }

  // One probe before any money is spent: a provider that silently returns
  // its native width would fail on every insert, batch after batch.
  let probe: Float32Array[];
  try {
    probe = await embedBatch(["Vertragsrücktritt nach § 918 ABGB"]);
  } catch (e) {
    console.error(
      `Das Modell antwortet nicht: ${e instanceof Error ? e.message : String(e)}\n` +
        `Nichts geschrieben. Bei "Insufficient credits" erst das Guthaben aufladen.`
    );
    await engine.disconnect();
    process.exit(1);
  }
  if (probe[0]?.length !== dims) {
    console.error(
      `Das Modell liefert ${probe[0]?.length} Dimensionen, die Spalte erwartet ${dims}.\n` +
        `Lauf abgebrochen, bevor etwas geschrieben wurde.`
    );
    await engine.disconnect();
    process.exit(1);
  }
  console.log(`[probe] Modell liefert ${dims} Dimensionen — passt.\n`);

  let cursor = ID_FROM;
  let processed = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  let sweep = false; // second pass from the start, for rows imported meanwhile
  const t0 = Date.now();

  while (true) {
    const params: unknown[] = SOURCE_FILTER
      ? [BATCH_SIZE, cursor, SOURCE_FILTER]
      : [BATCH_SIZE, cursor];
    if (ID_TO !== undefined) params.push(ID_TO);
    const upper = ID_TO !== undefined ? `AND c.id <= $${params.length}` : "";
    const rows = (await engine.executeRaw(
      `SELECT c.id, c.chunk_text, c.chunk_source, c.page_id
         FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE c."${COLUMN}" IS NULL
          AND c.id > $2
          ${upper}
          AND p.deleted_at IS NULL
          AND ${NOISE}
          ${SOURCE_FILTER ? "AND p.source_id = $3" : ""}
        ORDER BY c.id
        LIMIT $1`,
      params
    )) as PendingChunk[];

    if (rows.length === 0) {
      if (sweep) break;
      // Rows that arrived below the cursor while the run was going.
      sweep = true;
      cursor = ID_FROM;
      console.log("Nachlauf für zwischenzeitlich importierte Chunks…");
      continue;
    }

    cursor = rows[rows.length - 1]!.id;

    let ok = false;
    const backoff = [5000, 15000, 45000];
    for (let attempt = 0; attempt <= backoff.length; attempt++) {
      try {
        const texts = await wrapWithPageContext(engine, rows);
        const vectors = (await embedBatch(texts)).map(toVectorStr);
        await engine.executeRaw(
          `UPDATE content_chunks AS c
              SET "${COLUMN}" = v.vec::vector,
                  "${MODEL_COL}" = $3,
                  "${AT_COL}" = now()
             FROM (SELECT * FROM unnest($1::int[], $2::text[]) AS t(id, vec)) AS v
            WHERE c.id = v.id`,
          [rows.map((r) => r.id), vectors, signature]
        );
        processed += rows.length;
        consecutiveErrors = 0;
        ok = true;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < backoff.length) {
          console.error(`  ⚠️ Versuch ${attempt + 1} fehlgeschlagen: ${msg}`);
          await new Promise((r) => setTimeout(r, backoff[attempt]!));
        } else {
          errors += rows.length;
          consecutiveErrors++;
          console.error(`  ❌ Stapel ab id ${rows[0]!.id} aufgegeben: ${msg}`);
        }
      }
    }

    if (ok && processed % (BATCH_SIZE * 20) === 0) {
      const mins = (Date.now() - t0) / 60000;
      const rate = processed / mins;
      const left = Math.max(0, total - processed);
      console.log(
        `  ${processed.toLocaleString("de-AT")} / ${total.toLocaleString("de-AT")} ` +
          `· ${Math.round(rate).toLocaleString("de-AT")}/min ` +
          `· Rest ca. ${(left / rate / 60).toFixed(1)} h ` +
          `· Fehler ${errors}`
      );
    }

    if (consecutiveErrors >= MAX_ERRORS) {
      console.error(`\nAbbruch nach ${consecutiveErrors} Stapeln in Folge ohne Erfolg.`);
      break;
    }
  }

  const mins = (Date.now() - t0) / 60000;
  console.log(
    `\n✓ ${processed.toLocaleString("de-AT")} Chunks eingebettet in ${mins.toFixed(1)} min, ` +
      `${errors} Fehler.`
  );
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
