#!/usr/bin/env bun
/**
 * Removes tombstoned pages from the corpus for good.
 *
 * A soft-deleted page is invisible to search and to embedding, but it still
 * occupies the table, and in a legal product a database full of superseded
 * imports is a liability: every audit, every count and every future migration
 * has to reason about rows that mean nothing.
 *
 * Measured on 2026-09-20: 277,752 tombstones with 1,457,690 chunks, roughly
 * 36 GB. They are the pre-normalisation imports — a whole law as one page —
 * replaced in August and September by per-section pages keyed on the RIS
 * document id. 62,009 of the 62,023 that carry a doc_id have an active page
 * under the same id, and spot checks on the rest (Salzburger Jagdgesetz,
 * Wiener Kehrverordnung, GATT, Vorarlberger Naturschutzgebiete) found the law
 * live in the new format with many times the page count.
 *
 * This is irreversible: the nightly backup deliberately excludes the law
 * corpus. Write the inventory first (see RUNBOOK) — which pages existed, with
 * slug, title, document id and content hash — so what was removed stays
 * answerable years later.
 *
 * Deletes cascade to chunks, links, tags, versions and permissions through
 * the foreign keys, so only `pages` is touched. Small batches keep the table
 * available for whatever else is writing to it.
 *
 * Usage:
 *   bun run scripts/purge-tombstoned-pages.ts                 # nur berichten
 *   bun run scripts/purge-tombstoned-pages.ts --yes
 *   bun run scripts/purge-tombstoned-pages.ts --yes --batch 2000 --min-age-days 7
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    yes: { type: "boolean", default: false },
    batch: { type: "string", default: "2000" },
    "min-age-days": { type: "string", default: "7" },
    "pause-ms": { type: "string", default: "200" },
    "statement-timeout": { type: "string", default: "20min" },
    source: { type: "string" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(
    "Usage: purge-tombstoned-pages.ts [--yes] [--batch 2000] [--min-age-days 7]\n" +
      "                                 [--pause-ms 200] [--source <id>]\n" +
      "                                 [--statement-timeout 20min]\n" +
      "  Der Stapel halbiert sich selbst, wenn die Zeitgrenze greift, und\n" +
      "  wächst nach zehn ruhigen Stapeln wieder."
  );
  process.exit(0);
}

const BATCH = Number(values.batch);
const MIN_AGE_DAYS = Number(values["min-age-days"]);
const PAUSE_MS = Number(values["pause-ms"]);
/** Smallest batch worth trying before giving up on a stubborn stretch. */
const MIN_BATCH = 25;

// Deleting a page cascades into content_chunks, and every chunk that carries
// a vector has to be taken out of the HNSW index — which is what makes a
// batch expensive, not the row count. The default connection timeout cancels
// such a batch mid-flight (error 57014), so this run gets its own, generous
// one. Set before the engine is created: the value travels as a startup
// parameter on every connection the pool opens.
process.env.GBRAIN_STATEMENT_TIMEOUT = values["statement-timeout"] as string;
const SOURCE = values.source;

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

const n = (v: number | string) => Number(v).toLocaleString("de-AT");

async function main() {
  const cfg = toEngineConfig(loadConfig());
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  // A tombstone younger than this may be a deletion someone made minutes ago
  // and still wants back. Only settled ones are removed.
  const where =
    `deleted_at IS NOT NULL AND deleted_at < now() - ($1::int * interval '1 day')` +
    (SOURCE ? ` AND source_id = $2` : "");
  const params: unknown[] = SOURCE ? [MIN_AGE_DAYS, SOURCE] : [MIN_AGE_DAYS];

  const rows = (await engine.executeRaw(
    `SELECT source_id, count(*)::text AS seiten,
            coalesce(sum((SELECT count(*) FROM content_chunks c WHERE c.page_id = p.id)), 0)::text AS chunks
       FROM pages p WHERE ${where}
      GROUP BY source_id ORDER BY count(*) DESC`,
    params
  )) as Array<{ source_id: string; seiten: string; chunks: string }>;

  const totalPages = rows.reduce((a, r) => a + Number(r.seiten), 0);
  const totalChunks = rows.reduce((a, r) => a + Number(r.chunks), 0);

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Grabsteine entfernen (älter als ${MIN_AGE_DAYS} Tage)`);
  console.log("═══════════════════════════════════════════════════════════");
  for (const r of rows.slice(0, 15)) {
    console.log(
      `  ${r.source_id.padEnd(28)} ${n(r.seiten).padStart(8)} Seiten  ${n(r.chunks).padStart(10)} Chunks`
    );
  }
  if (rows.length > 15) console.log(`  … und ${rows.length - 15} weitere Quellen`);
  console.log(`\n  Summe: ${n(totalPages)} Seiten, ${n(totalChunks)} Chunks`);

  if (!values.yes) {
    console.log("\nNichts gelöscht. Zum Ausführen --yes angeben.");
    console.log("Vorher das Verzeichnis der betroffenen Seiten sichern (siehe RUNBOOK).");
    await engine.disconnect();
    return;
  }
  if (totalPages === 0) {
    console.log("\nNichts zu tun.");
    await engine.disconnect();
    return;
  }

  console.log(`\nEntferne in Stapeln zu ${n(BATCH)} (Zeitgrenze ${values["statement-timeout"]}) …`);
  const t0 = Date.now();
  let removed = 0;
  let batch = BATCH;
  let clean = 0;
  let lastReport = 0;

  while (true) {
    let gone: Array<{ id: number }>;
    try {
      // Chunks, Verweise, Zeitleisten und Rechte gehen über die
      // Fremdschlüssel-Kaskade mit; angefasst wird nur `pages`.
      gone = (await engine.executeRaw(
        `WITH doomed AS (
           SELECT id FROM pages p WHERE ${where} ORDER BY id LIMIT $${params.length + 1})
         DELETE FROM pages USING doomed WHERE pages.id = doomed.id
         RETURNING pages.id`,
        [...params, batch]
      )) as Array<{ id: number }>;
    } catch (e) {
      // 57014 = statement timeout. Pages differ wildly in how many chunks
      // they carry — one court decision brings twenty-odd, a norm brings one
      // — so a batch size that flies through statutes can stall on
      // judgements. Halve and keep going rather than abandoning the run.
      const code = (e as { code?: string })?.code;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === "57014" && batch > MIN_BATCH) {
        batch = Math.max(MIN_BATCH, Math.floor(batch / 2));
        clean = 0;
        console.log(`  ⚠️ Zeitgrenze erreicht — Stapel auf ${n(batch)} verkleinert.`);
        continue;
      }
      console.error(`  ❌ Abbruch bei Stapelgröße ${n(batch)}: ${msg}`);
      break;
    }

    if (gone.length === 0) break;
    removed += gone.length;

    // Nach zehn ruhigen Stapeln wieder wachsen, bis zur Vorgabe.
    if (batch < BATCH && ++clean >= 10) {
      batch = Math.min(BATCH, batch * 2);
      clean = 0;
    }

    if (removed - lastReport >= 10_000 || gone.length < batch) {
      lastReport = removed;
      const min = (Date.now() - t0) / 60000;
      const rate = Math.round(removed / Math.max(min, 0.01));
      const rest = Math.max(0, totalPages - removed);
      console.log(
        `  ${n(removed)} / ${n(totalPages)} Seiten · ${n(rate)}/min` +
          (rate > 0 ? ` · Rest ca. ${(rest / rate / 60).toFixed(1)} h` : "")
      );
    }
    if (PAUSE_MS > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  const rest = (await engine.executeRaw(
    `SELECT count(*)::text AS cnt FROM pages WHERE deleted_at IS NOT NULL`
  )) as Array<{ cnt: string }>;
  const orphans = (await engine.executeRaw(
    `SELECT count(*)::text AS cnt FROM content_chunks c
      LEFT JOIN pages p ON p.id = c.page_id WHERE p.id IS NULL`
  )) as Array<{ cnt: string }>;

  console.log(`\n✓ ${n(removed)} Seiten entfernt in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
  console.log(`  Grabsteine übrig (jünger als ${MIN_AGE_DAYS} Tage): ${n(rest[0]?.cnt ?? 0)}`);
  console.log(`  Verwaiste Chunks: ${n(orphans[0]?.cnt ?? 0)}`);
  console.log(`\nDanach: VACUUM (ANALYZE) pages, content_chunks;`);

  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
