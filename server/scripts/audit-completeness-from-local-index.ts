#!/usr/bin/env bun
/**
 * Feeds corpus_status.ris_total/completeness_pct from an already-downloaded
 * RIS in-force index (ris-inforce-crawl.ts / ris-inforce-crawl-landesrecht.ts
 * output) — no RIS connection needed, the index is local. Counts real norm
 * documents only (excludes "§ 0" cover sheets, same as
 * audit-completeness-vs-ris.ts), so it's directly comparable to a page count.
 *
 * Usage:
 *   bun run scripts/audit-completeness-from-local-index.ts --source law-at-normen --index /law-corpus/_state/ris-inforce.jsonl
 */

import { parseArgs } from "util";
import { existsSync, readFileSync } from "node:fs";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { upsertCompleteness } from "./corpus-status-db.ts";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string", default: "law-at-normen" },
      index: { type: "string", default: "/law-corpus/_state/ris-inforce.jsonl" },
    },
    allowPositionals: false,
  });
  const source = values.source as string;
  const indexPath = values.index as string;
  if (!existsSync(indexPath)) {
    console.error(`Index fehlt: ${indexPath}`);
    process.exit(1);
  }

  let risTotal = 0;
  for (const line of readFileSync(indexPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let d: { nor?: string; apa?: string | null };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (!d.nor || d.apa === "§ 0") continue;
    risTotal++;
  }

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);
  try {
    const dbRows = (await engine.executeRaw(
      `SELECT count(*) AS n FROM pages WHERE deleted_at IS NULL AND source_id = $1`,
      [source]
    )) as Array<{ n: string }>;
    const dbPages = Number(dbRows[0]?.n ?? 0);
    await upsertCompleteness(engine, { sourceId: source, docClass: "statute", dbPages, risTotal });
    console.log(
      `${source}: RIS-Index ${risTotal.toLocaleString("de-AT")} Dokumente, DB ${dbPages.toLocaleString("de-AT")} Seiten, ${((dbPages / risTotal) * 100).toFixed(1)}%`
    );
  } finally {
    await engine.disconnect();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
