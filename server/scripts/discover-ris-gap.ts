#!/usr/bin/env bun
/**
 * Discover RIS Judikatur Gap
 *
 * Problem: We have ~280k files on disk but RIS has ~1M+ decisions.
 * ~637k decisions are missing entirely (never fetched).
 *
 * This script scans the RIS OGD API for ALL decisions per court,
 * compares with existing files on disk, and creates placeholder .md
 * files (with frontmatter but no text) for the missing ones.
 *
 * Placeholders are then backfilled by the regular backfill pipeline.
 *
 * RIS OGD compliance: single connection, 1500ms delay, off-hours preferred.
 *
 * Usage:
 *   bun scripts/discover-ris-gap.ts --court ogh
 *   bun scripts/discover-ris-gap.ts --court vwgh --from-year 2020
 *   bun scripts/discover-ris-gap.ts --court all --dry-run
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const DELAY_MS = 1500; // RIS OGD: 1.5s between requests

const args = process.argv.slice(2);
const courtIdx = args.indexOf("--court");
const courtArg = courtIdx >= 0 ? args[courtIdx + 1] : "all";
const fromYearIdx = args.indexOf("--from-year");
const fromYearArg = fromYearIdx >= 0 ? parseInt(args[fromYearIdx + 1], 10) : 0;
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limitArg = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

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
    knownTotal: 138432,
  },
  vwgh: {
    applikation: "Vwgh",
    outDir: "at-judikatur-vwgh",
    label: "VwGH",
    defaultFrom: 1990,
    knownTotal: 356331,
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
    knownTotal: 287321,
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
};

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function loadExistingKeys(outDir: string): Set<string> {
  const keys = new Set<string>();
  if (!existsSync(outDir)) return keys;
  for (const f of readdirSync(outDir)) {
    if (f.endsWith(".md")) keys.add(f.replace(".md", ""));
  }
  return keys;
}

interface RisDocRef {
  dokNr: string;
  geschaeftszahl: string;
  ecli: string;
  datum: string;
  gericht: string;
  rechtsgebiet: string;
  schlagworte: string;
  url: string;
}

function extractReferences(data: Record<string, unknown>): RisDocRef[] {
  const refs: RisDocRef[] = [];
  const docs = (data.OgdSearchResult as any)?.OgdDocumentResults?.OgdDocumentReference;
  if (!docs) return refs;
  const arr = Array.isArray(docs) ? docs : [docs];
  for (const d of arr) {
    const data2 = d.Data ?? {};
    const metadata = data2.Metadaten ?? {};
    const jurAbs = metadata.JuristischeAbsicherung ?? {};
    const techn = d.Technisch ?? {};
    const urls = (data2.Dokumentliste ?? {}).ContentReference?.Urls?.ContentUrl;
    let htmlUrl = "";
    if (urls) {
      const urlArr = Array.isArray(urls) ? urls : [urls];
      for (const u of urlArr) {
        if (u.DataType === "Html") {
          htmlUrl = u.Url;
          break;
        }
      }
    }
    refs.push({
      dokNr: techn.Dokumentnummer ?? "",
      geschaeftszahl: jurAbs.Geschaeftszahl ?? "",
      ecli: jurAbs.ECLI ?? "",
      datum: jurAbs.Entscheidungsdatum ?? techn.Datum ?? "",
      gericht: jurAbs.Gericht ?? "",
      rechtsgebiet: jurAbs.Rechtsgebiet ?? "",
      schlagworte: jurAbs.Schlagworte ?? "",
      url:
        htmlUrl ||
        `https://www.ris.bka.gv.at/Dokumente/${jurAbs.Applikation ?? "Justiz"}/${techn.Dokumentnummer ?? ""}/${techn.Dokumentnummer ?? ""}.html`,
    });
  }
  return refs;
}

function buildPlaceholderMarkdown(ref: RisDocRef, courtKey: string): string {
  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "at",
      court_type: courtKey,
      title: `${ref.gericht} — ${ref.geschaeftszahl || "Entscheidung"}`,
      court: ref.gericht,
      date: ref.datum,
      decision_date: ref.datum,
      ecli: ref.ecli,
      case_number: ref.geschaeftszahl,
      legal_area: ref.rechtsgebiet,
      keywords: ref.schlagworte,
      source: "ris-ogd",
      source_url: ref.url,
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  return `---\n${frontmatter}\n---\n\n# ${ref.gericht} — ${ref.geschaeftszahl || "Entscheidung"}\n\n*Volltext nicht abrufbar — siehe Quelle.*\n\n---\n*Quelle: [RIS-OGD](${ref.url})*\n`;
}

// ── Scan one court ─────────────────────────────────────────────────────

async function scanCourt(courtKey: string, court: CourtConfig): Promise<void> {
  const outDir = join(CORPUS_ROOT, court.outDir);
  mkdirSync(outDir, { recursive: true });
  const existingKeys = loadExistingKeys(outDir);

  const fromYear = fromYearArg || court.defaultFrom;
  const toYear = new Date().getFullYear();

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${court.label} — Discovery Gap Scan`);
  console.log(`  Existing: ${existingKeys.size} files | API total: ~${court.knownTotal}`);
  console.log(`  Date range: ${fromYear}→${toYear}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  let totalApi = 0;
  let totalNew = 0;
  let totalDupes = 0;
  let totalMissing = 0;

  for (let year = toYear; year >= fromYear; year--) {
    let yearApi = 0;
    let yearNew = 0;

    for (let page = 1; page <= 5000; page++) {
      const url = new URL(`${RIS_BASE}/judikatur`);
      url.searchParams.set("Applikation", court.applikation);
      url.searchParams.set("DokumenteProSeite", "OneHundred");
      url.searchParams.set("Seitennummer", String(page));
      url.searchParams.set("EntscheidungsdatumVon", `${year}-01-01`);
      url.searchParams.set("EntscheidungsdatumBis", `${year}-12-31`);

      let refs: RisDocRef[];
      try {
        const res = await fetchWithRetry(url.toString());
        if (!res.ok) {
          console.error(`  ${year} page ${page}: HTTP ${res.status}`);
          break;
        }
        const data = (await res.json()) as Record<string, unknown>;
        refs = extractReferences(data);
      } catch (err) {
        console.error(`  ${year} page ${page} failed: ${err}`);
        break;
      }
      if (refs.length === 0) break;

      for (const ref of refs) {
        totalApi++;
        yearApi++;

        const slugDate = ref.datum.split("T")[0] || `${year}-01-01`;
        const slugAz = slugify(ref.geschaeftszahl || ref.dokNr || `unknown-${totalApi}`);
        const fileKey = `${slugDate}-${slugAz}`;

        if (existingKeys.has(fileKey)) {
          totalDupes++;
          continue;
        }
        existingKeys.add(fileKey);
        totalNew++;
        yearNew++;
        totalMissing++;

        if (!dryRun) {
          const filename = `${fileKey}.md`;
          writeFileSync(join(outDir, filename), buildPlaceholderMarkdown(ref, courtKey), "utf-8");
        }

        if (limitArg > 0 && totalNew >= limitArg) {
          console.log(`  Limit reached (${limitArg}) — stopping.`);
          console.log(
            `\n  ${court.label} SUMMARY: ${totalNew} new placeholders, ${totalDupes} dupes, ${totalApi} API results`
          );
          return;
        }
      }

      if (totalNew % 500 === 0 && totalNew > 0) {
        console.log(`  [${totalApi}] ${year} — new: ${totalNew}, dupes: ${totalDupes}`);
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    if (yearApi > 0) {
      console.log(
        `  ${year}: ${yearApi} in API, ${yearNew} new, ${yearApi - yearNew} dupes (total new: ${totalNew})`
      );
    }
  }

  console.log(
    `\n  ${court.label} SUMMARY: ${totalNew} new placeholders, ${totalDupes} dupes, ${totalApi} API results`
  );
  console.log(`  Disk after: ${existingKeys.size} files`);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const courts = courtArg === "all" ? Object.keys(COURT_CONFIGS) : [courtArg];

  for (const key of courts) {
    const config = COURT_CONFIGS[key];
    if (!config) {
      console.error(`Unknown court: ${key}. Available: ${Object.keys(COURT_CONFIGS).join(", ")}`);
      continue;
    }
    await scanCourt(key, config);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
