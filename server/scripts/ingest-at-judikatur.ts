/**
 * Bulk import of Austrian court decisions from RIS-OGD API.
 *
 * Supports three court types via --court flag:
 *   ogh  (default) — OGH Zivilrecht + Strafrecht, Applikation=Justiz
 *   vfgh            — Verfassungsgerichtshof, Applikation=Vfgh
 *   vwgh            — Verwaltungsgerichtshof, Applikation=Vwgh
 *
 * Norm-prioritized fetch strategy: searches by each of the 83 AT law
 * abbreviations as Suchworte, filtered to the last 15 years, to surface
 * decisions that reference our statute inventory. Rate-limited with
 * token-bucket + exponential backoff (BaseConnector pattern).
 *
 *   bun scripts/ingest-at-judikatur.ts [--court ogh|vfgh|vwgh] [--target 5000] [--out DIR]
 *
 * RIS-OGD API: https://data.bka.gv.at/ris/api/v2.6/judikatur
 * No auth required (public OGD).
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";
import {
  extractRisReferences,
  mapRisReference,
  stripHtml,
} from "../src/core/ingestion/connectors/legal-judgements.ts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const DEFAULT_TARGET = 8000;
const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

interface CourtConfig {
  applikation: string;
  outDir: string;
  label: string;
}

const COURT_CONFIGS: Record<string, CourtConfig> = {
  ogh: { applikation: "Justiz", outDir: "at-judikatur", label: "OGH" },
  vfgh: { applikation: "Vfgh", outDir: "at-judikatur-vfgh", label: "VfGH" },
  vwgh: { applikation: "Vwgh", outDir: "at-judikatur-vwgh", label: "VwGH" },
};

/** RIS Norm abbreviations for the 83 AT laws in our corpus.
 *  Used as Suchworte to prioritize decisions referencing our statute inventory.
 *  Mapped from law-corpus/at/*.md filenames → RIS convention. */
const NORM_SEARCH_TERMS: string[] = [
  "ABGB", "AHG", "AktG", "ALVG", "AMG", "AngG", "ArbVG", "ARG",
  "ASVG", "AsylG", "AußStrG", "AufenthG", "AuslBG", "AVG", "AVRAG",
  "AWG", "AZG", "B-VG", "BAO", "BBG", "BDG", "BewG", "BRAG",
  "BuAG", "BVerGG", "ChemG", "DSG", "E-GovG", "ECG", "EheG",
  "Eiwog", "EO", "EPG", "EstG", "ForstG", "FPG", "GebG", "GewO",
  "GlBG", "GmbHG", "GOG", "GRestG", "GukG", "GWG", "IO", "JGG",
  "JN", "KAG", "KartG", "KSchG", "KStG", "MedienG", "MRG", "MSchG",
  "N-G", "PatG", "PStG", "RAO", "SMG", "SPG", "StBG", "StGB",
  "StPO", "StRegG", "StVO", "TilgG", "TKG", "TschG", "UGB", "UrhG",
  "UStG", "UWG", "VBVG", "VKGG", "VStG", "VVG", "WaffG", "WEG",
  "WRG", "ZPO", "ZustG",
];

/** Topic-based search queries for broader coverage (OGH only). */
const TOPIC_QUERIES: string[] = [
  "Amtshaftung", "Schadensersatz", "Vertragsrecht", "Sachbeschädigung",
  "Betrug", "Körperverletzung", "Zivilverfahren", "Exekution",
  "Kündigung", "Datenschutz", "Gesellschaftsrecht", "Erbrecht",
  "Familienrecht", "Mietrecht", "Insolvenz", "Wettbewerbsrecht",
  "Eigentum", "Herausgabe", "Unterhalt", "Sorgerecht",
  "Kaufvertrag", "Werkvertrag", "Schadensersatzpflicht", "Fahrlässigkeit",
  "Verjährung", "Rücktritt", "Anfechtung", "Stellvertretung",
  "Bankrecht", "Versicherungsrecht", "Arbeitsrecht", "Urheberrecht",
  // Expanded OGH-specific topics
  "Einstweilige Verfügung", "Schiedsgericht", "Schadensersatzanspruch",
  "Gewährleistungsanspruch", "Klagsabweisung", "Berufungsentscheidung",
  "Revisionsentscheidung", "Kostenersatz", "Zinsen",
  "Sachlegitimation", "Rechtsweg", "Unzulässigkeit",
  "Beweiswürdigung", "Beweisantrag", "Parteienverkehr",
  "Grundbuch", "Eigentumsvorbehalt", "Pfandrecht",
  "Schadensersatzhaftung", "Vertretungsmacht", "Vollmacht",
  "Nichtigkeit", "Rechtsmissbrauch", "Treu und Glauben",
  "Kaufgewährleistung", "Mangel", "Lieferungsverzug",
  "Werkstörung", "Baumangel", "Kündigungsgrund",
  "Fristsetzung", "Nachfrist", "Rücktrittsrecht",
  "Schadensersatz wegen Verzugs", "Nichterfüllung",
  "Deliktsfähigkeit", "Verschulden", "Kausalität",
  "Adäquanz", "Schutzzweckzusammenhang", "Rechtswidrigkeit",
]

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
        console.warn(`  ⚠ HTTP ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`  ⚠ Fetch error, retrying in ${backoff}ms: ${lastErr.message}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

async function fetchRisSearch(
  query: string,
  page: number,
  applikation: string,
  dateFrom?: string,
  dateTo?: string
): Promise<Array<Record<string, unknown>>> {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("Suchworte", query);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", String(page));
  if (dateFrom) url.searchParams.set("EntscheidungsdatumVon", dateFrom);
  if (dateTo) url.searchParams.set("EntscheidungsdatumBis", dateTo);

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) throw new Error(`RIS-OGD HTTP ${res.status} for query "${query}"`);
  const data = (await res.json()) as Record<string, unknown>;
  return extractRisReferences(data);
}

/** Extract the HTML content URL from a RIS search result's Dokumentliste. */
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
  // Fallback: first URL
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

function buildMarkdown(doc: JudikaturDoc, courtKey: string = "ogh"): string {
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

async function main() {
  const args = process.argv.slice(2);
  const courtIdx = args.indexOf("--court");
  const courtKey = courtIdx >= 0 ? args[courtIdx + 1] : "ogh";
  const court = COURT_CONFIGS[courtKey];
  if (!court) {
    console.error(`Unknown court: ${courtKey}. Use ogh, vfgh, or vwgh.`);
    process.exit(1);
  }

  const outDirIdx = args.indexOf("--out");
  const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : join(import.meta.dir, "..", "law-corpus", court.outDir);
  const targetIdx = args.indexOf("--target");
  const target = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : (courtKey === "ogh" ? DEFAULT_TARGET : 200);
  const dateFromIdx = args.indexOf("--from");
  const dateFrom = dateFromIdx >= 0 ? args[dateFromIdx + 1] : "2005-01-01";
  const skipText = args.includes("--skip-text");

  mkdirSync(outDir, { recursive: true });

  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();

  const searchTerms = courtKey === "ogh" ? NORM_SEARCH_TERMS : NORM_SEARCH_TERMS.slice(0, 40);

  // Year-by-year slicing: break the date range into yearly buckets so each
  // norm×year search returns a smaller, deeper result set. This bypasses
  // any soft API result caps and surfaces older decisions that pagination
  // alone would miss at scale.
  const fromYear = parseInt(dateFrom.substring(0, 4), 10) || 2008;
  const toYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = toYear; y >= fromYear; y--) years.push(y);

  // Per-norm cap removed — we now scan all years per norm. The global target
  // is the only ceiling. High-volume norms (ABGB, StGB, ZPO) will naturally
  // contribute more decisions.
  const perNormYearLimit = courtKey === "ogh" ? 200 : 50;

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Subsumio — ${court.label} Judikatur Bulk Import`);
  console.log(`  Target: ≥${target} decisions | Date: ${fromYear}→${toYear}`);
  console.log(`  Strategy: ${searchTerms.length} norms × ${years.length} years = ${searchTerms.length * years.length} queries`);
  console.log(`  Per-norm-year cap: ${perNormYearLimit} | Output: ${outDir}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Phase 1: Norm × Year matrix search
  for (const term of searchTerms) {
    if (totalFetched >= target) break;

    let normTotal = 0;
    for (const year of years) {
      if (totalFetched >= target) break;

      const yearFrom = `${year}-01-01`;
      const yearTo = `${year}-12-31`;
      let yearCount = 0;

      for (let page = 1; page <= 50 && yearCount < perNormYearLimit; page++) {
        if (totalFetched >= target) break;

        let refs: Array<Record<string, unknown>>;
        try {
          refs = await fetchRisSearch(term, page, court.applikation, yearFrom, yearTo);
        } catch (err) {
          console.error(`  ${term}/${year} page ${page} failed: ${err}`);
          break;
        }
        if (refs.length === 0) break;

        for (const ref of refs) {
          if (yearCount >= perNormYearLimit || totalFetched >= target) break;
          const item = mapRisReference(ref, new Date());
          if (!item) continue;

          const id = item.id.replace(/^ris-/, "");
          if (seen.has(id)) {
            totalSkipped++;
            continue;
          }
          seen.add(id);
          totalFetched++;
          yearCount++;
          normTotal++;

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

          const slugDate = doc.date.split("T")[0];
          const slugAz = slugify(doc.az || id);
          const filename = `${slugDate}-${slugAz}.md`;
          const filepath = join(outDir, filename);

          if (existsSync(filepath)) {
            totalSkipped++;
            continue;
          }

          const markdown = buildMarkdown(doc, courtKey);
          writeFileSync(filepath, markdown, "utf-8");
          totalWritten++;

          if (totalWritten % 100 === 0 || totalWritten <= 5) {
            const textPreview = fullText ? `${fullText.length} chars` : "no text";
            console.log(`  [${totalWritten}] ${doc.court} ${doc.az} (${slugDate}) — ${textPreview}`);
          }

          await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
        }

        if (refs.length < 100) break;
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }

      if (yearCount > 0) {
        console.log(`  ${term}/${year}: +${yearCount} (norm total: ${normTotal}, grand total: ${totalFetched})`);
      }
      if (totalFetched < target) await new Promise((r) => setTimeout(r, 100));
    }

    if (normTotal > 0) {
      console.log(`  → ${term}: ${normTotal} total (grand: ${totalFetched})`);
    }
  }

  // Phase 2: Topic-based queries for broader coverage (OGH only, if target not met)
  if (courtKey === "ogh" && totalFetched < target) {
    console.log(`\n=== Phase 2: Topic queries (total: ${totalFetched}/${target}) ===`);
    for (const topic of TOPIC_QUERIES) {
      if (totalFetched >= target) break;
      console.log(`\n  Topic: ${topic}`);
      let topicCount = 0;
      const topicLimit = Math.ceil((target - totalFetched) / TOPIC_QUERIES.length) + 5;

      for (let page = 1; page <= 50 && topicCount < topicLimit; page++) {
        if (totalFetched >= target) break;
        let refs: Array<Record<string, unknown>>;
        try {
          refs = await fetchRisSearch(topic, page, court.applikation, dateFrom);
        } catch (err) {
          console.error(`  Page ${page} failed: ${err}`);
          break;
        }
        if (refs.length === 0) break;

        for (const ref of refs) {
          if (topicCount >= topicLimit || totalFetched >= target) break;
          const item = mapRisReference(ref, new Date());
          if (!item) continue;
          const id = item.id.replace(/^ris-/, "");
          if (seen.has(id)) { totalSkipped++; continue; }
          seen.add(id);
          totalFetched++;
          topicCount++;

          let fullText = "";
          if (!skipText) {
            const htmlUrl = extractHtmlUrl(ref);
            fullText = await fetchRisFullText(htmlUrl);
          }

          const doc: JudikaturDoc = {
            id, court: item.court, date: item.date, az: item.az ?? "",
            ecli: item.ecli, legalArea: item.legalArea, keywords: item.keywords,
            text: fullText, url: item.url, title: item.title,
          };

          const slugDate = doc.date.split("T")[0];
          const slugAz = slugify(doc.az || id);
          const filename = `${slugDate}-${slugAz}.md`;
          const filepath = join(outDir, filename);
          if (existsSync(filepath)) { totalSkipped++; continue; }

          writeFileSync(filepath, buildMarkdown(doc, courtKey), "utf-8");
          totalWritten++;
          if (totalWritten % 100 === 0) {
            console.log(`  [${totalWritten}] ${doc.court} ${doc.az} (${slugDate})`);
          }
          await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
        }
        if (refs.length < 100) break;
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }
      console.log(`  → ${topicCount} for ${topic}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY — ${court.label}`);
  console.log(`  Fetched: ${totalFetched}`);
  console.log(`  Written: ${totalWritten}`);
  console.log(`  Skipped (duplicates): ${totalSkipped}`);
  console.log(`  Output: ${outDir}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`\nImport with:`);
  console.log(`  bun run scripts/import-judikatur.ts --source ${courtKey}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
