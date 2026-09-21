#!/usr/bin/env bun
/**
 * Judikatur completeness — the audit that never existed. Bundesrecht and
 * Landesrecht both get a per-document RIS index to compare against
 * (ris-inforce-crawl.ts / ris-inforce-crawl-landesrecht.ts,
 * audit-completeness-vs-ris.ts); Judikatur never got the equivalent, so
 * ~410,000 pages across 13 courts sat unaudited — neither their count nor
 * their text ever checked against the source.
 *
 * This is the cheap first half of that: one live RIS total-hits query per
 * court (13 requests total, ~30s of RIS time under the OGD pace) compared
 * against our own page count per source. It proves completeness at the
 * COUNT level, not yet the per-document or per-word level — that needs a
 * full document-id index crawl (paginating every court, the same shape as
 * ris-inforce-crawl.ts), which for a court the size of BVwG or VwGH is many
 * hours of RIS time and deserves its own scheduling decision, not a
 * side effect of a count check.
 *
 * Usage:
 *   bun run scripts/judikatur-completeness-check.ts
 *   bun run scripts/judikatur-completeness-check.ts --court vwgh,bvwg
 */

import { parseArgs } from "util";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { risPause, RIS_USER_AGENT } from "./ris-pace";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { upsertCompleteness } from "./corpus-status-db.ts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";

export interface CourtConfig {
  applikation: string;
  sourceId: string;
  label: string;
}

/** Applikation values verified against scripts/fetch-all-at-judikatur.ts (the live fetcher's own config) so the two never drift apart. */
export const COURTS: Record<string, CourtConfig> = {
  ogh: { applikation: "Justiz", sourceId: "law-at-judikatur", label: "OGH" },
  vwgh: { applikation: "Vwgh", sourceId: "law-at-judikatur-vwgh", label: "VwGH" },
  vfgh: { applikation: "Vfgh", sourceId: "law-at-judikatur-vfgh", label: "VfGH" },
  bvwg: { applikation: "Bvwg", sourceId: "law-at-judikatur-bvwg", label: "BVwG" },
  lvwg: { applikation: "Lvwg", sourceId: "law-at-judikatur-lvwg", label: "LVwG" },
  asylgh: { applikation: "AsylGH", sourceId: "law-at-judikatur-asylgh", label: "AsylGH" },
  uvs: { applikation: "Uvs", sourceId: "law-at-judikatur-uvs", label: "UVS" },
  dsk: { applikation: "Dsk", sourceId: "law-at-judikatur-dsk", label: "DSB" },
  gbk: { applikation: "Gbk", sourceId: "law-at-judikatur-gbk", label: "GBK" },
  pvak: { applikation: "Pvak", sourceId: "law-at-judikatur-pvak", label: "PVAK" },
  dok: { applikation: "Dok", sourceId: "law-at-judikatur-dok", label: "DOK" },
  ubas: { applikation: "Ubas", sourceId: "law-at-judikatur-ubas", label: "UBAS" },
  umse: { applikation: "Umse", sourceId: "law-at-judikatur-umse", label: "UmSE" },
};

/** Pulled out of the RIS OGD judikatur search response — pure, so it's testable without a live request. */
export function parseHits(data: unknown): number {
  const hits = (data as any)?.OgdSearchResult?.OgdDocumentResults?.Hits?.["#text"];
  const n = parseInt(hits, 10);
  return Number.isFinite(n) ? n : 0;
}

/** One court's completeness row, as percent + gap — pure, so the arithmetic is testable without touching RIS or the DB. */
export function completenessRow(risTotal: number, dbCount: number): { pct: number; gap: number } {
  const pct = risTotal > 0 ? (dbCount / risTotal) * 100 : dbCount > 0 ? 0 : 100;
  return { pct: Math.round(pct * 10) / 10, gap: risTotal - dbCount };
}

async function fetchTotalHits(applikation: string): Promise<number> {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", "1");
  // No EntscheidungsdatumVon — the unfiltered total is the actual audit
  // target; a date floor would silently exclude whatever predates it.
  const res = await fetch(url, { headers: { "User-Agent": RIS_USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for Applikation=${applikation}`);
  return parseHits(await res.json());
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { court: { type: "string" } },
    allowPositionals: false,
  });
  const wanted = values.court ? (values.court as string).split(",") : Object.keys(COURTS);
  const unknown = wanted.filter((k) => !COURTS[k]);
  if (unknown.length > 0) {
    console.error(
      `Unbekannte Gerichte: ${unknown.join(", ")}. Bekannt: ${Object.keys(COURTS).join(", ")}`
    );
    process.exit(1);
  }

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  console.log("RIS-Sperre anfordern (wartet, falls belegt)...");
  await acquireRisLock();
  console.log("Sperre erhalten — frage 13 Gerichte einzeln ab, 2s Pause dazwischen.\n");

  const rows: Array<{
    key: string;
    label: string;
    risTotal: number;
    dbCount: number;
    pct: number;
    gap: number;
  }> = [];
  try {
    for (const key of wanted) {
      const court = COURTS[key];
      let risTotal: number;
      try {
        risTotal = await fetchTotalHits(court.applikation);
      } catch (e) {
        console.error(
          `  ! ${court.label}: RIS-Anfrage fehlgeschlagen — ${e instanceof Error ? e.message : e}`
        );
        await risPause();
        continue;
      }
      const dbRows = (await engine.executeRaw(
        `SELECT count(*) AS n FROM pages WHERE deleted_at IS NULL AND source_id = $1`,
        [court.sourceId]
      )) as Array<{ n: string }>;
      const dbCount = Number(dbRows[0]?.n ?? 0);
      const { pct, gap } = completenessRow(risTotal, dbCount);
      rows.push({ key, label: court.label, risTotal, dbCount, pct, gap });
      await upsertCompleteness(engine, {
        sourceId: court.sourceId,
        docClass: "decision",
        dbPages: dbCount,
        risTotal,
      });
      console.log(
        `  ${court.label.padEnd(8)} RIS: ${String(risTotal).padStart(8)}  DB: ${String(dbCount).padStart(8)}  ${String(pct).padStart(6)}%  Lücke: ${gap}`
      );
      await risPause();
    }
  } finally {
    releaseRisLock();
    await engine.disconnect();
  }

  const totalRis = rows.reduce((a, r) => a + r.risTotal, 0);
  const totalDb = rows.reduce((a, r) => a + r.dbCount, 0);
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(
    `  Gesamt: RIS ${totalRis.toLocaleString("de-AT")}  DB ${totalDb.toLocaleString("de-AT")}  (${completenessRow(totalRis, totalDb).pct}%)`
  );
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    "\nHinweis: das ist ein Zählabgleich (Vollständigkeit), keine Wort-für-Wort-Prüfung."
  );
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    releaseRisLock();
    process.exit(1);
  });
}
