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
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import {
  extractRisReferences,
  mapRisReference,
  stripHtml,
} from "../src/core/ingestion/connectors/legal-judgements.ts";
import { stripHtmlComplete } from "./backfill-utils";
import {
  buildMarkdown,
  decisionTypeOf,
  decisionFileName,
  isAlreadyOnDisk,
  loadExistingDocs,
  rememberOnDisk,
  type JudikaturDoc,
} from "./judikatur-file";
import { risMassPause, RIS_PAUSE_MS } from "./ris-pace";
import { COURT_CONFIGS, type CourtConfig } from "./ris-jud-courts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const MAX_RETRIES = 3;
// Retry backoff starts at the RIS pace, never below it: a retry is a request
// like any other and the 0.5 req/s ceiling applies to it too.
const RETRY_BASE_MS = RIS_PAUSE_MS;

/** Check if current time is within RIS-recommended off-hours (18:00–06:00 or weekend). */
function isRisOffHours(): boolean {
  const now = new Date();
  const cetHour = parseInt(
    now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
  );
  const day = now.toLocaleDateString("en-US", { timeZone: "Europe/Vienna", weekday: "short" });
  const isWeekend = day === "Sat" || day === "Sun";
  return isWeekend || cetHour < 8 || cetHour >= 18;
}

const _scriptDir = dirname(fileURLToPath(import.meta.url));
// Env first (corpus-paths.ts convention; the pipeline container sets
// LAW_CORPUS_ROOT=/law-corpus) — the ../../ fallback keeps bare checkouts
// working where law-corpus is a sibling of the repo.
export const CORPUS_ROOT =
  process.env.LAW_CORPUS_ROOT ??
  process.env.SUBSUMIO_LAW_CORPUS_DIR ??
  join(_scriptDir, "..", "..", "law-corpus");

// The court table lives in a leaf module (no network, no src/ imports) so
// corpus-pipeline.ts and the index crawler can share it without loading this
// script; re-exported here for callers that import it from the fetcher.
export { COURT_CONFIGS, type CourtConfig };

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries: number = MAX_RETRIES): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": getUserAgent() },
        signal: AbortSignal.timeout(30_000),
        ...proxyFetchOptions(),
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

export function extractHtmlUrl(ref: Record<string, unknown>): string {
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

/** Decode numeric and named HTML entities (same as backfill-corpus-text.ts). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** RIS OGD XML (risdok) → plain text. Same parser as backfill-corpus-text.ts. */
function risXmlToText(xml: string): string {
  const nutz = xml.match(/<nutzdaten>([\s\S]*?)<\/nutzdaten>/);
  if (!nutz) return "";
  let t = nutz[1];
  t = t.replace(/<kzinhalt[^>]*>[\s\S]*?<\/kzinhalt>/g, "");
  t = t.replace(/<fzinhalt[^>]*>[\s\S]*?<\/fzinhalt>/g, "");
  t = t.replace(/<ueberschrift[^>]*>([\s\S]*?)<\/ueberschrift>/g, "\n## $1\n");
  t = t.replace(/<absatz[^>]*>/g, "\n").replace(/<\/absatz>/g, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = decodeEntities(t);
  return t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Identity check: verify fetched text contains the document's case_number or ECLI.
 *  Same guard as backfill-corpus-text.ts — prevents silent mislabeling when RIS
 *  serves a generic/fallback page on 200 OK. */
function contentMatchesDocument(text: string, caseNum: string, ecli: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const normText = normalize(text);
  if (caseNum && normText.includes(normalize(caseNum))) return true;
  if (ecli && normText.includes(normalize(ecli))) return true;
  if (!caseNum && !ecli) return true; // can't verify — don't block
  return false;
}

/** What fetchRisFullText's attempts saw (see its `opts.diag`). */
export interface FullTextDiag {
  /** HTTP status of every completed attempt, in order. */
  statuses: number[];
  /** Attempts that threw (timeout, DNS, retries exhausted). */
  errors: number;
  /** 200 responses whose text was too short or did not match the document. */
  rejected: number;
}

export function newFullTextDiag(): FullTextDiag {
  return { statuses: [], errors: 0, rejected: 0 };
}

/** Why no text came back, in ris-fetch-outcomes.ts vocabulary. */
export function classifyNoText(diag: FullTextDiag): "not_found" | "no_text" | "failed" {
  if (diag.rejected > 0) return "no_text";
  if (diag.statuses.length > 0 && diag.errors === 0 && diag.statuses.every((s) => s === 404))
    return "not_found";
  return "failed";
}

/** Fetch full text for a RIS judikatur document using the same robust
 *  3-strategy approach as backfill-corpus-text.ts:
 *  1. Deterministic XML URL (structured nutzdaten, cleanest source)
 *  2. Deterministic HTML URL (noisier but still usable)
 *  3. API-provided HTML URL (from ContentReference, original approach)
 *
 *  Each candidate passes contentMatchesDocument() — no silent mislabeling.
 *  Returns empty string only if ALL strategies fail (placeholder will be written).
 *
 *  `opts.pause` runs before every strategy after the first, so a caller that
 *  must keep the RIS pace per request (not just per document) can pass
 *  risMassPause. `opts.diag` collects what each attempt saw, so the caller
 *  can tell "RIS has no such document" (all 404) from "RIS has it but
 *  without usable text" (a 200 that failed the checks) from a transport
 *  failure. Both are optional; fullScanCourt passes neither. */
export async function fetchRisFullText(
  htmlUrl: string,
  sourceUrl: string,
  caseNum: string,
  ecli: string,
  opts: { pause?: () => Promise<void>; diag?: FullTextDiag } = {}
): Promise<string> {
  let attempts = 0;
  const attempt = async (url: string, toText: (body: string) => string): Promise<string> => {
    if (attempts++ > 0 && opts.pause) await opts.pause();
    try {
      const res = await fetchWithRetry(url);
      opts.diag?.statuses.push(res.status);
      if (res.ok) {
        const candidate = toText(await res.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, caseNum, ecli)) {
          return candidate;
        }
        if (opts.diag) opts.diag.rejected++;
      }
    } catch {
      if (opts.diag) opts.diag.errors++;
    }
    return "";
  };
  // Extract Abfrage and DokNr from source_url for deterministic URLs.
  // Supports both API-style URLs (?Abfrage=X&Dokumentnummer=Y) and
  // direct document URLs (/Dokumente/{Abfrage}/{DokNr}/{DokNr}.html).
  let abfrage: string | null = null;
  let dokNr: string | null = null;

  const abfrageQuery = sourceUrl.match(/Abfrage=([^&]+)/);
  const dokNrQuery = sourceUrl.match(/Dokumentnummer=([^&]+)/);
  if (abfrageQuery && dokNrQuery) {
    abfrage = abfrageQuery[1];
    dokNr = dokNrQuery[1];
  } else {
    const pathMatch = sourceUrl.match(/\/Dokumente\/([^/]+)\/([^/]+)\//);
    if (pathMatch) {
      abfrage = pathMatch[1];
      dokNr = pathMatch[2];
    }
  }

  // Strategy 1: XML URL — structured, clean, most reliable.
  // XML has <ueberschrift typ="titel"> headers that risXmlToText converts
  // to ## headers, and NO sr-only duplicate text (that's only in HTML).
  if (abfrage && dokNr) {
    const xmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.xml`;
    const text = await attempt(xmlUrl, risXmlToText);
    if (text) return text;
  }

  // Strategy 2: Deterministic HTML URL.
  // Uses stripHtmlComplete (NOT the primitive stripHtml) which:
  //   - Converts <h1> to ## headers
  //   - Removes sr-only spans (duplicate spelled-out text)
  //   - Decodes all HTML entities properly
  if (abfrage && dokNr) {
    const directHtmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.html`;
    const text = await attempt(directHtmlUrl, stripHtmlComplete);
    if (text) return text;
  }

  // Strategy 3: API-provided HTML URL (original approach — least reliable)
  if (htmlUrl) {
    const text = await attempt(htmlUrl, stripHtmlComplete);
    if (text) return text;
  }

  return ""; // All strategies failed — placeholder will be written
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function countExistingFiles(outDir: string): number {
  if (!existsSync(outDir)) return 0;
  return readdirSync(outDir).filter((f) => f.endsWith(".md")).length;
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
  skipListPath: string | null
): Promise<{ fetched: number; written: number; skipped: number }> {
  const outDir = join(CORPUS_ROOT, court.outDir);
  mkdirSync(outDir, { recursive: true });

  // "Already have it" means: passed the normalizer's validator and sits in
  // _normalized/. A raw file the gate rejected (navigation HTML, screenreader
  // copy, placeholder) counts as missing and is fetched again from XML —
  // otherwise it would block its own repair forever. Every naming generation
  // is recognised (see judikatur-file.ts), so nothing valid is fetched twice.
  const existing = loadExistingDocs(join(CORPUS_ROOT, "_normalized", court.outDir));
  // --skip-list: newline-separated filename stems of files that exist on a
  // DIFFERENT machine (parallel-fetch setup: laptop fetches court A while the
  // server fetches court B — each needs the other's disk state without
  // downloading the files). Stems match fileKeys by construction
  // (decisionFileName = dokNr.toLowerCase()).
  if (skipListPath) {
    const lines = (await Bun.file(skipListPath).text())
      .split("\n")
      .map((l) => l.trim().replace(/\.md$/i, ""))
      .filter(Boolean);
    for (const key of lines) {
      existing.fileKeys.add(key);
      existing.undatedKeys.add(key.replace(/^\d{4}-\d{2}-\d{2}-/, ""));
    }
    console.log(`  skip-list: ${lines.length} remote-known files loaded from ${skipListPath}`);
  }
  const existingCount = existing.fileKeys.size;
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

        if (isAlreadyOnDisk(existing, id, item.url, fileKey, slugAz)) {
          totalSkipped++;
          yearSkipped++;
          continue;
        }
        rememberOnDisk(existing, id, item.url);
        totalFetched++;
        yearCount++;

        let fullText = "";
        if (!skipText) {
          const htmlUrl = extractHtmlUrl(ref);
          fullText = await fetchRisFullText(htmlUrl, item.url, item.az ?? "", item.ecli ?? "");
        }

        const doc: JudikaturDoc = {
          id,
          court: item.court,
          date: item.date,
          az: item.az ?? "",
          ecli: item.ecli,
          legalArea: item.legalArea,
          keywords: item.keywords,
          normen: item.normen ?? [],
          decisionType: decisionTypeOf(ref),
          text: fullText,
          url: item.url,
          title: item.title,
        };

        const filename = decisionFileName(id);
        const filepath = join(outDir, filename);
        writeFileSync(filepath, buildMarkdown(doc, courtKey), "utf-8");
        totalWritten++;

        if (totalWritten % 500 === 0) {
          console.log(`  [${totalWritten}] ${year} — ${doc.court} ${doc.az}`);
        }

        if (!skipText) await risMassPause("Judikatur-Abruf");
      }

      if (refs.length < 100) break;
      await risMassPause("Judikatur-Abruf");
    }

    if (yearCount > 0 || yearSkipped > 0) {
      console.log(`  ${year}: +${yearCount} new, ${yearSkipped} dupes (total: ${totalWritten})`);
    }
  }

  console.log(
    `\n  ${court.label} SUMMARY: ${totalWritten} written, ${totalSkipped} skipped, ${existingCount} pre-existing`
  );
  return { fetched: totalFetched, written: totalWritten, skipped: totalSkipped };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  // Global RIS lock — ensures no other RIS script runs simultaneously
  console.log("🔒 Acquiring RIS lock...");
  await acquireRisLock();
  console.log("✅ RIS lock acquired.");

  const args = process.argv.slice(2);
  // --source is the pipeline's trigger vocabulary (corpus-pipeline.ts maps
  // source_key → this script); --court is the manual CLI flag. Without the
  // alias a triggered single-court fetch silently falls back to "all".
  const courtIdx = args.indexOf("--court");
  const sourceIdx = args.indexOf("--source");
  const courtArg =
    courtIdx >= 0 ? args[courtIdx + 1] : sourceIdx >= 0 ? args[sourceIdx + 1] : "all";
  const fromIdx = args.indexOf("--from");
  const skipText = args.includes("--skip-text");
  const offHoursOnly = args.includes("--off-hours-only");
  const targetIdx = args.indexOf("--target");
  const targetOverride = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 0;
  const skipListIdx = args.indexOf("--skip-list");
  const skipListPath = skipListIdx >= 0 ? args[skipListIdx + 1] : null;

  // BKA requires large downloads outside business hours (18:00–06:00) or weekends.
  // If --off-hours-only is set and we're within business hours, wait.
  if (offHoursOnly && !isRisOffHours()) {
    const now = new Date();
    const cetHour = parseInt(
      now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
    );
    const waitHours = 18 - cetHour;
    console.log(`⏳ --off-hours-only: Currently ${cetHour}:00 CET (business hours).`);
    console.log(`   Waiting ${waitHours}h until 18:00 CET to comply with RIS OGD guidelines.`);
    console.log(`   See: https://www.ris.bka.gv.at/UI/Ogd.aspx`);
    while (!isRisOffHours()) {
      await new Promise((r) => setTimeout(r, 60_000)); // check every minute
    }
    console.log(`✅ Off-hours reached. Starting downloads.`);
  }

  console.log(`\n📋 RIS OGD Rate Limiting: ${RIS_PAUSE_MS}ms between requests, single connection`);
  console.log(`   Prior notification: ris.it@bka.gv.at (for mass downloads)\n`);

  const courtsToRun =
    courtArg === "all" ? Object.keys(COURT_CONFIGS) : courtArg.split(",").map((c) => c.trim());

  let grandWritten = 0;
  let grandSkipped = 0;

  for (const courtKey of courtsToRun) {
    const court = COURT_CONFIGS[courtKey];
    if (!court) {
      console.error(
        `Unknown court: ${courtKey}. Available: ${Object.keys(COURT_CONFIGS).join(", ")}`
      );
      continue;
    }

    const fromYear = fromIdx >= 0 ? parseInt(args[fromIdx + 1], 10) : court.defaultFrom;
    const target = targetOverride || court.knownTotal;

    const result = await fullScanCourt(courtKey, court, fromYear, skipText, target, skipListPath);
    grandWritten += result.written;
    grandSkipped += result.skipped;
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  GRAND TOTAL: ${grandWritten} written, ${grandSkipped} skipped`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`\nNext steps:`);
  console.log(`  1. Backfill text:  bun scripts/backfill-judikatur-text.ts --dir <outdir>`);
  console.log(
    `  2. Import to DB:   bun scripts/import-judikatur.ts --source <courtKey> --no-embed`
  );
  console.log(`  3. Embed:          bun scripts/embed-pending-at.ts --source <source_id>`);
}

// Guarded so fetch-jud-from-index.ts can import fetchRisFullText & co.
// without starting a full scan.
if (import.meta.main) {
  main()
    .then(() => {
      releaseRisLock();
    })
    .catch((err) => {
      console.error("Fatal:", err);
      releaseRisLock();
      process.exit(1);
    });
}
