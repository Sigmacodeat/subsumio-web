#!/usr/bin/env bun
/**
 * Keeps a scaffold embedding column honest while other code writes the table.
 *
 * A vector only means anything together with the text it was made from. The
 * engine's chunk upsert knows that and clears `embedding` whenever
 * `chunk_text` changes on re-import. A scaffold column added for a model
 * migration is invisible to that clause, so a re-import leaves its vector in
 * place describing text that no longer exists — silently, with no error
 * anywhere. Measured on 2026-09-21 during the Qwen run: 514 chunks whose text
 * had since shrunk below the noise threshold still carried a vector, and
 * pairs of now-identical texts had vectors 0.66 apart because they were made
 * from different, older versions.
 *
 * Two mechanisms, because two things can go stale:
 *
 *   trigger   — chunk_text changes: the vector is cleared in the same
 *               statement that changes the text, by the database itself, so
 *               it holds for every writer including ones written later.
 *   sweep     — the page's own metadata changes (title, frontmatter). That
 *               feeds the context prefix, which is part of what was embedded,
 *               but it does not touch content_chunks. `--sweep` clears the
 *               vectors of every chunk whose page was updated after the
 *               vector was written; the embed run picks them up again.
 *
 * The trigger MUST be dropped before the column is renamed into place —
 * a trigger referring to a column that no longer exists fails every write.
 * `promote-embedding-column.ts` does that.
 *
 * Usage:
 *   bun run scripts/guard-scaffold-embedding.ts --column embedding_qwen --install
 *   bun run scripts/guard-scaffold-embedding.ts --column embedding_qwen --sweep
 *   bun run scripts/guard-scaffold-embedding.ts --column embedding_qwen --drop
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    column: { type: "string", default: "embedding_qwen" },
    install: { type: "boolean", default: false },
    sweep: { type: "boolean", default: false },
    drop: { type: "boolean", default: false },
    "batch": { type: "string", default: "2000" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(
    "Usage: guard-scaffold-embedding.ts --column <name> [--install | --sweep | --drop]"
  );
  process.exit(0);
}

const COLUMN = values.column as string;
if (!/^[a-z_][a-z0-9_]*$/.test(COLUMN)) {
  console.error(`Spaltenname unzulässig: ${COLUMN}`);
  process.exit(1);
}
const BATCH = Number(values.batch);
const FN = `trg_clear_${COLUMN}_fn`;
const TRG = `trg_clear_${COLUMN}`;

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  transaction<T>(fn: (tx: Engine) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

const n = (v: unknown) => Number(v ?? 0).toLocaleString("de-AT");

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);
  const one = async <T>(sql: string, p?: unknown[]): Promise<T> =>
    ((await engine.executeRaw(sql, p)) as T[])[0] as T;

  if (values.install) {
    console.log(`Setze Trigger ${TRG} auf content_chunks …`);
    await engine.transaction(async (tx) => {
      await tx.executeRaw(`
        CREATE OR REPLACE FUNCTION ${FN}() RETURNS trigger AS $$
        BEGIN
          IF NEW.chunk_text IS DISTINCT FROM OLD.chunk_text THEN
            NEW."${COLUMN}" := NULL;
            NEW."${COLUMN}_model" := NULL;
            NEW."${COLUMN}_embedded_at" := NULL;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await tx.executeRaw(`DROP TRIGGER IF EXISTS ${TRG} ON content_chunks`);
      await tx.executeRaw(`
        CREATE TRIGGER ${TRG}
          BEFORE UPDATE ON content_chunks
          FOR EACH ROW
          WHEN (NEW.chunk_text IS DISTINCT FROM OLD.chunk_text)
          EXECUTE FUNCTION ${FN}()
      `);
    });
    console.log(`✓ Trigger aktiv — ein geänderter Text löscht seinen Vektor mit.`);
  }

  if (values.drop) {
    await engine.transaction(async (tx) => {
      await tx.executeRaw(`DROP TRIGGER IF EXISTS ${TRG} ON content_chunks`);
      await tx.executeRaw(`DROP FUNCTION IF EXISTS ${FN}()`);
    });
    console.log(`✓ Trigger ${TRG} entfernt.`);
  }

  if (values.sweep) {
    const before = await one<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE c."${COLUMN}" IS NOT NULL AND p.updated_at > c."${COLUMN}_embedded_at"`
    );
    console.log(`Vektoren, deren Seite sich danach geändert hat: ${n(before.cnt)}`);
    let cleared = 0;
    let deadlocks = 0;
    while (true) {
      let rows: Array<{ id: number }>;
      try {
        // ORDER BY id takes the row locks in the same order the embed workers
        // do (they walk ids ascending), and FOR UPDATE SKIP LOCKED steps over
        // a row a worker is holding right now instead of waiting on it. Both
        // run against the same table at the same time; without these the two
        // lock each other (40P01) within the first batch.
        rows = (await engine.executeRaw(
          `WITH stale AS (
             SELECT c.id FROM content_chunks c JOIN pages p ON p.id = c.page_id
              WHERE c."${COLUMN}" IS NOT NULL AND p.updated_at > c."${COLUMN}_embedded_at"
              ORDER BY c.id
              FOR UPDATE OF c SKIP LOCKED
              LIMIT $1)
           UPDATE content_chunks c
              SET "${COLUMN}" = NULL, "${COLUMN}_model" = NULL, "${COLUMN}_embedded_at" = NULL
             FROM stale WHERE c.id = stale.id
           RETURNING c.id`,
          [BATCH]
        )) as Array<{ id: number }>;
      } catch (e) {
        // 40P01 is transient by definition: one side was chosen to lose and
        // nothing was written. Retry; give up only if it keeps happening.
        if ((e as { code?: string })?.code === "40P01" && ++deadlocks <= 20) {
          console.log(`  ⚠️ Deadlock mit einem Arbeiter — neuer Versuch (${deadlocks}).`);
          await new Promise((r) => setTimeout(r, 1000 * deadlocks));
          continue;
        }
        throw e;
      }
      if (rows.length === 0) break;
      cleared += rows.length;
      console.log(`  ${n(cleared)} zurückgesetzt …`);
    }
    console.log(`✓ ${n(cleared)} Vektoren verworfen — der Lauf bettet sie neu ein.`);
  }

  if (!values.install && !values.sweep && !values.drop) {
    const trg = await one<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'content_chunks' AND t.tgname = $1`,
      [TRG]
    );
    const stale = await one<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM content_chunks c JOIN pages p ON p.id = c.page_id
        WHERE c."${COLUMN}" IS NOT NULL AND p.updated_at > c."${COLUMN}_embedded_at"`
    );
    console.log(`Trigger ${TRG}: ${Number(trg.cnt) > 0 ? "aktiv" : "FEHLT"}`);
    console.log(`Veraltete Vektoren: ${n(stale.cnt)}`);
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
