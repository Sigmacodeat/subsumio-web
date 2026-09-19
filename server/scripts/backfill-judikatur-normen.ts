#!/usr/bin/env bun
/**
 * Adds the cited norms (RIS "Normen") and the decision type to every decision
 * on disk that lacks them — raw files and their canonical copies.
 *
 * Metadata only: one RIS search page carries 100 decisions, so the whole
 * VwGH (≈357 000 documents) needs ≈3 600 requests instead of 357 000. Body
 * text is never touched. The corpus pipeline notices the changed files and
 * re-imports them into the pages they already have (matched by doc_id).
 *
 *   bun scripts/backfill-judikatur-normen.ts --court vwgh
 *   bun scripts/backfill-judikatur-normen.ts --court all --from 1900
 *   bun scripts/backfill-judikatur-normen.ts --court ogh --dry-run
 *
 * RIS OGD rules: one connection, 1–2 s between requests (ris-lock + delay).
 * Resumable: finished court/year pairs are recorded in the state file.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { getUserAgent, proxyFetchOptions } from "./ris-proxy";
import {
  extractRisReferences,
  mapRisReference,
} from "../src/core/ingestion/connectors/legal-judgements.ts";
import {
  decisionTypeOf,
  dokumentnummerOf,
  hasCitedNorms,
  patchCanonicalNormen,
  patchRawNormen,
} from "./judikatur-file";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";

/** court key → RIS Applikation and corpus directory (same as fetch-all-at-judikatur.ts). */
const COURTS: Record<string, { applikation: string; dir: string }> = {
  ogh: { applikation: "Justiz", dir: "at-judikatur" },
  vwgh: { applikation: "Vwgh", dir: "at-judikatur-vwgh" },
  vfgh: { applikation: "Vfgh", dir: "at-judikatur-vfgh" },
  bvwg: { applikation: "Bvwg", dir: "at-judikatur-bvwg" },
  lvwg: { applikation: "Lvwg", dir: "at-judikatur-lvwg" },
  asylgh: { applikation: "AsylGH", dir: "at-judikatur-asylgh" },
  uvs: { applikation: "Uvs", dir: "at-judikatur-uvs" },
  dsk: { applikation: "Dsk", dir: "at-judikatur-dsk" },
  gbk: { applikation: "Gbk", dir: "at-judikatur-gbk" },
  pvak: { applikation: "Pvak", dir: "at-judikatur-pvak" },
  dok: { applikation: "Dok", dir: "at-judikatur-dok" },
  ubas: { applikation: "Ubas", dir: "at-judikatur-ubas" },
  umse: { applikation: "Umse", dir: "at-judikatur-umse" },
};

const args = process.argv.slice(2);
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const DRY = args.includes("--dry-run");
const FROM = parseInt(arg("--from") ?? "1900", 10);
const courtArg = arg("--court") ?? "all";
const ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const STATE = join(ROOT, "_normalized", "_state", "backfill-judikatur-normen.json");

function politeDelayMs(): number {
  const now = new Date();
  const hour = parseInt(
    now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
  );
  const day = now.toLocaleDateString("en-US", { timeZone: "Europe/Vienna", weekday: "short" });
  const business = day !== "Sat" && day !== "Sun" && hour >= 8 && hour < 18;
  return business ? 2000 : 1000;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function risPage(
  applikation: string,
  year: number,
  page: number
): Promise<Array<Record<string, unknown>> | null> {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", String(page));
  url.searchParams.set("EntscheidungsdatumVon", `${year}-01-01`);
  url.searchParams.set("EntscheidungsdatumBis", `${year}-12-31`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": getUserAgent() },
        signal: AbortSignal.timeout(60_000),
        ...proxyFetchOptions(),
      });
      if (res.ok) return extractRisReferences((await res.json()) as Record<string, unknown>);
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      /* retry */
    }
    await sleep(2000 * 2 ** attempt);
  }
  return null;
}

/** doc id → files (raw + canonical) that still lack cited norms. */
function indexMissing(dir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const base of [join(ROOT, dir), join(ROOT, "_normalized", dir)]) {
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base)) {
      if (!f.endsWith(".md")) continue;
      const path = join(base, f);
      let head: string;
      try {
        head = readFileSync(path, "utf8").slice(0, 6000);
      } catch {
        continue;
      }
      if (hasCitedNorms(head)) continue;
      const docId =
        head.match(/^doc_id:\s*["']?([^"'\s]+)/m)?.[1] ??
        dokumentnummerOf(head.match(/^source_url:\s*["']?([^\s"']+)/m)?.[1] ?? "");
      if (!docId || docId === "null") continue;
      const list = out.get(docId) ?? [];
      list.push(path);
      out.set(docId, list);
    }
  }
  return out;
}

function writeAtomic(path: string, content: string) {
  const tmp = `${path}.tmp-normen`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

async function main() {
  const courts = courtArg === "all" ? Object.keys(COURTS) : courtArg.split(",");
  const state: Record<string, number[]> = existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, "utf8"))
    : {};
  const thisYear = new Date().getFullYear();

  await acquireRisLock();
  try {
    for (const court of courts) {
      const cfg = COURTS[court];
      if (!cfg) throw new Error(`Unbekanntes Gericht: ${court}`);
      const missing = indexMissing(cfg.dir);
      console.log(`\n=== ${court}: ${missing.size} Dokumente ohne zitierte Normen auf der Platte`);
      if (missing.size === 0) continue;
      let patched = 0;
      let noNormsAtRis = 0;
      let requests = 0;
      const done = new Set(state[court] ?? []);

      for (let year = thisYear; year >= FROM; year--) {
        if (done.has(year) || missing.size === 0) continue;
        for (let page = 1; page <= 5000; page++) {
          const refs = await risPage(cfg.applikation, year, page);
          requests++;
          await sleep(politeDelayMs());
          if (!refs || refs.length === 0) break;
          for (const ref of refs) {
            const item = mapRisReference(ref, new Date());
            if (!item) continue;
            const ids = [item.id.replace(/^ris-/, ""), dokumentnummerOf(item.url)].filter(
              Boolean
            ) as string[];
            const paths = ids.flatMap((id) => missing.get(id) ?? []);
            if (paths.length === 0) continue;
            const normen = item.normen ?? [];
            if (normen.length === 0) {
              noNormsAtRis++;
              for (const id of ids) missing.delete(id);
              continue;
            }
            const art = decisionTypeOf(ref);
            for (const p of paths) {
              const before = readFileSync(p, "utf8");
              const isCanonical = /^schema_version:/m.test(before.slice(0, 400));
              const after = isCanonical
                ? patchCanonicalNormen(before, normen, art)
                : patchRawNormen(before, normen, art);
              if (after !== before) {
                if (!DRY) writeAtomic(p, after);
                patched++;
              }
            }
            for (const id of ids) missing.delete(id);
          }
          if (refs.length < 100) break;
        }
        done.add(year);
        state[court] = [...done];
        if (!DRY) {
          mkdirSync(dirname(STATE), { recursive: true });
          writeFileSync(STATE, JSON.stringify(state));
        }
        console.log(
          `  ${court} ${year}: ${patched} Dateien ergänzt, ${noNormsAtRis} ohne Normen im RIS, ${missing.size} offen, ${requests} Anfragen`
        );
      }
      console.log(
        `=== ${court} fertig: ${patched} Dateien ergänzt, ${noNormsAtRis} ohne Normen im RIS, ${missing.size} im RIS nicht gefunden`
      );
    }
  } finally {
    releaseRisLock();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  releaseRisLock();
  process.exit(1);
});
