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
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import {
  extractRisReferences,
  mapRisReference,
  stripHtml,
} from "../src/core/ingestion/connectors/legal-judgements.ts";
import { stripHtmlComplete } from "./backfill-utils";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

/**
 * RIS OGD rate limiting — COMPLIANT with BKA guidelines.
 *
 * BKA requires:
 *   - 1–2 seconds between API page requests
 *   - Single connection (no parallel requests)
 *   - Large downloads outside business hours (18:00–06:00) or weekends
 *   - Prior notification to ris.it@bka.gv.at for mass downloads
 *
 * See: https://www.ris.bka.gv.at/UI/Ogd.aspx
 *
 * Business hours: Mon–Fri 08:00–18:00 CET → 2000ms (conservative)
 * Off-hours / weekends → 1000ms (still within 1-2s range)
 */
function politeDelayMs(): number {
  const now = new Date();
  const cetHour = parseInt(
    now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
  );
  const day = now.toLocaleDateString("en-US", { timeZone: "Europe/Vienna", weekday: "short" });
  const isWeekend = day === "Sat" || day === "Sun";
  const isBusinessHours = !isWeekend && cetHour >= 8 && cetHour < 18;
  return isBusinessHours ? 2000 : 1000;
}

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
const CORPUS_ROOT = join(_scriptDir, "..", "..", "law-corpus");

interface CourtConfig {
  applikation: string;
  outDir: string;
  label: string;
  defaultFrom: number;
  knownTotal: number;
}

const COURT_CONFIGS: Record<string, CourtConfig> = {
  ogh: {
    applikation: "Justiz",
    outDir: "at-judikatur",
    label: "OGH",
    defaultFrom: 2000,
    knownTotal: 58326,
  },
  vwgh: {
    applikation: "Vwgh",
    outDir: "at-judikatur-vwgh",
    label: "VwGH",
    defaultFrom: 1990,
    knownTotal: 248840,
  },
  vfgh: {
    applikation: "Vfgh",
    outDir: "at-judikatur-vfgh",
    label: "VfGH",
    defaultFrom: 1980,
    knownTotal: 17806,
  },
  bvwg: {
    applikation: "Bvwg",
    outDir: "at-judikatur-bvwg",
    label: "BVwG",
    defaultFrom: 2014,
    knownTotal: 287209,
  },
  lvwg: {
    applikation: "Lvwg",
    outDir: "at-judikatur-lvwg",
    label: "LVwG",
    defaultFrom: 2014,
    knownTotal: 76154,
  },
  asylgh: {
    applikation: "AsylGH",
    outDir: "at-judikatur-asylgh",
    label: "AsylGH",
    defaultFrom: 2008,
    knownTotal: 53113,
  },
  uvs: {
    applikation: "Uvs",
    outDir: "at-judikatur-uvs",
    label: "UVS",
    defaultFrom: 1991,
    knownTotal: 25939,
  },
  dsk: {
    applikation: "Dsk",
    outDir: "at-judikatur-dsk",
    label: "DSB",
    defaultFrom: 2010,
    knownTotal: 5000,
  },
  gbk: {
    applikation: "Gbk",
    outDir: "at-judikatur-gbk",
    label: "GBK",
    defaultFrom: 2004,
    knownTotal: 500,
  },
  pvak: {
    applikation: "Pvak",
    outDir: "at-judikatur-pvak",
    label: "PVAK",
    defaultFrom: 2002,
    knownTotal: 2000,
  },
  dok: {
    applikation: "Dok",
    outDir: "at-judikatur-dok",
    label: "DOK",
    defaultFrom: 2000,
    knownTotal: 3000,
  },
  ubas: {
    applikation: "Ubas",
    outDir: "at-judikatur-ubas",
    label: "UBAS",
    defaultFrom: 2000,
    knownTotal: 4052,
  },
  umse: {
    applikation: "Umse",
    outDir: "at-judikatur-umse",
    label: "UmSE",
    defaultFrom: 2001,
    knownTotal: 742,
  },
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

/** Fetch full text for a RIS judikatur document using the same robust
 *  3-strategy approach as backfill-corpus-text.ts:
 *  1. Deterministic XML URL (structured nutzdaten, cleanest source)
 *  2. Deterministic HTML URL (noisier but still usable)
 *  3. API-provided HTML URL (from ContentReference, original approach)
 *
 *  Each candidate passes contentMatchesDocument() — no silent mislabeling.
 *  Returns empty string only if ALL strategies fail (placeholder will be written). */
async function fetchRisFullText(
  htmlUrl: string,
  sourceUrl: string,
  caseNum: string,
  ecli: string
): Promise<string> {
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
    try {
      const res = await fetchWithRetry(xmlUrl);
      if (res.ok) {
        const candidate = risXmlToText(await res.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, caseNum, ecli)) {
          return candidate;
        }
      }
    } catch {
      /* try next */
    }
  }

  // Strategy 2: Deterministic HTML URL.
  // Uses stripHtmlComplete (NOT the primitive stripHtml) which:
  //   - Converts <h1> to ## headers
  //   - Removes sr-only spans (duplicate spelled-out text)
  //   - Decodes all HTML entities properly
  if (abfrage && dokNr) {
    const directHtmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.html`;
    try {
      const res = await fetchWithRetry(directHtmlUrl);
      if (res.ok) {
        const candidate = stripHtmlComplete(await res.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, caseNum, ecli)) {
          return candidate;
        }
      }
    } catch {
      /* try next */
    }
  }

  // Strategy 3: API-provided HTML URL (original approach — least reliable)
  if (htmlUrl) {
    try {
      const res = await fetchWithRetry(htmlUrl);
      if (res.ok) {
        const candidate = stripHtmlComplete(await res.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, caseNum, ecli)) {
          return candidate;
        }
      }
    } catch {
      /* all strategies failed */
    }
  }

  return ""; // All strategies failed — placeholder will be written
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
  target: number
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

        if (!skipText) await new Promise((r) => setTimeout(r, politeDelayMs()));
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, politeDelayMs()));
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
  const courtIdx = args.indexOf("--court");
  const courtArg = courtIdx >= 0 ? args[courtIdx + 1] : "all";
  const fromIdx = args.indexOf("--from");
  const skipText = args.includes("--skip-text");
  const offHoursOnly = args.includes("--off-hours-only");
  const targetIdx = args.indexOf("--target");
  const targetOverride = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 0;

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

  console.log(
    `\n📋 RIS OGD Rate Limiting: ${politeDelayMs()}ms between requests, single connection`
  );
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

    const result = await fullScanCourt(courtKey, court, fromYear, skipText, target);
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

main()
  .then(() => {
    releaseRisLock();
  })
  .catch((err) => {
    console.error("Fatal:", err);
    releaseRisLock();
    process.exit(1);
  });
