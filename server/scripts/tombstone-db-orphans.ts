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
 * decision. Writes an inventory before touching anything. Updates run in
 * small id batches — one large UPDATE with cascading work held locks for
 * hours on 2026-09-24 and stalled every import.
 *
 * Refuses to run when the disk scan looks broken (fewer documents on disk
 * than half the DB's), so an unmounted corpus can never empty the DB.
 *
 * Usage:
 *   bun run scripts/tombstone-db-orphans.ts                       # dry run, both sources
 *   bun run scripts/tombstone-db-orphans.ts --source law-at-landesrecht --yes
 */

import { parseArgs } from "util";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { INDEX_OF, loadIndexIds, scanNormalized } from "./corpus-sync-inventory.ts";

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

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      yes: { type: "boolean", default: false },
      root: { type: "string", default: process.env.LAW_CORPUS_ROOT ?? "/law-corpus" },
      "inventory-out": { type: "string", default: "/law-corpus/_state/tombstone-db-orphans.jsonl" },
    },
    allowPositionals: false,
  });
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

  const inventory: string[] = [];
  try {
    for (const source of sources) {
      const corpus = SOURCES[source]!;
      const indexPath = join(root, "_state", INDEX_OF[corpus]!);
      if (!existsSync(indexPath)) throw new Error(`RIS-Index fehlt: ${indexPath}`);
      const soll = loadIndexIds(indexPath);
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
      for (const o of plan.orphans) inventory.push(JSON.stringify({ source_id: source, ...o }));

      if (APPLY) {
        const ids = plan.orphans.map((o) => o.id);
        for (let i = 0; i < ids.length; i += 500) {
          await engine.executeRaw(
            `UPDATE pages SET deleted_at = now() WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
            [ids.slice(i, i + 500)]
          );
          if ((i / 500) % 10 === 0)
            process.stderr.write(`  ${f(Math.min(i + 500, ids.length))}/${f(ids.length)}\r`);
        }
        process.stderr.write("\n");
      }
    }
  } finally {
    await engine.disconnect();
  }

  if (inventory.length > 0) {
    writeFileSync(values["inventory-out"] as string, inventory.join("\n") + "\n");
    console.log(`Inventar: ${values["inventory-out"]} (${inventory.length} Zeilen)`);
  }
  console.log(APPLY ? "Angewendet (Soft-Delete)." : "TROCKENLAUF — mit --yes anwenden.");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
