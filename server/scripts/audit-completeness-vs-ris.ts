#!/usr/bin/env bun
/**
 * The repeatable version of the 2026-09-21 manual audit: per-Gesetz
 * completeness against a local RIS in-force index, and — of the complete
 * laws — how much of their text already carries a vector.
 *
 * Works for both corpora, because both now have an index built the same
 * way (ris-inforce-crawl.ts for Bundesrecht, ris-inforce-crawl-landesrecht.ts
 * for Landesrecht): a JSONL with one line per currently-valid document,
 * `nor` (document id) and `gnr` (statute number) on every line.
 *
 * "Vollständig" here means one specific, falsifiable thing: every document
 * RIS currently lists as in force for that Gesetzesnummer exists as a live
 * page in the database, keyed by the same document id — not that the text
 * is correct (verify-text-against-ris-xml.ts answers that, for whichever
 * documents have their original XML on disk) and not that its metadata
 * matches (sync-federal-metadata-from-ris.ts / sync-landesrecht-metadata-
 * from-ris.ts close that gap, using the same index).
 *
 * Usage:
 *   bun run scripts/audit-completeness-vs-ris.ts --source law-at-normen \
 *     --index /law-corpus/_state/ris-inforce.jsonl --embedding-column embedding_qwen
 *   bun run scripts/audit-completeness-vs-ris.ts --source law-at-landesrecht \
 *     --index /law-corpus/_state/ris-inforce-landesrecht.jsonl
 */

import { parseArgs } from "util";
import { existsSync, readFileSync } from "node:fs";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: "string", default: "law-at-normen" },
    index: { type: "string", default: "/law-corpus/_state/ris-inforce.jsonl" },
    "embedding-column": { type: "string", default: "embedding_qwen" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(
    "Usage: audit-completeness-vs-ris.ts --source <id> --index <jsonl> [--embedding-column embedding_qwen]"
  );
  process.exit(0);
}

process.env.GBRAIN_STATEMENT_TIMEOUT = "20min";
const SOURCE = values.source as string;
const COLUMN = values["embedding-column"] as string;
if (!/^[a-z_][a-z0-9_]*$/.test(COLUMN)) {
  console.error(`Spaltenname unzulässig: ${COLUMN}`);
  process.exit(1);
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

const n = (v: unknown) => Number(v ?? 0).toLocaleString("de-AT");

async function main() {
  const indexPath = values.index as string;
  if (!existsSync(indexPath)) {
    console.error(`Index fehlt: ${indexPath}`);
    process.exit(1);
  }

  // gnr → set of in-force document ids RIS lists for it, § 0 cover sheets
  // excluded — they carry no norm text and would make every law with one
  // look permanently "incomplete".
  const byGnr = new Map<string, Set<string>>();
  for (const line of readFileSync(indexPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let d: { nor?: string; gnr?: string; apa?: string | null };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (!d.nor || !d.gnr || d.apa === "§ 0") continue;
    const set = byGnr.get(d.gnr) ?? new Set<string>();
    set.add(d.nor);
    byGnr.set(d.gnr, set);
  }
  console.log(
    `RIS-Index: ${n(byGnr.size)} Gesetze, ${n([...byGnr.values()].reduce((a, s) => a + s.size, 0))} Dokumente`
  );

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const rows = (await engine.executeRaw(
    `SELECT p.id, p.frontmatter->>'doc_id' AS nor, p.frontmatter->>'statute_id' AS gnr,
            (SELECT count(*) FROM content_chunks c WHERE c.page_id = p.id) AS chunks,
            (SELECT count(*) FROM content_chunks c WHERE c.page_id = p.id AND c."${COLUMN}" IS NOT NULL) AS embedded
       FROM pages p
      WHERE p.deleted_at IS NULL AND p.source_id = $1 AND p.frontmatter->>'doc_id' IS NOT NULL`,
    [SOURCE]
  )) as Array<{ id: number; nor: string; gnr: string | null; chunks: string; embedded: string }>;

  const byNor = new Map(rows.map((r) => [r.nor, r]));
  const byGnrDb = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.gnr) continue;
    const list = byGnrDb.get(r.gnr) ?? [];
    list.push(r);
    byGnrDb.set(r.gnr, list);
  }

  let complete = 0;
  let partial = 0;
  let missing = 0;
  let completeFullyEmbedded = 0;
  let completePartlyEmbedded = 0;
  let completeNotEmbedded = 0;
  let chunksInComplete = 0;
  let chunksEmbeddedInComplete = 0;

  for (const [gnr, wanted] of byGnr) {
    const have = [...wanted].filter((nor) => byNor.has(nor)).length;
    if (have === wanted.size) {
      complete++;
      const pages = byGnrDb.get(gnr) ?? [];
      const totalChunks = pages.reduce((a, p) => a + Number(p.chunks), 0);
      const embeddedChunks = pages.reduce((a, p) => a + Number(p.embedded), 0);
      chunksInComplete += totalChunks;
      chunksEmbeddedInComplete += embeddedChunks;
      if (totalChunks === 0) continue;
      if (embeddedChunks === totalChunks) completeFullyEmbedded++;
      else if (embeddedChunks > 0) completePartlyEmbedded++;
      else completeNotEmbedded++;
    } else if (have > 0) {
      partial++;
    } else {
      missing++;
    }
  }

  console.log(`\n═══ Vollständigkeit (${SOURCE}) ═══`);
  console.log(`  Gesetze mit Normtext im Index: ${n(byGnr.size)}`);
  console.log(`  100 % vollständig in der DB:   ${n(complete)}`);
  console.log(`  teilweise:                     ${n(partial)}`);
  console.log(`  fehlen ganz:                   ${n(missing)}`);

  console.log(`\n═══ Von den vollständigen Gesetzen: Einbettung in "${COLUMN}" ═══`);
  console.log(`  komplett eingebettet:  ${n(completeFullyEmbedded)}`);
  console.log(`  teilweise eingebettet: ${n(completePartlyEmbedded)}`);
  console.log(`  noch gar nicht:        ${n(completeNotEmbedded)}`);
  console.log(`  Chunks gesamt:         ${n(chunksInComplete)}`);
  console.log(`  Chunks mit Vektor:     ${n(chunksEmbeddedInComplete)}`);

  await engine.disconnect();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
