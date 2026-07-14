#!/usr/bin/env bun
/**
 * FULL SCAN — Fetch ALL Austrian court decisions from RIS-OGD API.
 *
 * Unlike ingest-at-judikatur.ts (which uses norm-based search), this script
 * paginates through EVERY decision year-by-year without any Suchworte filter.
 * This guarantees maximum coverage — every published decision is fetched.
 *
 * Strategy:
 *   Phase 1: Fast metadata scan (--skip-text) — 100 docs/page, year-by-year
 *   Phase 2: Parallel text backfill via backfill-judikatur-text.ts
 *   Phase 3: Import into database via import-judikatur.ts
 *
 * Usage:
 *   bun scripts/fetch-all-at-judikatur.ts --court vwgh --from 1990 --skip-text
 *   bun scripts/fetch-all-at-judikatur.ts --court all --skip-text
 *
 * RIS-OGD API: https://data.bka.gv.at/ris/api/v2.6/judikatur
 * No auth required (public OGD).
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";
import {
  extractRisReferences,
  mapRisReference,
  stripHtml,
} from "../src/core/ingestion/connectors/legal-judgements.ts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const RATE_LIMIT_MS = 150;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = join(_scriptDir, "..", "..", "law-corpus");

interface CourtConfig {
  applikation: string;
  outDir: string;
  label: string;
  defaultFrom: number;
  knownTotal: number;
}

const COURT_CONFIGS: Record<string, CourtConfig> = {
  ogh:    { applikation: "Justiz",  outDir: "at-judikatur",         label: "OGH",    defaultFrom: 2000, knownTotal: 58326 },
  vwgh:   { applikation: "Vwgh",    outDir: "at-judikatur-vwgh",    label: "VwGH",   defaultFrom: 1990, knownTotal: 248840 },
  vfgh:   { applikation: "Vfgh",    outDir: "at-judikatur-vfgh",    label: "VfGH",   defaultFrom: 1980, knownTotal: 17806 },
  bvwg:   { applikation: "Bvwg",    outDir: "at-judikatur-bvwg",    label: "BVwG",   defaultFrom: 2014, knownTotal: 287209 },
  lvwg:   { applikation: "Lvwg",    outDir: "at-judikatur-lvwg",    label: "LVwG",   defaultFrom: 2014, knownTotal: 76154 },
  asylgh: { applikation: "AsylGH",  outDir: "at-judikatur-asylgh",  label: "AsylGH", defaultFrom: 2008, knownTotal: 53113 },
  uvs:    { applikation: "Uvs",     outDir: "at-judikatur-uvs",     label: "UVS",    defaultFrom: 1991, knownTotal: 25939 },
};

interface JudikaturDoc {
  id: string;
  court: string;
  date: string;
  az: string;
  ecli?: string;
  legalArea: string;
  keywords: string[];
  text: string;
  url: string;
  title: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

function extractHtmlUrl(ref: Record<string, unknown>): string {
  const data = (ref.Data ?? {}) as Record<string, unknown>;
  const dl = (data.Dokumentliste ?? {}) as Record<string, unknown>;
  const cr = (dl.ContentReference ?? {}) as Record<string, unknown>;
  const urls = cr.Urls as Record<string, unknown> | undefined;
  if (!urls) return "";
  const contentUrl = urls.ContentUrl;
  if (!contentUrl) return "";
  const urlArr = Array.isArray(contentUrl) ? contentUrl : [contentUrl];
  for (const u of urlArr) {
    const du = u as Record<string, unknown>;
    if (du.DataType === "Html") return String(du.Url ?? "");
  }
  if (urlArr.length > 0) {
    const first = urlArr[0] as Record<string, unknown>;
    return String(first.Url ?? "");
  }
  return "";
}

async function fetchRisFullText(htmlUrl: string): Promise<string> {
  if (!htmlUrl) return "";
  try {
    const res = await fetchWithRetry(htmlUrl);
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return "";
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function buildMarkdown(doc: JudikaturDoc, courtKey: string): string {
  const title = `${doc.court} — ${doc.az || "Entscheidung"}`;
  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "at",
      court_type: courtKey,
      title,
      court: doc.court,
      date: doc.date,
      decision_date: doc.date,
      ecli: doc.ecli ?? "",
      case_number: doc.az,
      legal_area: doc.legalArea,
      keywords: doc.keywords,
      source: "ris-ogd",
      source_url: doc.url,
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  const text = doc.text || "*Volltext nicht abrufbar — siehe Quelle.*";

  return `---
${frontmatter}
---

# ${title}

${text}

---
*Quelle: [RIS-OGD](${doc.url})*
`;
}

function countExistingFiles(outDir: string): number {
  if (!existsSync(outDir)) return 0;
  return readdirSync(outDir).filter((f) => f.endsWith(".md")).length;
}

function loadExistingIds(outDir: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(outDir)) return ids;
  for (const file of readdirSync(outDir)) {
    if (!file.endsWith(".md")) continue;
    // Extract ID from filename: YYYY-MM-DD-slug.md → use full filename as dedup key
    ids.add(file.replace(".md", ""));
  }
  return ids;
}

// ── Fetch total hits from API ──────────────────────────────────────────

async function fetchTotalHits(applikation: string, dateFrom: string): Promise<number> {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", "1");
  url.searchParams.set("EntscheidungsdatumVon", dateFrom);
  try {
    const res = await fetchWithRetry(url.toString());
    if (!res.ok) return 0;
    const data = (await res.json()) as Record<string, unknown>;
    const hits = (data.OgdSearchResult as any)?.OgdDocumentResults?.Hits?.["#text"];
    return parseInt(hits, 10) || 0;
  } catch {
    return 0;
  }
}

// ── Full scan for one court ────────────────────────────────────────────

async function fullScanCourt(
  courtKey: string,
  court: CourtConfig,
  fromYear: number,
  skipText: boolean,
  target: number,
): Promise<{ fetched: number; written: number; skipped: number }> {
  const outDir = join(CORPUS_ROOT, court.outDir);
  mkdirSync(outDir, { recursive: true });

  const existingIds = loadExistingIds(outDir);
  const existingCount = existingIds.size;
  const toYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = toYear; y >= fromYear; y--) years.push(y);

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${court.label} — Full Scan`);
  console.log(`  Existing: ${existingCount} files | API total: ~${court.knownTotal}`);
  console.log(`  Date range: ${fromYear}→${toYear} (${years.length} years)`);
  console.log(`  Target: ${target} | Skip text: ${skipText}`);
  console.log(`  Output: ${outDir}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;

  for (const year of years) {
    if (totalFetched >= target) break;

    const yearFrom = `${year}-01-01`;
    const yearTo = `${year}-12-31`;
    let yearCount = 0;
    let yearSkipped = 0;

    for (let page = 1; page <= 5000; page++) {
      if (totalFetched >= target) break;

      const url = new URL(`${RIS_BASE}/judikatur`);
      url.searchParams.set("Applikation", court.applikation);
      url.searchParams.set("DokumenteProSeite", "OneHundred");
      url.searchParams.set("Seitennummer", String(page));
      url.searchParams.set("EntscheidungsdatumVon", yearFrom);
      url.searchParams.set("EntscheidungsdatumBis", yearTo);

      let refs: Array<Record<string, unknown>>;
      try {
        const res = await fetchWithRetry(url.toString());
        if (!res.ok) {
          console.error(`  ${year} page ${page}: HTTP ${res.status}`);
          break;
        }
        const data = (await res.json()) as Record<string, unknown>;
        refs = extractRisReferences(data);
      } catch (err) {
        console.error(`  ${year} page ${page} failed: ${err}`);
        break;
      }
      if (refs.length === 0) break;

      for (const ref of refs) {
        if (totalFetched >= target) break;
        const item = mapRisReference(ref, new Date());
        if (!item) continue;

        const id = item.id.replace(/^ris-/, "");
        const slugDate = item.date.split("T")[0];
        const slugAz = slugify(item.az || id);
        const fileKey = `${slugDate}-${slugAz}`;

        if (existingIds.has(fileKey)) {
          totalSkipped++;
          yearSkipped++;
          continue;
        }
        existingIds.add(fileKey);
        totalFetched++;
        yearCount++;

        let fullText = "";
        if (!skipText) {
          const htmlUrl = extractHtmlUrl(ref);
          fullText = await fetchRisFullText(htmlUrl);
        }

        const doc: JudikaturDoc = {
          id,
          court: item.court,
          date: item.date,
          az: item.az ?? "",
          ecli: item.ecli,
          legalArea: item.legalArea,
          keywords: item.keywords,
          text: fullText,
          url: item.url,
          title: item.title,
        };

        const filename = `${fileKey}.md`;
        const filepath = join(outDir, filename);
        writeFileSync(filepath, buildMarkdown(doc, courtKey), "utf-8");
        totalWritten++;

        if (totalWritten % 500 === 0) {
          console.log(`  [${totalWritten}] ${year} — ${doc.court} ${doc.az}`);
        }

        if (!skipText) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    if (yearCount > 0 || yearSkipped > 0) {
      console.log(`  ${year}: +${yearCount} new, ${yearSkipped} dupes (total: ${totalWritten})`);
    }
  }

  console.log(`\n  ${court.label} SUMMARY: ${totalWritten} written, ${totalSkipped} skipped, ${existingCount} pre-existing`);
  return { fetched: totalFetched, written: totalWritten, skipped: totalSkipped };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const courtIdx = args.indexOf("--court");
  const courtArg = courtIdx >= 0 ? args[courtIdx + 1] : "all";
  const fromIdx = args.indexOf("--from");
  const skipText = args.includes("--skip-text");
  const targetIdx = args.indexOf("--target");
  const targetOverride = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 0;

  const courtsToRun = courtArg === "all"
    ? Object.keys(COURT_CONFIGS)
    : courtArg.split(",").map((c) => c.trim());

  let grandWritten = 0;
  let grandSkipped = 0;

  for (const courtKey of courtsToRun) {
    const court = COURT_CONFIGS[courtKey];
    if (!court) {
      console.error(`Unknown court: ${courtKey}. Available: ${Object.keys(COURT_CONFIGS).join(", ")}`);
      continue;
    }

    const fromYear = fromIdx >= 0 ? parseInt(args[fromIdx + 1], 10) : court.defaultFrom;
    const target = targetOverride || court.knownTotal;

    const result = await fullScanCourt(courtKey, court, fromYear, skipText, target);
    grandWritten += result.written;
    grandSkipped += result.skipped;
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  GRAND TOTAL: ${grandWritten} written, ${grandSkipped} skipped`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`\nNext steps:`);
  console.log(`  1. Backfill text:  bun scripts/backfill-judikatur-text.ts --dir <outdir>`);
  console.log(`  2. Import to DB:   bun scripts/import-judikatur.ts --source <courtKey> --no-embed`);
  console.log(`  3. Embed:          bun scripts/embed-pending-at.ts --source <source_id>`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
