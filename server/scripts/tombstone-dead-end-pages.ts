#!/usr/bin/env bun
/**
 * Soft-deletes pages whose plausibility issue means RIS genuinely has
 * nothing more to give — re-fetching can never fix them, unlike every
 * other issue category audit-plausibility-full.ts finds:
 *
 *   - body:kein_rechtssatz — RIS's own administrative marker "Kein RS."
 *     ("no legal principle recorded for this decision"). Zero legal
 *     content, zero retrieval value, and there is no fuller version to
 *     fetch instead — this IS the complete RIS record.
 *   - body:image_only / body:meta_dump_only — RIS holds only a scanned
 *     image or a bare metadata table for these, never usable text.
 *
 * Deliberately NOT included, because they ARE fixable and a fetch/repair
 * is already planned or running: generation:known_bad (needs the queued
 * XML re-fetch), schema:legacy_frontmatter / schema:no_identity (the
 * cursor fix already reprocesses these), body:letterhead / pdf_pagebreak
 * (real decision text with a scraping artifact — a repair, not a delete),
 * body:no_content_section / ris_prefix / screenreader_copy (the raw text
 * was never fully fetched — backfill-judikatur-text.ts's job, not this
 * script's).
 *
 * Soft-delete only (deleted_at = now()), matching purge-tombstoned-
 * pages.ts's own two-stage pattern — invisible to search/embedding
 * immediately, reversible, and a real hard purge stays that script's own
 * separate, deliberate decision. Writes an inventory (slug, title, doc_id)
 * before touching anything, same reasoning as that script: what was
 * removed should stay answerable later.
 *
 * The inventory line of a page is appended to the file BEFORE its UPDATE
 * runs, so a crash mid-run never leaves a tombstone without a record. The
 * default location is under the corpus root ($LAW_CORPUS_ROOT/_state),
 * which is writable in the corpus-pipeline container (/data is read-only
 * there).
 *
 * Usage:
 *   bun run scripts/tombstone-dead-end-pages.ts --source law-at-judikatur-vwgh
 *   bun run scripts/tombstone-dead-end-pages.ts --source law-at-judikatur-vwgh --yes
 */

import { parseArgs } from "util";
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { assessPage, DOC_CLASS_OF_SOURCE, type PageRow } from "./audit-plausibility-full.ts";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

/** The only issue codes this script ever acts on — see file header for why. */
export const DEAD_END_CODES = new Set([
  "body:kein_rechtssatz",
  "body:image_only",
  "body:meta_dump_only",
]);

/**
 * A page is safe to tombstone only when EVERY issue on it is a dead-end
 * one — a page with a fixable issue alongside stays out of reach even if
 * it also happens to match a dead-end code, so a partially-repairable page
 * never gets swept up by an unrelated genuine dead-end.
 */
export function isDeadEndOnly(issues: string[]): boolean {
  return issues.length > 0 && issues.every((i) => DEAD_END_CODES.has(i));
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

interface DbRow extends PageRow {
  slug: string;
  title: string | null;
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      yes: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "inventory-out": { type: "string" },
    },
    allowPositionals: false,
  });
  const APPLY = (values.yes as boolean) && !(values["dry-run"] as boolean);
  const sources = values.source ? [values.source as string] : Object.keys(DOC_CLASS_OF_SOURCE);
  const inventoryOut =
    (values["inventory-out"] as string | undefined) ??
    join(
      process.env.LAW_CORPUS_ROOT ?? "/law-corpus",
      "_state",
      `tombstone-dead-end-inventory-${new Date().toISOString().slice(0, 10)}.jsonl`
    );
  // Fail before touching the database if the inventory cannot be written.
  mkdirSync(dirname(inventoryOut), { recursive: true });
  writeFileSync(inventoryOut, "");

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const PAGE_SIZE = 2000;
  const inventoryLines: string[] = [];
  let totalPages = 0;

  try {
    for (const source of sources) {
      const docClass = DOC_CLASS_OF_SOURCE[source]!;
      let lastId = 0;
      let sourcePages = 0;

      for (;;) {
        const batch = (await engine.executeRaw(
          `SELECT p.id, p.slug, p.title, p.frontmatter, p.compiled_truth
             FROM pages p
            WHERE p.deleted_at IS NULL AND p.source_id = $1 AND p.id > $2
            ORDER BY p.id
            LIMIT $3`,
          [source, lastId, PAGE_SIZE]
        )) as DbRow[];
        if (batch.length === 0) break;

        for (const row of batch) {
          const verdict = assessPage(row, docClass);
          if (!isDeadEndOnly(verdict.issues)) continue;

          sourcePages++;
          const line = JSON.stringify({
            source_id: source,
            page_id: row.id,
            slug: row.slug,
            title: row.title,
            doc_id: row.frontmatter?.["doc_id"] ?? row.frontmatter?.["nor_id"] ?? null,
            issues: verdict.issues,
          });
          inventoryLines.push(line);
          appendFileSync(inventoryOut, line + "\n");
          if (APPLY) {
            await engine.executeRaw(`UPDATE pages SET deleted_at = now() WHERE id = $1`, [row.id]);
          }
        }
        lastId = batch[batch.length - 1]!.id;
      }

      if (sourcePages > 0) {
        console.log(
          `${source}: ${sourcePages.toLocaleString("de-AT")} Seiten ${APPLY ? "tombstoniert" : "würden tombstoniert"}`
        );
      }
      totalPages += sourcePages;
    }
  } finally {
    await engine.disconnect();
  }

  console.log(`Inventar geschrieben: ${inventoryOut} (${inventoryLines.length} Zeilen)`);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(
    `  ${APPLY ? "" : "TROCKENLAUF — "}Gesamt: ${totalPages.toLocaleString("de-AT")} Seiten ${APPLY ? "tombstoniert" : "würden tombstoniert"}`
  );
  console.log("═══════════════════════════════════════════════════════════");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
