#!/usr/bin/env bun
/**
 * Lists the RIS document numbers of every database page the plausibility
 * audit rejects — optionally only for one reason — as the input for a
 * targeted repair (refetch by id list, print-artifact cleanup).
 *
 * Read-only. Uses the audit's own verdict (assessPage in
 * audit-plausibility-full.ts), so "rejected" here is exactly what the
 * dashboard's corpus_status.issue_breakdown counts — no second rule set.
 *
 * Usage:
 *   bun scripts/list-rejected-pages.ts --source law-at-landesrecht --reason generation:known_bad
 *   bun scripts/list-rejected-pages.ts --source law-at-avn --reason body:letterhead --out /law-corpus/_state/x.txt
 *
 * Default output: $LAW_CORPUS_ROOT/_state/rejected-<source>-<reason>.txt
 * (one doc_id per line, sorted). Pages without any document number are only
 * counted — they cannot be refetched by id.
 */

import { parseArgs } from "util";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assessPage, DOC_CLASS_OF_SOURCE, type PageRow } from "./audit-plausibility-full.ts";
import type { DocClass } from "./normalize/canonical-schema.ts";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

/** The RIS document number a page carries, in the order the importers write it. */
export function docIdOfPage(fm: Record<string, unknown> | null): string | null {
  for (const k of ["doc_id", "nor_id", "document_id"]) {
    const v = fm?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export interface RejectedTally {
  /** doc_ids of matching pages (may contain repeats across batches — dedupe at the end). */
  ids: string[];
  /** Matching pages without a document number. */
  withoutId: number;
  /** Matching pages in total. */
  matched: number;
  /** Every issue on the matching pages, counted (a page can carry several). */
  issues: Record<string, number>;
}

export function emptyTally(): RejectedTally {
  return { ids: [], withoutId: 0, matched: 0, issues: {} };
}

/**
 * Pure: adds the pages the audit rejects (for `reason`, or for any reason
 * when it is omitted) to `tally`.
 */
export function tallyRejected(
  rows: PageRow[],
  docClass: DocClass,
  reason: string | undefined,
  tally: RejectedTally = emptyTally()
): RejectedTally {
  for (const row of rows) {
    const verdict = assessPage(row, docClass);
    if (verdict.ok) continue;
    if (reason && !verdict.issues.includes(reason)) continue;
    tally.matched++;
    for (const i of verdict.issues) tally.issues[i] = (tally.issues[i] ?? 0) + 1;
    const id = docIdOfPage(row.frontmatter);
    if (id) tally.ids.push(id);
    else tally.withoutId++;
  }
  return tally;
}

/** `<root>/_state/rejected-<source>-<reason>.txt`; ":" becomes "-" so the name is portable. */
export function rejectedListPath(root: string, source: string, reason?: string): string {
  const r = (reason ?? "all").replace(/[^A-Za-z0-9_-]+/g, "-");
  return join(root, "_state", `rejected-${source}-${r}.txt`);
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      reason: { type: "string" },
      out: { type: "string" },
    },
    allowPositionals: false,
  });
  const source = values.source as string | undefined;
  if (!source || !DOC_CLASS_OF_SOURCE[source]) {
    console.error(
      `--source <id> erforderlich, eine von: ${Object.keys(DOC_CLASS_OF_SOURCE).join(", ")}`
    );
    process.exit(2);
  }
  const reason = values.reason as string | undefined;
  const docClass = DOC_CLASS_OF_SOURCE[source]!;
  const root = process.env.LAW_CORPUS_ROOT ?? "/law-corpus";
  const outPath = (values.out as string | undefined) ?? rejectedListPath(root, source, reason);

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const PAGE_SIZE = 2000;
  const tally = emptyTally();
  let scanned = 0;
  try {
    let lastId = 0;
    for (;;) {
      const batch = (await engine.executeRaw(
        `SELECT p.id, p.frontmatter, p.compiled_truth
           FROM pages p
          WHERE p.deleted_at IS NULL AND p.source_id = $1 AND p.id > $2
          ORDER BY p.id
          LIMIT $3`,
        [source, lastId, PAGE_SIZE]
      )) as PageRow[];
      if (batch.length === 0) break;
      scanned += batch.length;
      tallyRejected(batch, docClass, reason, tally);
      lastId = batch[batch.length - 1]!.id;
    }
  } finally {
    await engine.disconnect();
  }

  const ids = [...new Set(tally.ids)].sort();
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp.${process.pid}`;
  writeFileSync(tmp, ids.length > 0 ? ids.join("\n") + "\n" : "");
  renameSync(tmp, outPath);

  console.log(`Quelle:            ${source} (${docClass})`);
  console.log(`Grund:             ${reason ?? "alle"}`);
  console.log(`Seiten geprüft:    ${scanned.toLocaleString("de-AT")}`);
  console.log(`Seiten betroffen:  ${tally.matched.toLocaleString("de-AT")}`);
  console.log(`Dokumentnummern:   ${ids.length.toLocaleString("de-AT")} (eindeutig)`);
  console.log(
    `ohne Nummer:       ${tally.withoutId.toLocaleString("de-AT")} (nicht per Id nachholbar)`
  );
  if (Object.keys(tally.issues).length > 0) {
    console.log(`Befunde auf diesen Seiten:`);
    for (const [k, n] of Object.entries(tally.issues).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(30)} ${n.toLocaleString("de-AT")}`);
    }
  }
  console.log(`Liste:             ${outPath}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
