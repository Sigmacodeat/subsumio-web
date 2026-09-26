#!/usr/bin/env bun
/**
 * Soft-deletes statute pages that exist only in the database: their RIS
 * document number is neither on disk (_normalized) nor in the RIS in-force
 * index. These are leftovers of older fetch generations (Landesrecht: the
 * 2026-08-03 generation and pre-doc_id imports) — the sync table on
 * /ops/corpus shows them as "nur in DB".
 *
 * Deliberately left alone:
 *   - pages whose doc_id IS in the RIS Soll but not on disk yet — the
 *     targeted fetch (fetch-at-landesrecht-xml --from-index) brings the file,
 *     the import then updates this very page by doc_id;
 *   - pages without doc_id — reported, never touched (no identity to judge);
 *   - older versions dated by mark-superseded-versions.ts (in_force_to set)
 *     — legal history, kept on purpose. Run that script with --apply FIRST.
 *
 * Soft-delete only (deleted_at = now()): invisible to search at once,
 * reversible, and the hard purge stays purge-tombstoned-pages.ts's separate
 * decision. Writes an inventory before touching anything (one file per run,
 * `<inventory-out>-<run id>.jsonl`, appended + fsynced before each source's
 * updates). Updates run in
 * small id batches — one large UPDATE with cascading work held locks for
 * hours on 2026-09-24 and stalled every import.
 *
 * Refuses to run when the disk scan looks broken (fewer documents on disk
 * than half the DB's), so an unmounted corpus can never empty the DB. The
 * RIS Soll is checked just as strictly (`checkSollPlausible`): no run while
 * the crawler's `.skipped.json` sidecar exists, none with an empty Soll or
 * one that shrank below 95 % of the last accepted Soll, and none that would
 * tombstone more than 2 % of the live pages — `--allow-mass` overrides only
 * the last two, deliberately.
 *
 * Usage:
 *   bun run scripts/tombstone-db-orphans.ts                       # dry run, both sources
 *   bun run scripts/tombstone-db-orphans.ts --source law-at-landesrecht --yes
 *   (--dry-run is accepted and is the default; --allow-mass see above)
 */

import { parseArgs } from "util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { INDEX_OF, loadIndexIds, scanNormalized } from "./corpus-sync-inventory.ts";
import {
  InventoryWriter,
  inventoryPathFor,
  makeRunId,
  tombstoneWithInventory,
} from "./tombstone-inventory.ts";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

const SOURCES: Record<string, string> = {
  "law-at-normen": "at-normen",
  "law-at-landesrecht": "at-landesrecht",
};

export interface OrphanPlan {
  orphans: Array<{ id: number; slug: string; doc_id: string }>;
  awaitingFetch: number;
  /** Older versions dated by mark-superseded-versions.ts — kept. */
  dated: number;
  withoutDocId: number;
  livePages: number;
}

/** Pure selection — which live pages are orphans. Exported for tests. */
export function selectOrphans(
  rows: Array<{ id: number; slug: string; doc_id: string | null; dated?: boolean }>,
  onDisk: Set<string> | Map<string, number>,
  soll: Set<string>
): OrphanPlan {
  const plan: OrphanPlan = {
    orphans: [],
    awaitingFetch: 0,
    dated: 0,
    withoutDocId: 0,
    livePages: rows.length,
  };
  for (const r of rows) {
    if (!r.doc_id) plan.withoutDocId++;
    else if (onDisk.has(r.doc_id)) continue;
    else if (soll.has(r.doc_id)) plan.awaitingFetch++;
    else if (r.dated) plan.dated++;
    else plan.orphans.push({ id: r.id, slug: r.slug, doc_id: r.doc_id });
  }
  return plan;
}

/** Minimum share of the last accepted Soll a new Soll must reach. */
export const SOLL_MIN_SHARE_OF_PREVIOUS = 0.95;
/** Maximum share of live pages one run may tombstone without --allow-mass. */
export const MAX_ORPHAN_SHARE = 0.02;

/**
 * Plausibility of the RIS Soll + the resulting plan. Throws with the reason;
 * a shrunken or gap-ridden index must never turn into mass soft-deletes.
 */
export function checkSollPlausible(input: {
  source: string;
  sollSize: number;
  previousSollSize: number | null;
  skippedSidecar: boolean;
  orphanCount: number;
  livePages: number;
  allowMass: boolean;
}): void {
  const { source, sollSize, previousSollSize, skippedSidecar, orphanCount, livePages } = input;
  if (skippedSidecar) {
    throw new Error(
      `${source}: RIS-Index hat übersprungene Seiten (.skipped.json) — erst nachladen. Abbruch.`
    );
  }
  if (sollSize === 0) throw new Error(`${source}: RIS-Soll ist leer — Abbruch.`);
  if (input.allowMass) return;
  if (previousSollSize !== null && sollSize < previousSollSize * SOLL_MIN_SHARE_OF_PREVIOUS) {
    throw new Error(
      `${source}: RIS-Soll ${sollSize} < ${Math.round(SOLL_MIN_SHARE_OF_PREVIOUS * 100)} % des letzten ` +
        `akzeptierten (${previousSollSize}) — Index unvollständig? Abbruch (--allow-mass übersteuert).`
    );
  }
  if (livePages > 0 && orphanCount > livePages * MAX_ORPHAN_SHARE) {
    throw new Error(
      `${source}: ${orphanCount} von ${livePages} Seiten wären verwaist (> ${MAX_ORPHAN_SHARE * 100} %) — ` +
        `Abbruch (--allow-mass übersteuert).`
    );
  }
}

type SollBaseline = Record<string, number>;

function readBaseline(path: string): SollBaseline {
  try {
    const v = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return v && typeof v === "object" ? (v as SollBaseline) : {};
  } catch {
    return {};
  }
}

/** CLI parsing, exported so tests can pin the accepted flags. */
export function parseCliArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: "string" },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "allow-mass": { type: "boolean", default: false },
      root: { type: "string", default: process.env.LAW_CORPUS_ROOT ?? "/law-corpus" },
      "inventory-out": { type: "string", default: "/law-corpus/_state/tombstone-db-orphans.jsonl" },
    },
    allowPositionals: false,
  });
  if (values.yes && values["dry-run"]) throw new Error("--yes und --dry-run schließen sich aus.");
  return values;
}

async function main() {
  const values = parseCliArgs(Bun.argv.slice(2));
  const APPLY = values.yes as boolean;
  const root = values.root as string;
  const sources = values.source ? [values.source as string] : Object.keys(SOURCES);
  for (const s of sources) {
    if (!SOURCES[s])
      throw new Error(`Unbekannte Quelle: ${s} (erlaubt: ${Object.keys(SOURCES).join(", ")})`);
  }

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const runId = makeRunId(`${values.source ?? "all"}${APPLY ? "" : "-dryrun"}`);
  const inventory = new InventoryWriter(inventoryPathFor(values["inventory-out"] as string, runId));
  try {
    for (const source of sources) {
      const corpus = SOURCES[source]!;
      const indexPath = join(root, "_state", INDEX_OF[corpus]!);
      if (!existsSync(indexPath)) throw new Error(`RIS-Index fehlt: ${indexPath}`);
      const soll = loadIndexIds(indexPath);
      const baselinePath = join(root, "_state", "tombstone-db-orphans.soll-baseline.json");
      const baseline = readBaseline(baselinePath);
      const { ids: onDisk } = scanNormalized(join(root, "_normalized", corpus));

      const rows: Array<{ id: number; slug: string; doc_id: string | null; dated: boolean }> = [];
      let lastId = 0;
      for (;;) {
        const batch = (await engine.executeRaw(
          `SELECT id, slug, frontmatter->>'doc_id' AS doc_id,
                  nullif(frontmatter->>'in_force_to', '') IS NOT NULL AS dated
             FROM pages
            WHERE deleted_at IS NULL AND source_id = $1 AND id > $2
            ORDER BY id LIMIT 20000`,
          [source, lastId]
        )) as Array<{ id: number | string; slug: string; doc_id: string | null; dated: boolean }>;
        if (batch.length === 0) break;
        for (const r of batch)
          rows.push({ id: Number(r.id), slug: r.slug, doc_id: r.doc_id, dated: r.dated === true });
        lastId = Number(batch[batch.length - 1]!.id);
      }

      if (onDisk.size < rows.length / 2) {
        throw new Error(
          `${source}: nur ${onDisk.size} Dokumente auf der Platte bei ${rows.length} DB-Seiten — Korpus nicht eingehängt? Abbruch.`
        );
      }

      const plan = selectOrphans(rows, onDisk, soll);
      const f = (n: number) => n.toLocaleString("de-AT");
      console.log(
        `${source}: ${f(plan.livePages)} aktive Seiten · ${f(plan.orphans.length)} nur in DB (weder Platte noch RIS-Soll)` +
          ` · ${f(plan.awaitingFetch)} warten auf Nachabruf (bleiben)` +
          ` · ${f(plan.dated)} datierte ältere Fassungen (bleiben) · ${f(plan.withoutDocId)} ohne doc_id (bleiben)`
      );
      checkSollPlausible({
        source,
        sollSize: soll.size,
        previousSollSize: typeof baseline[source] === "number" ? baseline[source]! : null,
        skippedSidecar: existsSync(`${indexPath}.skipped.json`),
        orphanCount: plan.orphans.length,
        livePages: plan.livePages,
        allowMass: values["allow-mass"] as boolean,
      });
      // Nur ein akzeptiertes Soll wird zur neuen Vergleichsbasis.
      writeFileSync(baselinePath, JSON.stringify({ ...baseline, [source]: soll.size }) + "\n");
      const entries = plan.orphans.map((o) => ({
        id: o.id,
        line: JSON.stringify({ run_id: runId, source_id: source, ...o }),
      }));

      if (APPLY) {
        await tombstoneWithInventory(engine, entries, inventory, 500, (done, total) => {
          if (done % 5000 === 0 || done === total)
            process.stderr.write(`  ${f(done)}/${f(total)}\r`);
        });
        process.stderr.write("\n");
      } else {
        inventory.append(entries.map((e) => e.line));
      }
    }
  } finally {
    inventory.close();
    await engine.disconnect();
  }

  if (inventory.lines > 0) {
    console.log(`Inventar: ${inventory.path} (${inventory.lines} Zeilen, Lauf ${runId})`);
  }
  console.log(APPLY ? "Angewendet (Soft-Delete)." : "TROCKENLAUF — mit --yes anwenden.");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
