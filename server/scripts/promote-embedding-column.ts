#!/usr/bin/env bun
/**
 * Puts a finished scaffold column in place of the live one — a rename, not
 * a copy.
 *
 * After `embed-into-column.ts` has filled `<col>`, `<col>_model` and
 * `<col>_embedded_at`, this drops `embedding`, `model` and `embedded_at`
 * and renames the three scaffold columns onto their names, inside one
 * transaction. Postgres does both as catalog operations, so a 98 GB table
 * changes its embedding space in milliseconds and nothing is ever half
 * swapped.
 *
 * The indexes travel with the column, which is why they must exist on the
 * scaffold BEFORE the swap — `--indexes` builds them concurrently while the
 * old ones keep serving search. Promoting without them would leave search
 * scanning four million vectors by hand.
 *
 * Usage:
 *   bun run scripts/promote-embedding-column.ts --column embedding_qwen --check
 *   bun run scripts/promote-embedding-column.ts --column embedding_qwen --indexes
 *   bun run scripts/promote-embedding-column.ts --column embedding_qwen --yes
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { embeddableSql, promotionVerdict } from "../src/core/embedding-run.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    column: { type: "string" },
    check: { type: "boolean", default: false },
    indexes: { type: "boolean", default: false },
    blocking: { type: "boolean", default: false },
    "work-mem": { type: "string", default: "8GB" },
    "parallel-workers": { type: "string", default: "4" },
    yes: { type: "boolean", default: false },
    "allow-partial": { type: "boolean", default: false },
    "signature-batch": { type: "string", default: "20000" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help || !values.column) {
  console.log(
    "Usage: promote-embedding-column.ts --column <name> [--check | --indexes | --yes]\n" +
      "  --check     nur berichten, nichts ändern\n" +
      "  --indexes   die Indizes auf der Ersatzspalte bauen (Stunden)\n" +
      "              --blocking          schneller, sperrt aber Schreibzugriffe\n" +
      "              --work-mem 8GB      Speicher für den Bau\n" +
      "              --parallel-workers 4  nur zusammen mit --blocking wirksam\n" +
      "  --yes       umschalten (verlangt fertige Spalte und fertige Indizes)"
  );
  process.exit(values.help ? 0 : 1);
}

const COLUMN = values.column as string;
if (!/^[a-z_][a-z0-9_]*$/.test(COLUMN)) {
  console.error(`Spaltenname unzulässig: ${COLUMN}`);
  process.exit(1);
}

const MODEL_COL = `${COLUMN}_model`;
const AT_COL = `${COLUMN}_embedded_at`;
const COMMENT_TAG = "subsumio:embedding-signature=";

/** The three indexes the live column carries, mirrored onto the scaffold. */
const INDEXES = [
  {
    scaffold: `idx_chunks_${COLUMN}_hnsw`,
    live: "idx_chunks_embedding",
    ddl: (conc: string) => `CREATE INDEX ${conc} IF NOT EXISTS "idx_chunks_${COLUMN}_hnsw"
            ON content_chunks USING hnsw ("${COLUMN}" vector_cosine_ops)`,
    note: "Vektorindex (baut am längsten)",
  },
  {
    scaffold: `idx_chunks_${COLUMN}_open`,
    live: "idx_chunks_embedding_null",
    ddl: (conc: string) => `CREATE INDEX ${conc} IF NOT EXISTS "idx_chunks_${COLUMN}_open"
            ON content_chunks (page_id, chunk_index) WHERE "${COLUMN}" IS NULL`,
    note: "offene Chunks",
  },
  {
    scaffold: `idx_chunks_${COLUMN}_stale`,
    live: "content_chunks_stale_idx",
    ddl: (conc: string) => `CREATE INDEX ${conc} IF NOT EXISTS "idx_chunks_${COLUMN}_stale"
            ON content_chunks (page_id, chunk_index) WHERE "${COLUMN}" IS NULL`,
    note: "veraltete Chunks",
  },
];

interface ReservedConn {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T>;
  withReservedConnection<T>(fn: (conn: ReservedConn) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
  setConfig?(key: string, value: string): Promise<void>;
}

async function one<T>(engine: Engine, sql: string, params?: unknown[]): Promise<T | undefined> {
  return ((await engine.executeRaw(sql, params)) as T[])[0];
}

async function columnInfo(engine: Engine, name: string) {
  return one<{ t: string; c: string | null }>(
    engine,
    `SELECT format_type(a.atttypid, a.atttypmod) AS t,
            col_description(a.attrelid, a.attnum) AS c
       FROM pg_attribute a JOIN pg_class cl ON cl.oid = a.attrelid
      WHERE cl.relname = 'content_chunks' AND a.attname = $1 AND NOT a.attisdropped`,
    [name]
  );
}

async function indexExists(engine: Engine, name: string): Promise<boolean> {
  const row = await one<{ n: string }>(
    engine,
    `SELECT indexname AS n FROM pg_indexes WHERE tablename = 'content_chunks' AND indexname = $1`,
    [name]
  );
  return row !== undefined;
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const engineCfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(engineCfg)) as unknown as Engine;
  await engine.connect(engineCfg);

  const scaffold = await columnInfo(engine, COLUMN);
  if (!scaffold) {
    console.error(`Spalte "${COLUMN}" existiert nicht.`);
    process.exit(1);
  }
  const signature = (scaffold.c ?? "").startsWith(COMMENT_TAG)
    ? (scaffold.c as string).slice(COMMENT_TAG.length)
    : undefined;
  if (!signature) {
    console.error(`Spalte "${COLUMN}" trägt keine Modell-Signatur — nicht von diesem Lauf.`);
    process.exit(1);
  }
  const live = await columnInfo(engine, "embedding");

  const NOISE = embeddableSql("c", "p");
  const open = await one<{ cnt: string }>(
    engine,
    `SELECT count(*) AS cnt FROM content_chunks c JOIN pages p ON p.id = c.page_id
      WHERE c."${COLUMN}" IS NULL AND p.deleted_at IS NULL AND ${NOISE}`
  );
  const filled = await one<{ cnt: string }>(
    engine,
    `SELECT count(*) AS cnt FROM content_chunks WHERE "${COLUMN}" IS NOT NULL`
  );
  const stray = await one<{ cnt: string }>(
    engine,
    `SELECT count(*) AS cnt FROM content_chunks
      WHERE "${COLUMN}" IS NOT NULL AND "${MODEL_COL}" IS DISTINCT FROM $1`,
    [signature]
  );

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Umschalten der Embedding-Spalte");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Ersatzspalte: ${COLUMN} (${scaffold.t})`);
  console.log(`Live-Spalte:  embedding (${live?.t ?? "—"})`);
  console.log(`Signatur:     ${signature}`);
  console.log(`Gefüllt:      ${Number(filled?.cnt ?? 0).toLocaleString("de-AT")}`);
  console.log(`Offen:        ${Number(open?.cnt ?? 0).toLocaleString("de-AT")}`);
  console.log(`Fremdmodell:  ${Number(stray?.cnt ?? 0).toLocaleString("de-AT")}`);
  console.log("");
  for (const ix of INDEXES) {
    const has = await indexExists(engine, ix.scaffold);
    console.log(`  ${has ? "✓" : "✗"} ${ix.scaffold.padEnd(34)} ${ix.note}`);
  }
  console.log("");

  // One verdict for --check and --yes, so what the check promises is exactly
  // what the swap enforces. The stale-row count is a full join, so it is paid
  // only on these two paths, never on --indexes.
  const judge = async () => {
    const staleRow = (await engine.executeRaw(
      `SELECT count(*)::text AS cnt FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE c."${COLUMN}" IS NOT NULL AND p.updated_at > c."${COLUMN}_embedded_at"`
    )) as Array<{ cnt: string }>;
    const missingIndexes: string[] = [];
    for (const ix of INDEXES) {
      if (!(await indexExists(engine, ix.scaffold))) missingIndexes.push(ix.scaffold);
    }
    return promotionVerdict({
      signature,
      filledRows: Number(filled?.cnt ?? 0),
      openCandidates: Number(open?.cnt ?? 0),
      strayModelRows: Number(stray?.cnt ?? 0),
      missingIndexes,
      staleRows: Number(staleRow[0]?.cnt ?? 0),
      scaffoldType: scaffold.t,
      liveType: live?.t,
      allowPartial: values["allow-partial"] as boolean,
    });
  };

  const report = (v: { blockers: string[]; warnings: string[] }) => {
    for (const w of v.warnings) console.log(`  Hinweis: ${w}`);
    if (v.blockers.length === 0) {
      console.log("  → Umschalten wäre jetzt zulässig.");
      return;
    }
    console.log(`  → Umschalten verweigert:`);
    for (const b of v.blockers) console.log(`    · ${b}`);
  };

  if (values.check) {
    report(await judge());
    await engine.disconnect();
    return;
  }

  if (values.indexes) {
    const workMem = values["work-mem"] as string;
    const parallel = Number(values["parallel-workers"]);
    const blocking = values.blocking as boolean;

    // The HNSW graph for four million vectors is tens of gigabytes. pgvector
    // builds it in memory when it fits in maintenance_work_mem and falls back
    // to a much slower on-disk pass when it does not, so the setting decides
    // between hours and days. It must hold for the CREATE INDEX itself, which
    // is why this runs on a reserved connection: a SET sent through the pool
    // would land on whichever backend answered it.
    //
    // CONCURRENTLY keeps the corpus pipeline writing, but Postgres refuses to
    // parallelise it. --blocking trades write availability for the parallel
    // workers, which is the right trade inside a maintenance window.
    console.log(
      blocking
        ? `Bau mit ${parallel} Arbeitern, Speicher ${workMem} — Schreibzugriffe auf content_chunks sind währenddessen gesperrt.`
        : `Nebenläufiger Bau, Speicher ${workMem} — die Pipeline schreibt weiter, dafür ohne Parallelität.`
    );

    await engine.withReservedConnection(async (conn) => {
      await conn.executeRaw(`SET maintenance_work_mem = '${workMem}'`);
      await conn.executeRaw(
        `SET max_parallel_maintenance_workers = ${blocking ? parallel : 0}`
      );
      for (const ix of INDEXES) {
        if (await indexExists(engine, ix.scaffold)) {
          console.log(`  übersprungen (vorhanden): ${ix.scaffold}`);
          continue;
        }
        console.log(`  baue ${ix.scaffold} — ${ix.note}…`);
        const t = Date.now();
        await conn.executeRaw(ix.ddl(blocking ? "" : "CONCURRENTLY"));
        console.log(`  ✓ ${ix.scaffold} in ${((Date.now() - t) / 60000).toFixed(1)} min`);
      }
    });
    await engine.disconnect();
    return;
  }

  // ---- the swap ------------------------------------------------------
  if (!values.yes) {
    console.log("Nichts geändert. Zum Umschalten --yes angeben.");
    await engine.disconnect();
    return;
  }

  const verdict = await judge();
  if (verdict.blockers.length > 0) {
    console.error("Abbruch — nichts geändert:");
    report(verdict);
    process.exit(1);
  }
  for (const w of verdict.warnings) console.warn(`Hinweis: ${w}`);

  console.log("Schalte um…");
  const t0 = Date.now();
  // engine.transaction, not a hand-written BEGIN: executeRaw takes a fresh
  // pooled connection per call, so a BEGIN sent on its own would not wrap
  // what follows — the drop could commit without the renames and leave the
  // table with no embedding column at all. postgres.js refuses a bare BEGIN
  // on a pooled connection for that very reason.
  //
  // Dropping the columns takes their indexes with them; both drop and
  // rename are catalog operations, so the 98 GB table is never rewritten.
  try {
    await engine.transaction(async (tx) => {
      await tx.executeRaw(`SET LOCAL lock_timeout = '30s'`);
      // The guard trigger names the scaffold column in its body. Once that
      // column is renamed, the function refers to nothing and every UPDATE on
      // content_chunks would fail — so it goes first, in the same transaction.
      // From here on the engine's own upsert clears `embedding` on text change.
      await tx.executeRaw(`DROP TRIGGER IF EXISTS "trg_clear_${COLUMN}" ON content_chunks`);
      await tx.executeRaw(`DROP FUNCTION IF EXISTS "trg_clear_${COLUMN}_fn"()`);
      await tx.executeRaw(
        `ALTER TABLE content_chunks
           DROP COLUMN embedding,
           DROP COLUMN model,
           DROP COLUMN embedded_at`
      );
      await tx.executeRaw(`ALTER TABLE content_chunks RENAME COLUMN "${COLUMN}" TO embedding`);
      await tx.executeRaw(`ALTER TABLE content_chunks RENAME COLUMN "${MODEL_COL}" TO model`);
      await tx.executeRaw(`ALTER TABLE content_chunks RENAME COLUMN "${AT_COL}" TO embedded_at`);
      for (const ix of INDEXES) {
        await tx.executeRaw(`ALTER INDEX "${ix.scaffold}" RENAME TO "${ix.live}"`);
      }
      await tx.executeRaw(`DROP INDEX IF EXISTS "idx_chunks_${COLUMN}_null"`);
      await tx.executeRaw(`COMMENT ON COLUMN content_chunks.embedding IS NULL`);
    });
  } catch (e) {
    console.error("Umschalten fehlgeschlagen, nichts geändert:", e);
    process.exit(1);
  }
  console.log(`✓ umgeschaltet in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // The model the rest of the system believes in.
  const model = signature.slice(0, signature.lastIndexOf(":"));
  const dims = signature.slice(signature.lastIndexOf(":") + 1);
  if (engine.setConfig) {
    await engine.setConfig("embedding_model", model);
    await engine.setConfig("embedding_dimensions", dims);
    console.log(`✓ Konfiguration: embedding_model=${model}, embedding_dimensions=${dims}`);
  }
  console.log(
    `\n⚠️  SUBSUMIO_EMBEDDING_MODEL in der Server-Umgebung hat Vorrang vor dieser\n` +
      `    Konfiguration. Setze dort ${model} und starte web + engine neu,\n` +
      `    sonst fragt die Suche mit dem alten Modell gegen die neuen Vektoren.`
  );

  // Pages carry their own signature for the staleness audit.
  const BATCH = Number(values["signature-batch"]);
  let touched = 0;
  while (true) {
    const rows = (await engine.executeRaw(
      `WITH stale AS (
         SELECT id FROM pages
          WHERE embedding_signature IS DISTINCT FROM $1 AND deleted_at IS NULL
          LIMIT $2)
       UPDATE pages p SET embedding_signature = $1
         FROM stale WHERE p.id = stale.id
       RETURNING p.id`,
      [signature, BATCH]
    )) as Array<{ id: number }>;
    if (rows.length === 0) break;
    touched += rows.length;
    console.log(`  Seiten-Signatur: ${touched.toLocaleString("de-AT")}`);
  }
  console.log(`✓ ${touched.toLocaleString("de-AT")} Seiten auf die neue Signatur gesetzt.`);
  console.log(`\nDanach empfehlenswert: VACUUM (ANALYZE) content_chunks;`);

  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
