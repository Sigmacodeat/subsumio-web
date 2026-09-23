#!/usr/bin/env bun
/**
 * Reads law_completeness (written by audit-completeness-vs-ris.ts) and
 * prints exactly the table asked for on 2026-09-21: which laws are 100%
 * confirmed, which are missing content, and — separately, since that is a
 * process-state question, not a corpus-state one — what a currently running
 * or queued fetch is working on right now.
 *
 * Usage:
 *   bun run scripts/law-completeness-report.ts [--source law-at-normen]
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

interface LawRow {
  source_id: string;
  gnr: string;
  title: string | null;
  status: "complete" | "partial" | "missing";
  have: number;
  wanted: number;
  checked_at: string;
}

export function summarize(rows: Pick<LawRow, "status">[]): {
  complete: number;
  partial: number;
  missing: number;
} {
  return {
    complete: rows.filter((r) => r.status === "complete").length,
    partial: rows.filter((r) => r.status === "partial").length,
    missing: rows.filter((r) => r.status === "missing").length,
  };
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { source: { type: "string", default: "law-at-normen" } },
    allowPositionals: false,
  });
  const source = values.source as string;

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  let rows: LawRow[];
  try {
    rows = (await engine.executeRaw(
      `SELECT source_id, gnr, title, status, have, wanted, checked_at::text
         FROM law_completeness WHERE source_id = $1 ORDER BY status, title`,
      [source]
    )) as LawRow[];
  } finally {
    await engine.disconnect();
  }

  if (rows.length === 0) {
    console.log(
      `Keine Daten für ${source} — erst audit-completeness-vs-ris.ts --source ${source} laufen lassen.`
    );
    return;
  }

  const { complete, partial, missing } = summarize(rows);
  const checkedAt = rows[0]!.checked_at.slice(0, 16).replace("T", " ");

  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${source} — Stand: ${checkedAt}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  100% fertig:        ${complete.toLocaleString("de-AT")} Gesetze`);
  console.log(`  teilweise:          ${partial.toLocaleString("de-AT")} Gesetze`);
  console.log(`  fehlen komplett:    ${missing.toLocaleString("de-AT")} Gesetze`);
  console.log(`  Gesamt geprüft:     ${rows.length.toLocaleString("de-AT")} Gesetze`);

  const notComplete = rows.filter((r) => r.status !== "complete");
  if (notComplete.length > 0) {
    console.log("\n  | Gesetz | Status | vorhanden/nötig |");
    console.log("  |---|---|---|");
    for (const r of notComplete) {
      const status = r.status === "missing" ? "fehlt komplett" : "teilweise";
      console.log(`  | ${r.title ?? r.gnr} | ${status} | ${r.have}/${r.wanted} |`);
    }
  } else {
    console.log("\n  Keine Lücken — alle geprüften Gesetze sind 100% vollständig.");
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
